//! Ollama HTTP client.

use std::time::Duration;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::models::Settings;

pub struct Ollama {
    pub(crate) http: reqwest::Client,
    pub base_url: String,
    pub model: Option<String>,
}

impl Ollama {
    pub async fn from_settings(pool: &SqlitePool) -> Result<Self> {
        let base_url = Settings::get(pool, "ollama_url")
            .await?
            .unwrap_or_else(|| "http://localhost:11434".into());
        let timeout_secs: u64 = Settings::get(pool, "ollama_timeout")
            .await?
            .and_then(|v| v.parse().ok())
            .unwrap_or(60);
        let model = Settings::get(pool, "ollama_model").await?;
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(timeout_secs))
                .build()?,
            base_url,
            model,
        })
    }

    pub async fn ping(&self) -> Result<bool> {
        let url = format!("{}/api/tags", self.base_url);
        Ok(self
            .http
            .get(&url)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false))
    }

    pub async fn list_models(&self) -> Result<Vec<String>> {
        let url = format!("{}/api/tags", self.base_url);
        let resp = self.http.get(&url).send().await?.error_for_status()?;
        let v: Value = resp.json().await?;
        let models = v
            .get("models")
            .and_then(|m| m.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        m.get("name")
                            .and_then(|n| n.as_str())
                            .map(|s| s.to_string())
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(models)
    }

    pub async fn pull_model(&self, name: &str) -> Result<()> {
        let url = format!("{}/api/pull", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&json!({ "name": name, "stream": false }))
            .send()
            .await?;
        resp.error_for_status()?;
        Ok(())
    }

    pub async fn generate(&self, prompt: &str) -> Result<String> {
        let model = self
            .model
            .clone()
            .ok_or_else(|| anyhow!("no Ollama model configured"))?;
        let url = format!("{}/api/generate", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&json!({ "model": model, "prompt": prompt, "stream": false }))
            .send()
            .await?
            .error_for_status()?;
        let v: Value = resp.json().await?;
        Ok(v.get("response")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string())
    }

    pub async fn generate_stream(
        &self,
        prompt: &str,
    ) -> Result<impl futures::Stream<Item = reqwest::Result<bytes::Bytes>>> {
        let model = self
            .model
            .clone()
            .ok_or_else(|| anyhow!("no Ollama model configured"))?;
        let url = format!("{}/api/generate", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&json!({ "model": model, "prompt": prompt, "stream": true }))
            .send()
            .await?
            .error_for_status()?;
        Ok(resp.bytes_stream())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Recommendation {
    pub query: String,
    pub reason: String,
    pub category: String,
}

/// Fallback set used when Ollama is offline or AI enhancement is disabled.
pub fn fallback_recommendations() -> Vec<Recommendation> {
    vec![
        rec("documentation", "core project files", "start here"),
        rec("notes", "personal notes + journals", "personal"),
        rec("readme", "project READMEs", "code"),
        rec("invoice", "billing + receipts", "finance"),
        rec("resume", "CVs + portfolios", "career"),
    ]
}

fn rec(q: &str, r: &str, c: &str) -> Recommendation {
    Recommendation {
        query: q.into(),
        reason: r.into(),
        category: c.into(),
    }
}

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

    /// Suggest follow-up search queries from the user's recent searches.
    /// Returns `[]` if the model output can't be parsed (caller falls back).
    pub async fn recommend_from_history(&self, history: &[String]) -> Result<Vec<Recommendation>> {
        let model = self
            .model
            .clone()
            .ok_or_else(|| anyhow!("no Ollama model configured"))?;
        let mut prompt = String::from(
            "You suggest follow-up search queries for a personal, local document \
             search app. Based on the user's recent searches, propose 5 NEW, \
             related queries they'd likely find useful next.\n\nRecent searches \
             (most recent first):\n",
        );
        for (i, h) in history.iter().enumerate() {
            prompt.push_str(&format!("{}. {h}\n", i + 1));
        }
        prompt.push_str(
            "\nReturn ONLY a JSON array of up to 5 objects, each with keys \
             \"query\" (1-4 words), \"reason\" (a short phrase, under 8 words), \
             and \"category\" (one word). No prose, no markdown fences.",
        );

        let url = format!("{}/api/generate", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&json!({ "model": model, "prompt": prompt, "stream": false, "format": "json" }))
            .send()
            .await?
            .error_for_status()?;
        let v: Value = resp.json().await?;
        let text = v.get("response").and_then(|s| s.as_str()).unwrap_or("");
        Ok(parse_recommendations(text))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Recommendation {
    pub query: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub category: String,
}

/// Best-effort parse of an LLM's recommendation output into `Recommendation`s.
/// Tolerates a bare JSON array, an object wrapping the array under a common key,
/// or an array embedded in surrounding text/markdown. Returns `[]` on failure so
/// the caller can fall back to the static set.
fn parse_recommendations(text: &str) -> Vec<Recommendation> {
    if let Ok(v) = serde_json::from_str::<Vec<Recommendation>>(text) {
        return v.into_iter().take(8).collect();
    }
    if let Ok(obj) = serde_json::from_str::<Value>(text) {
        for key in ["recommendations", "queries", "suggestions", "results"] {
            if let Some(arr) = obj.get(key).and_then(|a| a.as_array()) {
                let v: Vec<Recommendation> = arr
                    .iter()
                    .filter_map(|x| serde_json::from_value(x.clone()).ok())
                    .collect();
                if !v.is_empty() {
                    return v.into_iter().take(8).collect();
                }
            }
        }
    }
    if let (Some(start), Some(end)) = (text.find('['), text.rfind(']')) {
        if end > start {
            if let Ok(v) = serde_json::from_str::<Vec<Recommendation>>(&text[start..=end]) {
                return v.into_iter().take(8).collect();
            }
        }
    }
    Vec::new()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_recs_bare_array() {
        let t = r#"[{"query":"q1","reason":"r","category":"c"},{"query":"q2"}]"#;
        let v = parse_recommendations(t);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].query, "q1");
        assert_eq!(v[1].reason, ""); // missing field defaults to empty
    }

    #[test]
    fn parse_recs_object_wrapped() {
        let t = r#"{"recommendations":[{"query":"x","reason":"y","category":"z"}]}"#;
        assert_eq!(parse_recommendations(t).len(), 1);
    }

    #[test]
    fn parse_recs_embedded_in_text() {
        let t = "Sure:\n```json\n[{\"query\":\"a\"}]\n```\nhope that helps";
        assert_eq!(parse_recommendations(t).len(), 1);
    }

    #[test]
    fn parse_recs_garbage_is_empty() {
        assert!(parse_recommendations("not json at all").is_empty());
        assert!(parse_recommendations("").is_empty());
    }
}

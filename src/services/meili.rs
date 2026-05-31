//! Meilisearch configuration + HTTP client.
//!
//! Uses `reqwest` directly against the REST API rather than a vendored SDK,
//! so we have one dependency instead of two and a single upgrade path.

use std::env;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::models::Settings;

/// Meilisearch index name. Single-index layout — all doc sources (folders,
/// vault uploads, torrents) live in the same index, distinguished by the
/// `source` field.
pub const INDEX_NAME: &str = "documents";

#[derive(Debug, Clone, Serialize)]
pub struct MeiliClientConfig {
    pub host: String,
    pub api_key: String,
}

/// Browser-facing config injected into templates.
pub async fn client_config(pool: &SqlitePool) -> Result<MeiliClientConfig> {
    let public_host = env::var("MEILI_PUBLIC_HOST")
        .ok()
        .or(Settings::get(pool, "meilisearch_host").await?)
        .unwrap_or_else(|| "http://localhost".into());
    let port = Settings::get(pool, "meilisearch_port")
        .await?
        .unwrap_or_else(|| "7700".into());
    let api_key = Settings::get(pool, "master_key")
        .await?
        .unwrap_or_else(|| "aSampleMasterKey".into());

    Ok(MeiliClientConfig {
        host: format!("{public_host}:{port}"),
        api_key,
    })
}

/// Server-side Meilisearch handle (reads from DB settings on every construction;
/// cheap, and settings can change without restart).
pub struct Meili {
    http: reqwest::Client,
    pub base_url: String,
    pub api_key: String,
}

impl Meili {
    pub async fn from_settings(pool: &SqlitePool) -> Result<Self> {
        let host = Settings::get(pool, "meilisearch_host")
            .await?
            .unwrap_or_else(|| "http://localhost".into());
        let port = Settings::get(pool, "meilisearch_port")
            .await?
            .unwrap_or_else(|| "7700".into());
        let api_key = Settings::get(pool, "master_key")
            .await?
            .unwrap_or_else(|| "aSampleMasterKey".into());
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()?,
            base_url: format!("{host}:{port}"),
            api_key,
        })
    }

    pub async fn ping(&self) -> Result<bool> {
        let url = format!("{}/health", self.base_url);
        match self.http.get(&url).send().await {
            Ok(r) => Ok(r.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    pub async fn version(&self) -> Result<Option<String>> {
        let url = format!("{}/version", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Ok(None);
        }
        let v: Value = resp.json().await?;
        Ok(v.get("pkgVersion")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string()))
    }

    pub async fn stats(&self) -> Result<Value> {
        let url = format!("{}/stats", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?
            .error_for_status()?;
        Ok(resp.json().await?)
    }

    pub async fn ensure_index(&self) -> Result<()> {
        let url = format!("{}/indexes", self.base_url);
        let body = json!({ "uid": INDEX_NAME, "primaryKey": "id" });
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;
        // 201 (created) or 202 (task queued) or 400 (already exists) — all fine.
        let status = resp.status();
        if status.is_success() || status.as_u16() == 400 {
            Ok(())
        } else {
            let text = resp.text().await.unwrap_or_default();
            Err(anyhow!("ensure_index: {status}: {text}"))
        }
    }

    pub async fn configure_index(&self) -> Result<()> {
        let url = format!("{}/indexes/{INDEX_NAME}/settings", self.base_url);
        let body = json!({
            "searchableAttributes": ["filename", "content", "original_filename"],
            "displayedAttributes":  ["*"],
            "filterableAttributes": ["file_type", "source", "torrent_hash", "archive_path", "has_images", "is_image"],
            "sortableAttributes":   ["filename", "uploaded_at", "indexed_at", "file_size"],
        });
        let resp = self
            .http
            .patch(&url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;
        resp.error_for_status()?;
        Ok(())
    }

    pub async fn add_documents(&self, docs: &Value) -> Result<Value> {
        let url = format!("{}/indexes/{INDEX_NAME}/documents", self.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(docs)
            .send()
            .await?
            .error_for_status()?;
        Ok(resp.json().await?)
    }

    pub async fn delete_document(&self, doc_id: &str) -> Result<()> {
        let url = format!(
            "{}/indexes/{INDEX_NAME}/documents/{}",
            self.base_url,
            urlencoding::encode(doc_id)
        );
        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        if !resp.status().is_success() && resp.status().as_u16() != 404 {
            return Err(anyhow!("delete_document failed: {}", resp.status()));
        }
        Ok(())
    }

    pub async fn delete_documents_by_filter(&self, filter: &Value) -> Result<Value> {
        let url = format!("{}/indexes/{INDEX_NAME}/documents/delete", self.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(filter)
            .send()
            .await?
            .error_for_status()?;
        Ok(resp.json().await?)
    }

    pub async fn clear_documents(&self) -> Result<()> {
        let url = format!("{}/indexes/{INDEX_NAME}/documents", self.base_url);
        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        resp.error_for_status()?;
        Ok(())
    }

    pub async fn list_documents(&self, limit: u32, offset: u32) -> Result<Value> {
        let url = format!(
            "{}/indexes/{INDEX_NAME}/documents?limit={limit}&offset={offset}",
            self.base_url
        );
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?
            .error_for_status()?;
        Ok(resp.json().await?)
    }

    pub async fn get_document(&self, doc_id: &str) -> Result<Option<Value>> {
        let url = format!(
            "{}/indexes/{INDEX_NAME}/documents/{}",
            self.base_url,
            urlencoding::encode(doc_id)
        );
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        if resp.status().as_u16() == 404 {
            return Ok(None);
        }
        let resp = resp.error_for_status()?;
        Ok(Some(resp.json().await?))
    }
}

/// Saved Meilisearch config, safe for display (no master key).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafeConfig {
    pub meilisearch_path: Option<String>,
    pub host: String,
    pub port: String,
    pub auto_start: bool,
    pub data_path: Option<String>,
    pub master_key_set: bool,
    pub ai_search_enabled: bool,
    pub ollama_url: Option<String>,
    pub ollama_model: Option<String>,
}

pub async fn safe_config(pool: &SqlitePool) -> Result<SafeConfig> {
    let host = Settings::get_or(pool, "meilisearch_host", "http://localhost").await?;
    let port = Settings::get_or(pool, "meilisearch_port", "7700").await?;
    Ok(SafeConfig {
        meilisearch_path: Settings::get(pool, "meilisearch_path").await?,
        host,
        port,
        auto_start: Settings::get(pool, "auto_start")
            .await?
            .map(|v| matches!(v.to_ascii_lowercase().as_str(), "true" | "1" | "yes"))
            .unwrap_or(true),
        data_path: Settings::get(pool, "data_path").await?,
        master_key_set: Settings::get(pool, "master_key")
            .await?
            .map(|s| !s.is_empty())
            .unwrap_or(false),
        ai_search_enabled: Settings::get(pool, "ai_search_enabled")
            .await?
            .map(|v| matches!(v.to_ascii_lowercase().as_str(), "true" | "1" | "yes"))
            .unwrap_or(false),
        ollama_url: Settings::get(pool, "ollama_url").await?,
        ollama_model: Settings::get(pool, "ollama_model").await?,
    })
}

/// Persist settings from `/api/meilisearch/config` POST.
#[derive(Debug, Deserialize)]
pub struct ConfigPatch {
    pub meilisearch_path: Option<String>,
    pub meilisearch_host: Option<String>,
    pub meilisearch_port: Option<String>,
    pub auto_start: Option<bool>,
    pub master_key: Option<String>,
    pub data_path: Option<String>,
    pub ai_search_enabled: Option<bool>,
    pub ollama_url: Option<String>,
    pub ollama_model: Option<String>,
    pub ollama_timeout: Option<String>,
    pub ollama_autoconnect: Option<bool>,
}

pub async fn apply_config_patch(pool: &SqlitePool, patch: ConfigPatch) -> Result<()> {
    async fn put(pool: &SqlitePool, k: &str, v: Option<&str>) -> Result<()> {
        if let Some(val) = v {
            Settings::set(pool, k, Some(val)).await?;
        }
        Ok(())
    }
    async fn put_bool(pool: &SqlitePool, k: &str, v: Option<bool>) -> Result<()> {
        if let Some(val) = v {
            Settings::set(pool, k, Some(&val.to_string())).await?;
        }
        Ok(())
    }

    // SSRF guard: only http(s) URLs are accepted.
    if let Some(u) = patch.ollama_url.as_ref() {
        if !(u.is_empty() || u.starts_with("http://") || u.starts_with("https://")) {
            return Err(anyhow!("ollama_url must start with http:// or https://"));
        }
    }
    // Validate Meilisearch binary path.
    if let Some(p) = patch.meilisearch_path.as_ref() {
        if !p.is_empty() {
            let pb = std::path::PathBuf::from(p);
            if !pb.is_file() {
                return Err(anyhow!("meilisearch_path is not a file"));
            }
            let stem = pb
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !stem.contains("meilisearch") {
                return Err(anyhow!(
                    "meilisearch_path basename must contain 'meilisearch'"
                ));
            }
        }
    }
    // The Meilisearch data path must be absolute. A relative path resolves
    // against searchbox's cwd, which under a Program Files (MSI) install is
    // read-only — Meilisearch would fail to start there.
    if let Some(p) = patch.data_path.as_ref() {
        if !p.is_empty() && !std::path::Path::new(p).is_absolute() {
            return Err(anyhow!("data_path must be an absolute path"));
        }
    }

    put(pool, "meilisearch_path", patch.meilisearch_path.as_deref())
        .await
        .context("save path")?;
    put(pool, "meilisearch_host", patch.meilisearch_host.as_deref()).await?;
    put(pool, "meilisearch_port", patch.meilisearch_port.as_deref()).await?;
    put_bool(pool, "auto_start", patch.auto_start).await?;
    put(pool, "master_key", patch.master_key.as_deref()).await?;
    put(pool, "data_path", patch.data_path.as_deref()).await?;
    put_bool(pool, "ai_search_enabled", patch.ai_search_enabled).await?;
    put(pool, "ollama_url", patch.ollama_url.as_deref()).await?;
    put(pool, "ollama_model", patch.ollama_model.as_deref()).await?;
    put(pool, "ollama_timeout", patch.ollama_timeout.as_deref()).await?;
    put_bool(pool, "ollama_autoconnect", patch.ollama_autoconnect).await?;
    Ok(())
}

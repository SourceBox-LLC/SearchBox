//! `/api/qbittorrent/*` — qBittorrent integration.
//!
//! Thin wrapper over qBittorrent's Web API v2. Torrent file-content sync
//! pipes each torrent's save_path through the folder indexer.

use std::time::Duration;

use axum::extract::State;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::AppResult;
use crate::jobs::{JobRegistry, JobStatus};
use crate::models::{QbTorrent, Settings};
use crate::services::meili::Meili;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/qbittorrent/status", get(status))
        .route("/api/qbittorrent/config", get(get_config).post(post_config))
        .route("/api/qbittorrent/test", post(test_conn))
        .route("/api/qbittorrent/torrents", get(list_torrents))
        .route("/api/qbittorrent/indexed", get(list_indexed))
        .route("/api/qbittorrent/remove", post(remove_torrent))
        .route("/api/qbittorrent/sync", post(sync_torrents))
}

// ── qBittorrent Web API client ────────────────────────────────────────────

struct QbtClient {
    http: reqwest::Client,
    base_url: String,
}

impl QbtClient {
    async fn from_settings(pool: &sqlx::SqlitePool) -> anyhow::Result<Self> {
        let host = Settings::get(pool, "qbt_host")
            .await?
            .unwrap_or_else(|| "http://localhost".into());
        let port = Settings::get(pool, "qbt_port")
            .await?
            .unwrap_or_else(|| "8080".into());
        let username = Settings::get(pool, "qbt_username").await?;
        let password = Settings::get(pool, "qbt_password").await?;

        let http = reqwest::Client::builder()
            .cookie_store(true)
            .timeout(Duration::from_secs(15))
            .build()?;
        let base_url = format!("{host}:{port}");

        // Login — anonymous qbt instances skip this.
        if username.is_some() && password.is_some() {
            let form = [
                ("username", username.as_deref().unwrap_or("")),
                ("password", password.as_deref().unwrap_or("")),
            ];
            let _ = http
                .post(format!("{base_url}/api/v2/auth/login"))
                .form(&form)
                .send()
                .await;
        }

        Ok(Self { http, base_url })
    }

    async fn version(&self) -> anyhow::Result<String> {
        let url = format!("{}/api/v2/app/version", self.base_url);
        // qBittorrent returns 403 "Forbidden" as a 200-status text body when
        // the session isn't authenticated, so guard against that too.
        let resp = self.http.get(&url).send().await?.error_for_status()?;
        let body = resp.text().await?;
        if body.eq_ignore_ascii_case("forbidden") {
            return Err(anyhow::anyhow!("qbittorrent rejected request (forbidden)"));
        }
        Ok(body)
    }

    async fn torrents(&self, filter: &str) -> anyhow::Result<Vec<Value>> {
        let url = format!("{}/api/v2/torrents/info?filter={}", self.base_url, filter);
        let resp = self.http.get(&url).send().await?.error_for_status()?;
        Ok(resp.json().await?)
    }
}

// ── Route handlers ────────────────────────────────────────────────────────

async fn status(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let enabled = Settings::get(&state.db, "qbt_enabled")
        .await?
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "true" | "1" | "yes"))
        .unwrap_or(false);
    if !enabled {
        return Ok(Json(json!({ "enabled": false, "connected": false })));
    }
    let c = QbtClient::from_settings(&state.db).await?;
    let version = c.version().await.ok();
    Ok(Json(json!({
        "enabled": true,
        "connected": version.is_some(),
        "version": version,
    })))
}

#[derive(Debug, Serialize, Deserialize)]
struct QbtConfigPayload {
    qbt_enabled: Option<bool>,
    qbt_host: Option<String>,
    qbt_port: Option<String>,
    qbt_username: Option<String>,
    #[serde(skip_serializing)]
    qbt_password: Option<String>,
}

async fn get_config(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    Ok(Json(json!({
        "qbt_enabled": Settings::get(&state.db, "qbt_enabled").await?.map(|v| matches!(v.to_ascii_lowercase().as_str(), "true" | "1" | "yes")).unwrap_or(false),
        "qbt_host":    Settings::get(&state.db, "qbt_host").await?,
        "qbt_port":    Settings::get(&state.db, "qbt_port").await?,
        "qbt_username":Settings::get(&state.db, "qbt_username").await?,
    })))
}

async fn post_config(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(cfg): Json<QbtConfigPayload>,
) -> AppResult<Json<Value>> {
    if let Some(v) = cfg.qbt_enabled {
        Settings::set(&state.db, "qbt_enabled", Some(&v.to_string())).await?;
    }
    if let Some(v) = cfg.qbt_host.as_ref() {
        Settings::set(&state.db, "qbt_host", Some(v)).await?;
    }
    if let Some(v) = cfg.qbt_port.as_ref() {
        Settings::set(&state.db, "qbt_port", Some(v)).await?;
    }
    if let Some(v) = cfg.qbt_username.as_ref() {
        Settings::set(&state.db, "qbt_username", Some(v)).await?;
    }
    if let Some(v) = cfg.qbt_password.as_ref() {
        Settings::set(&state.db, "qbt_password", Some(v)).await?;
    }
    Ok(Json(json!({ "success": true })))
}

async fn test_conn(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(_cfg): Json<QbtConfigPayload>,
) -> AppResult<Json<Value>> {
    // For now reuse current persisted creds. Distinct ephemeral credentials
    // is a follow-up.
    let c = QbtClient::from_settings(&state.db).await?;
    let ok = c.version().await.is_ok();
    Ok(Json(json!({ "connected": ok })))
}

async fn list_torrents(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let c = QbtClient::from_settings(&state.db).await?;
    let completed = c.torrents("completed").await.unwrap_or_default();
    let active = c.torrents("active").await.unwrap_or_default();
    let indexed = QbTorrent::indexed_hashes(&state.db).await?;

    let map = |arr: Vec<Value>, is_active: bool| {
        arr.into_iter()
            .map(|t| {
                let hash = t
                    .get("hash")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                json!({
                    "hash":     &hash,
                    "name":     t.get("name"),
                    "state":    t.get("state"),
                    "progress": t.get("progress"),
                    "indexed":  indexed.contains(&hash),
                    "active":   is_active,
                })
            })
            .collect::<Vec<_>>()
    };

    let mut out = map(completed, false);
    out.extend(map(active, true));
    Ok(Json(json!({ "torrents": out })))
}

async fn list_indexed(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let rows = QbTorrent::all(&state.db).await?;
    Ok(Json(json!({ "torrents": rows })))
}

#[derive(Deserialize)]
struct HashBody {
    torrent_hash: String,
}

async fn remove_torrent(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<HashBody>,
) -> AppResult<Json<Value>> {
    // Look up the save_path before deleting the row so we can also purge
    // Meili docs whose file_path starts with that directory.
    let record = QbTorrent::get(&state.db, &body.torrent_hash).await?;
    QbTorrent::remove(&state.db, &body.torrent_hash).await?;

    let mut deletion_task: Option<Value> = None;
    if let Some(r) = record.as_ref() {
        if !r.save_path.is_empty() {
            if let Ok(m) = Meili::from_settings(&state.db).await {
                let filter = json!({
                    "filter": format!(
                        "file_path STARTS WITH \"{}\"",
                        r.save_path.replace('\\', "\\\\").replace('"', "\\\"")
                    )
                });
                match m.delete_documents_by_filter(&filter).await {
                    Ok(task) => {
                        tracing::info!(
                            ?task,
                            "issued Meili delete-by-filter for torrent {} ({})",
                            body.torrent_hash,
                            r.save_path
                        );
                        deletion_task = Some(task);
                    }
                    Err(e) => tracing::warn!(
                        "Meili delete-by-filter failed for torrent {}: {e}",
                        body.torrent_hash
                    ),
                }
            }
        }
    }

    Ok(Json(json!({
        "success": true,
        "deletion_task": deletion_task,
    })))
}

async fn sync_torrents(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
) -> AppResult<Json<Value>> {
    let c = QbtClient::from_settings(&state.db).await?;
    let completed = c.torrents("completed").await.unwrap_or_default();
    let known = QbTorrent::indexed_hashes(&state.db).await?;

    let mut added = 0u64;
    let mut indexed = 0u64;
    for t in &completed {
        let hash = t.get("hash").and_then(|v| v.as_str()).unwrap_or("");
        if hash.is_empty() {
            continue;
        }
        let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let save_path = t.get("save_path").and_then(|v| v.as_str()).unwrap_or("");

        if !known.contains(hash) {
            QbTorrent::add(&state.db, hash, name, save_path, 0).await?;
            added += 1;
        }

        // Index newly-added torrents only — a completed torrent's files don't
        // change, so re-syncing shouldn't re-index (and re-spawn a job for)
        // everything every time. Pipes the save_path through the folder indexer.
        if !known.contains(hash)
            && !save_path.is_empty()
            && std::path::Path::new(save_path).is_dir()
        {
            let meili = match Meili::from_settings(&state.db).await {
                Ok(m) => m,
                Err(e) => {
                    tracing::warn!("failed to create Meili client for qbt sync: {e}");
                    continue;
                }
            };
            let job_id = JobRegistry::new_id();
            let mut job = JobStatus::new(job_id.clone());
            job.folder = Some(save_path.to_string());
            state.jobs.insert(job);

            let jobs = state.jobs.clone();
            let folder = save_path.to_string();
            let job_id_bg = job_id.clone();
            let thumb_dir = state.config.thumbnails_dir.clone();
            tokio::task::spawn(async move {
                let _ = crate::routes::folders::index_folder_task(
                    &folder,
                    &meili,
                    &jobs,
                    &job_id_bg,
                    &thumb_dir,
                    "qbittorrent",
                )
                .await;
                jobs.update(&job_id_bg, |j| {
                    if j.status == "running" {
                        j.status = "completed".into();
                    }
                });
            });
            indexed += 1;
        }
    }

    Ok(Json(
        json!({ "success": true, "torrents_added": added, "folders_indexed": indexed }),
    ))
}

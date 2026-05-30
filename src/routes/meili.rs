//! `/api/meilisearch/*` — Meilisearch sidecar control + config.

use axum::extract::State;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::services::meili::{apply_config_patch, safe_config, ConfigPatch, Meili};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/meilisearch/status", get(status))
        .route("/api/meilisearch/start", post(start))
        .route("/api/meilisearch/stop", post(stop))
        .route("/api/meilisearch/config", get(get_config).post(post_config))
        .route("/api/meilisearch/clear", post(clear))
}

async fn status(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let cfg = safe_config(&state.db).await?;
    let m = Meili::from_settings(&state.db).await?;
    let running = m.ping().await.unwrap_or(false);
    let version = if running {
        m.version().await.unwrap_or(None)
    } else {
        None
    };
    let stats = if running { m.stats().await.ok() } else { None };
    Ok(Json(json!({
        "running": running,
        "host": cfg.host,
        "port": cfg.port,
        "auto_start": cfg.auto_start,
        "version": version,
        "stats": stats,
    })))
}

async fn start(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
) -> AppResult<Json<Value>> {
    state
        .meili_proc
        .start(&state.config, &state.db)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(json!({ "success": true })))
}

async fn stop(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
) -> AppResult<Json<Value>> {
    state.meili_proc.stop().await.map_err(AppError::Internal)?;
    Ok(Json(json!({ "success": true })))
}

async fn get_config(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let cfg = safe_config(&state.db).await?;
    Ok(Json(serde_json::to_value(cfg).unwrap()))
}

async fn post_config(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(patch): Json<ConfigPatch>,
) -> AppResult<Json<Value>> {
    apply_config_patch(&state.db, patch)
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    Ok(Json(json!({ "success": true })))
}

async fn clear(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
) -> AppResult<Json<Value>> {
    let m = Meili::from_settings(&state.db).await?;
    m.clear_documents().await?;
    Ok(Json(json!({ "success": true })))
}

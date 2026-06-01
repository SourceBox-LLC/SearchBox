//! `/api/update/*` — opt-in update check against GitHub Releases, plus a local
//! `/api/version` (no network). `check`/`apply` reach out to GitHub only when
//! the user asks (a manual click, or the opt-in auto-check on startup).

use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::services::updater;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/version", get(version))
        .route("/api/update/check", get(check))
        .route("/api/update/apply", post(apply))
}

/// Local only — just reports this build's version (no outbound request).
async fn version(_: CurrentUser) -> Json<Value> {
    Json(json!({ "version": updater::CURRENT }))
}

/// Reaches out to GitHub for the latest release and compares versions.
async fn check(_: CurrentUser) -> AppResult<Json<Value>> {
    let rel = updater::latest_release()
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(json!({
        "current": updater::CURRENT,
        "latest": rel.version,
        "update_available": updater::is_newer(&rel.version, updater::CURRENT),
        "download_url": rel.msi_url,
        "release_url": rel.release_url,
    })))
}

/// Download the latest MSI and launch the installer (Windows). The app stays
/// open; the Windows Installer prompts to close it, then upgrades in place.
async fn apply(_: CurrentUser, _: CsrfToken) -> AppResult<Json<Value>> {
    let rel = updater::latest_release()
        .await
        .map_err(AppError::Internal)?;
    if !updater::is_newer(&rel.version, updater::CURRENT) {
        return Err(AppError::BadRequest("already on the latest version".into()));
    }
    let url = rel.msi_url.ok_or_else(|| {
        AppError::BadRequest("the latest release has no installer for this platform".into())
    })?;
    updater::download_and_launch(&url)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(json!({ "success": true, "updating_to": rel.version })))
}

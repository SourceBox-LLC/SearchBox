//! `/api/vault/*` — vault status + reset.

use axum::extract::State;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::models::{EncryptedFile, VaultConfig};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/vault/status", get(status))
        .route("/api/vault/reset", post(reset))
}

async fn status(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let cfg = VaultConfig::get(&state.db).await?;
    let files = EncryptedFile::count(&state.db).await?;
    Ok(Json(json!({
        "encryption_enabled": cfg.is_some(),
        "files_encrypted": files,
    })))
}

#[derive(Deserialize, Default)]
struct ConfirmBody {
    #[serde(default)]
    confirm: bool,
}

async fn reset(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    body: Option<Json<ConfirmBody>>,
) -> AppResult<Json<Value>> {
    let confirmed = body.map(|Json(b)| b.confirm).unwrap_or(false);
    if !confirmed {
        return Err(AppError::BadRequest(
            "pass {\"confirm\":true} to wipe the vault".into(),
        ));
    }
    let mut deleted = 0u64;
    for f in EncryptedFile::all(&state.db).await? {
        let path = state.config.vault_dir.join(&f.encrypted_filename);
        let _ = std::fs::remove_file(path);
        deleted += 1;
    }
    EncryptedFile::clear_all(&state.db).await?;
    VaultConfig::clear(&state.db).await?;
    Ok(Json(json!({ "success": true, "deleted_files": deleted })))
}

//! `/api/vault/*` — vault status, unlock, and reset.

use axum::extract::State;
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use tower_sessions::Session;

use crate::auth::{verify_password, CsrfToken, CurrentUser, SessionUser, SESSION_USER_KEY};
use crate::error::{AppError, AppResult};
use crate::models::{EncryptedFile, User, VaultConfig};
use crate::state::AppState;
use crate::vault::crypto;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/vault/status", get(status))
        .route("/api/vault/unlock", post(unlock))
        .route("/api/vault/reset", post(reset))
}

async fn status(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    let configured = VaultConfig::get(&state.db).await?.is_some();
    let files = EncryptedFile::count(&state.db).await?;
    // "Locked" = a vault exists but this process can't currently produce its KEK
    // (none sealed into the session, or it was sealed before a restart).
    let locked = configured && crate::vault::current_kek(&state.vault_seal_key, &user.0).is_none();
    Ok(Json(json!({
        "encryption_enabled": configured,
        "files_encrypted": files,
        "locked": locked,
    })))
}

#[derive(Deserialize)]
struct UnlockBody {
    password: String,
}

/// Re-derive and re-seal the vault KEK from the password. Needed after a restart
/// (the in-memory seal key is regenerated, so the previously-sealed KEK can no
/// longer be opened) to regain access to encrypted files without logging out.
async fn unlock(
    State(state): State<AppState>,
    CurrentUser(current): CurrentUser,
    _: CsrfToken,
    session: Session,
    Json(body): Json<UnlockBody>,
) -> AppResult<Json<Value>> {
    let throttle_key = current.email.to_ascii_lowercase();
    if let Some(remaining) = state.login_throttle.check(&throttle_key) {
        return Err(AppError::TooManyRequests(format!(
            "too many attempts — try again in {}s",
            remaining.as_secs().max(1)
        )));
    }
    let user = User::get_by_id(&state.db, current.id)
        .await?
        .ok_or_else(|| AppError::Unauthorized("user not found".into()))?;
    if !verify_password(&body.password, &user.password_hash)? {
        state.login_throttle.record_failure(&throttle_key);
        return Err(AppError::Unauthorized("incorrect password".into()));
    }
    state.login_throttle.record_success(&throttle_key);

    let cfg = VaultConfig::get(&state.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("vault not configured".into()))?;
    let kek = crypto::derive_kek(&body.password, &cfg.salt);
    let sealed = crypto::seal_kek(&state.vault_seal_key, &kek).map_err(AppError::Internal)?;
    let refreshed = SessionUser {
        vault_kek_sealed: Some(sealed),
        ..current
    };
    session
        .insert(SESSION_USER_KEY, &refreshed)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    Ok(Json(json!({ "success": true })))
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

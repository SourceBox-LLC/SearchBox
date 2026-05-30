use axum::extract::{Form, State};
use axum::response::{IntoResponse, Json, Redirect};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use tower_sessions::Session;

use crate::auth::{
    get_or_create_csrf_token, hash_password, verify_password, CsrfToken, CurrentUser, SessionUser,
    CSRF_TOKEN_KEY, SESSION_USER_KEY,
};
use crate::error::{AppError, AppResult};
use crate::models::{EncryptedFile, NewUser, User, VaultConfig};
use crate::state::AppState;
use crate::vault::crypto;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/setup", post(setup_post))
        .route("/login", post(login_post))
        .route("/logout", post(logout))
        .route("/api/auth/status", get(status))
        .route("/api/auth/change-password", post(change_password))
}

#[derive(Deserialize)]
struct SetupForm {
    email: String,
    password: String,
    name: Option<String>,
    csrf_token: String,
}

async fn setup_post(
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<SetupForm>,
) -> AppResult<impl IntoResponse> {
    validate_csrf(&session, &form.csrf_token).await?;

    if User::count(&state.db).await? > 0 {
        return Err(AppError::BadRequest("setup already completed".into()));
    }
    if form.email.trim().is_empty() || form.password.len() < 8 {
        return Err(AppError::BadRequest(
            "email required, password >= 8 chars".into(),
        ));
    }
    let hash = hash_password(&form.password)?;
    let user = User::create(
        &state.db,
        NewUser {
            email: &form.email,
            password_hash: &hash,
            name: form.name.as_deref(),
            role: "owner",
        },
    )
    .await?;

    // Initialize the per-install vault salt so uploads can encrypt on
    // this session without a separate "enable vault" step. The salt is
    // stable for the life of the install; changing the admin password
    // is handled by rewrapping every DEK, see change_password().
    let salt = crypto::generate_salt();
    let cfg = VaultConfig::ensure(&state.db, &salt).await?;
    let kek = crypto::derive_kek(&form.password, &cfg.salt);

    let sess_user = SessionUser {
        id: user.id,
        email: user.email.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
        vault_kek_hex: Some(hex::encode(kek)),
    };
    session
        .insert(SESSION_USER_KEY, &sess_user)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let _ = session.remove::<String>(CSRF_TOKEN_KEY).await;
    let _ = get_or_create_csrf_token(&session).await;

    Ok(Redirect::to("/"))
}

#[derive(Deserialize)]
struct LoginForm {
    email: String,
    password: String,
    csrf_token: String,
}

async fn login_post(
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<LoginForm>,
) -> AppResult<impl IntoResponse> {
    validate_csrf(&session, &form.csrf_token).await?;

    let user = User::get_by_email(&state.db, &form.email)
        .await?
        .ok_or_else(|| AppError::Unauthorized("invalid email or password".into()))?;
    if user.is_active == 0 {
        return Err(AppError::Unauthorized("account disabled".into()));
    }
    if !verify_password(&form.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("invalid email or password".into()));
    }

    User::update_last_login(&state.db, user.id).await?;

    let vault_kek_hex = match VaultConfig::get(&state.db).await? {
        Some(cfg) => Some(hex::encode(crypto::derive_kek(&form.password, &cfg.salt))),
        None => None,
    };

    let sess_user = SessionUser {
        id: user.id,
        email: user.email.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
        vault_kek_hex,
    };
    session
        .insert(SESSION_USER_KEY, &sess_user)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let _ = session.remove::<String>(CSRF_TOKEN_KEY).await;
    let _ = get_or_create_csrf_token(&session).await;

    Ok(Redirect::to("/"))
}

async fn validate_csrf(session: &Session, token: &str) -> AppResult<()> {
    let session_token: Option<String> = session
        .get(CSRF_TOKEN_KEY)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    match session_token {
        Some(ref st) if constant_time_eq(token, st) => Ok(()),
        _ => Err(AppError::BadRequest("invalid csrf token".into())),
    }
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let mut result = 0u8;
    for i in 0..a.len() {
        result |= a_bytes[i] ^ b_bytes[i];
    }
    result == 0
}

async fn logout(session: Session, _: CsrfToken) -> AppResult<Json<Value>> {
    session
        .flush()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    Ok(Json(json!({ "status": "ok" })))
}

async fn status(State(state): State<AppState>, session: Session) -> AppResult<Json<Value>> {
    let user: Option<SessionUser> = session
        .get(SESSION_USER_KEY)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    let setup_required = User::count(&state.db).await? == 0;

    Ok(Json(json!({
        "setup_required": setup_required,
        "authenticated": user.is_some(),
        "user": user.as_ref().map(|u| json!({
            "id": u.id, "email": u.email, "name": u.name, "role": u.role,
        })),
    })))
}

#[derive(Deserialize)]
struct ChangePasswordForm {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    CurrentUser(current): CurrentUser,
    session: Session,
    _: CsrfToken,
    Json(form): Json<ChangePasswordForm>,
) -> AppResult<Json<Value>> {
    if form.new_password.len() < 8 {
        return Err(AppError::BadRequest(
            "new password must be >= 8 chars".into(),
        ));
    }
    let user = User::get_by_id(&state.db, current.id)
        .await?
        .ok_or_else(|| AppError::Unauthorized("user not found".into()))?;
    if !verify_password(&form.current_password, &user.password_hash)? {
        return Err(AppError::Unauthorized("current password incorrect".into()));
    }

    // Rewrap every encrypted file's DEK under the new KEK so the vault
    // survives password changes. The salt is stable — only the KEK changes.
    let new_kek_hex = if let Some(cfg) = VaultConfig::get(&state.db).await? {
        let old_kek = crypto::derive_kek(&form.current_password, &cfg.salt);
        let new_kek = crypto::derive_kek(&form.new_password, &cfg.salt);
        for f in EncryptedFile::all(&state.db).await? {
            let dek = crypto::unwrap_dek(&old_kek, &f.wrapped_dek)
                .map_err(|e| AppError::Internal(e.context("rewrap DEK")))?;
            let rewrapped = crypto::wrap_dek(&new_kek, &dek).map_err(AppError::Internal)?;
            EncryptedFile::update_wrapped_dek(&state.db, &f.doc_id, &rewrapped).await?;
        }
        Some(hex::encode(new_kek))
    } else {
        None
    };

    let new_hash = hash_password(&form.new_password)?;
    User::update_password_hash(&state.db, user.id, &new_hash).await?;

    // Refresh the session's KEK so the current tab can keep serving vault docs.
    if new_kek_hex.is_some() {
        let refreshed = SessionUser {
            vault_kek_hex: new_kek_hex,
            ..current
        };
        session
            .insert(SESSION_USER_KEY, &refreshed)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
    }

    Ok(Json(json!({ "status": "ok" })))
}

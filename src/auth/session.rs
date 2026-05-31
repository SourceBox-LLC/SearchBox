use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::Json;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tower_sessions::Session;

use crate::error::{AppError, AppResult};

pub const SESSION_USER_KEY: &str = "user";
pub const CSRF_TOKEN_KEY: &str = "csrf_token";

/// Generate a random CSRF token (32 bytes, hex-encoded)
pub fn generate_csrf_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Serializable subset of a user stored in the session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUser {
    pub id: i64,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    /// Hex-encoded bytes of the vault KEK, or `None` if no vault is set up.
    pub vault_kek_hex: Option<String>,
}

/// Extractor that resolves to the logged-in user, or rejects with 401 (JSON)
/// for `/api/…` routes and a redirect to `/login` otherwise.
pub struct CurrentUser(pub SessionUser);

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
{
    type Rejection = AuthRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| AuthRejection::missing(parts))?;
        let user: Option<SessionUser> = session
            .get(SESSION_USER_KEY)
            .await
            .map_err(|_| AuthRejection::missing(parts))?;
        match user {
            Some(u) => Ok(CurrentUser(u)),
            None => Err(AuthRejection::missing(parts)),
        }
    }
}

/// Extractor that validates the `X-CSRFToken` header against the token
/// stored in the session. Mount it in handler signatures for destructive
/// JSON endpoints. Form routes use `validate_csrf` directly in `routes::auth`.
pub struct CsrfToken(#[allow(dead_code)] pub String);

impl<S> FromRequestParts<S> for CsrfToken
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "session error" })),
                )
            })?;

        let session_token: Option<String> = session.get(CSRF_TOKEN_KEY).await.map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "session error" })),
            )
        })?;

        let session_token = session_token.ok_or_else(|| {
            (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "csrf token missing from session" })),
            )
        })?;

        let header_token = parts
            .headers
            .get("X-CSRFToken")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        if header_token.is_empty() || !constant_time_eq(header_token, &session_token) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "invalid csrf token" })),
            ));
        }

        Ok(CsrfToken(session_token))
    }
}

/// Constant-time string comparison to prevent timing attacks
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

/// Get or create CSRF token for a session
pub async fn get_or_create_csrf_token(session: &Session) -> String {
    if let Some(token) = session.get(CSRF_TOKEN_KEY).await.ok().flatten() {
        return token;
    }
    let token = generate_csrf_token();
    let _ = session.insert(CSRF_TOKEN_KEY, &token).await;
    token
}

/// Validate a CSRF token against the session
pub async fn validate_csrf(session: &Session, token: &str) -> AppResult<()> {
    let session_token: Option<String> = session
        .get(CSRF_TOKEN_KEY)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    match session_token {
        Some(st) if constant_time_eq(token, &st) => Ok(()),
        _ => Err(AppError::BadRequest("invalid csrf token".into())),
    }
}

pub struct AuthRejection {
    is_api: bool,
}

impl AuthRejection {
    fn missing(parts: &Parts) -> Self {
        Self {
            is_api: parts.uri.path().starts_with("/api/"),
        }
    }
}

impl IntoResponse for AuthRejection {
    fn into_response(self) -> Response {
        if self.is_api {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "authentication required" })),
            )
                .into_response()
        } else {
            Redirect::to("/login").into_response()
        }
    }
}

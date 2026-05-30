//! `/api/archive/*` — ZIM/ZIP archive indexing routes.
//!
//! ZIM files (like Wikipedia offline) require libzim bindings which are not
//! yet available in pure Rust. This module provides stub implementations
//! that return 501 Not Implemented until proper support is added.

use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/archive/index", post(index_archive))
        .route("/api/archive/status", get(archive_status))
        .route("/api/archive/list", get(list_archives))
        .route("/api/archive/remove", post(remove_archive))
}

#[derive(Deserialize)]
struct ArchivePathBody {
    #[allow(dead_code)]
    path: String,
}

async fn index_archive(
    _: CurrentUser,
    _: CsrfToken,
    Json(_body): Json<ArchivePathBody>,
) -> AppResult<Json<Value>> {
    Err(AppError::NotImplemented(
        "ZIM/ZIP archive indexing is not yet implemented. This feature requires \
         libzim bindings which are not yet available in pure Rust. \
         See README for known follow-ups."
            .into(),
    ))
}

async fn archive_status(_: CurrentUser) -> AppResult<Json<Value>> {
    Ok(Json(json!({
        "available": false,
        "message": "ZIM/ZIP archive indexing not implemented"
    })))
}

async fn list_archives(_: CurrentUser) -> AppResult<Json<Value>> {
    Ok(Json(json!({
        "archives": []
    })))
}

#[derive(Deserialize)]
struct RemoveBody {
    #[allow(dead_code)]
    path: String,
}

async fn remove_archive(
    _: CurrentUser,
    _: CsrfToken,
    Json(_body): Json<RemoveBody>,
) -> AppResult<Json<Value>> {
    Err(AppError::NotImplemented(
        "ZIM/ZIP archive indexing is not yet implemented.".into(),
    ))
}

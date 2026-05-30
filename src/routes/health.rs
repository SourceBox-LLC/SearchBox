use axum::extract::State;
use axum::response::Json;
use axum::routing::get;
use axum::Router;
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/health", get(health))
}

async fn health(State(state): State<AppState>) -> AppResult<Json<Value>> {
    // Touch the DB so "healthy" means the app can actually serve requests.
    let (one,): (i64,) = sqlx::query_as("SELECT 1")
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({
        "status": "ok",
        "db": one == 1,
    })))
}

//! `/api/ollama/*` + `/api/search/summary*` — Ollama control + RAG.

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::models::Settings;
use crate::services::ollama::{fallback_recommendations, Ollama};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/ollama/status", get(status))
        .route("/api/ollama/models", get(models))
        .route("/api/ollama/test", post(test_conn))
        .route("/api/ollama/pull", post(pull))
        .route("/api/ollama/recommendations", get(recommendations))
        .route("/api/search/summary", post(summary))
        .route("/api/search/summary/stream", post(summary_stream))
}

async fn ai_enabled(state: &AppState) -> AppResult<bool> {
    Ok(Settings::get(&state.db, "ai_search_enabled")
        .await?
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "true" | "1" | "yes"))
        .unwrap_or(false))
}

async fn status(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let enabled = ai_enabled(&state).await?;
    let o = Ollama::from_settings(&state.db).await?;
    let connected = enabled && o.ping().await.unwrap_or(false);
    let available_models = if connected {
        o.list_models().await.unwrap_or_default()
    } else {
        Vec::new()
    };
    Ok(Json(json!({
        "enabled": enabled,
        "connected": connected,
        "available_models": available_models,
        "configured_model": o.model,
        "autoconnect": Settings::get(&state.db, "ollama_autoconnect").await?.map(|v| matches!(v.to_ascii_lowercase().as_str(), "true" | "1" | "yes")).unwrap_or(false),
    })))
}

async fn models(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let enabled = ai_enabled(&state).await?;
    let o = Ollama::from_settings(&state.db).await?;
    let models = if enabled {
        o.list_models().await.unwrap_or_default()
    } else {
        Vec::new()
    };
    Ok(Json(json!({
        "enabled": enabled,
        "models": models,
        "configured_model": o.model,
    })))
}

#[derive(Deserialize)]
struct TestBody {
    url: Option<String>,
    timeout: Option<u64>,
}

async fn test_conn(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<TestBody>,
) -> AppResult<Json<Value>> {
    let mut o = Ollama::from_settings(&state.db).await?;
    if let Some(u) = body.url {
        if !(u.starts_with("http://") || u.starts_with("https://")) {
            return Err(AppError::BadRequest(
                "url must be http:// or https://".into(),
            ));
        }
        o.base_url = u;
    }
    if let Some(t) = body.timeout {
        o = Ollama {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(t))
                .build()
                .map_err(|e| AppError::Internal(e.into()))?,
            base_url: o.base_url,
            model: o.model,
        };
    }
    let ok = o.ping().await.unwrap_or(false);
    Ok(Json(json!({ "connected": ok })))
}

#[derive(Deserialize)]
struct PullBody {
    model: String,
}

async fn pull(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<PullBody>,
) -> AppResult<Json<Value>> {
    let o = Ollama::from_settings(&state.db).await?;
    o.pull_model(&body.model).await?;
    Ok(Json(json!({ "success": true })))
}

async fn recommendations(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let enabled = ai_enabled(&state).await?;
    if !enabled {
        return Ok(Json(json!({
            "success": true,
            "recommendations": fallback_recommendations(),
            "model_used": null,
            "enhanced": false,
        })));
    }
    // TODO: when AI is on, generate recs from search history instead of
    // falling through to the static list.
    Ok(Json(json!({
        "success": true,
        "recommendations": fallback_recommendations(),
        "model_used": Settings::get(&state.db, "ollama_model").await?,
        "enhanced": false,
    })))
}

#[derive(Deserialize)]
struct SummaryBody {
    query: String,
    #[serde(default)]
    results: Vec<Value>,
}

async fn summary(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<SummaryBody>,
) -> AppResult<Json<Value>> {
    let o = Ollama::from_settings(&state.db).await?;
    let prompt = build_prompt(&body.query, &body.results);
    let resp = o.generate(&prompt).await?;
    Ok(Json(json!({
        "success": true,
        "summary": resp,
        "citations": body.results.iter().take(5).collect::<Vec<_>>(),
    })))
}

async fn summary_stream(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<SummaryBody>,
) -> AppResult<Response> {
    let o = Ollama::from_settings(&state.db).await?;
    let prompt = build_prompt(&body.query, &body.results);
    let stream = o.generate_stream(&prompt).await?;
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/x-ndjson")],
        Body::from_stream(stream),
    )
        .into_response())
}

fn build_prompt(query: &str, results: &[Value]) -> String {
    let mut p = String::new();
    p.push_str("You are a concise research assistant. Summarize the findings below to answer the user query. Cite files by filename.\n\n");
    p.push_str(&format!("User query: {query}\n\n"));
    for (i, r) in results.iter().take(5).enumerate() {
        let fname = r.get("filename").and_then(|v| v.as_str()).unwrap_or("doc");
        let snippet = r
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(500)
            .collect::<String>();
        p.push_str(&format!("[{}] {fname}\n{snippet}\n\n", i + 1));
    }
    p.push_str("Summary:\n");
    p
}

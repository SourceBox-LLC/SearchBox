//! `/api/settings/*` and `/api/bookmarks*` — user-facing settings routes.

use std::path::Path as StdPath;

use axum::extract::{Path, State};
use axum::response::Json;
use axum::routing::{delete, get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use tower_sessions::Session;

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::models::{Bookmark, RecoveryKey, Settings, VaultConfig};
use crate::state::AppState;
use crate::vault::crypto;

const MAX_HISTORY_SIZE: usize = 5;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/settings/search-history",
            get(get_search_history)
                .post(add_search_history)
                .delete(clear_search_history),
        )
        .route(
            "/api/settings/ai-enhancement",
            get(get_ai_enhancement).put(set_ai_enhancement),
        )
        .route(
            "/api/settings/last-sync-time",
            get(get_last_sync).put(set_last_sync),
        )
        .route(
            "/api/settings/bookmarks-enabled",
            get(get_bookmarks_enabled).put(set_bookmarks_enabled),
        )
        .route("/api/settings/factory-reset", post(factory_reset))
        .route(
            "/api/settings/generate-recovery-key",
            post(generate_recovery_key),
        )
        .route("/api/bookmarks", get(list_bookmarks).post(upsert_bookmark))
        .route("/api/bookmarks/{slot}", delete(delete_bookmark))
        .route("/api/bookmarks/document/{doc_id}", get(bookmark_status))
}

// ── Search history ────────────────────────────────────────────────────────

async fn get_search_history(
    State(state): State<AppState>,
    _: CurrentUser,
) -> AppResult<Json<Value>> {
    let history: Vec<String> = Settings::get_json(&state.db, "search_history")
        .await?
        .unwrap_or_default();
    Ok(Json(json!({ "history": history })))
}

#[derive(Deserialize)]
struct QueryBody {
    query: String,
}

async fn add_search_history(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<QueryBody>,
) -> AppResult<Json<Value>> {
    let q = body.query.trim().to_string();
    if q.is_empty() {
        return Err(AppError::BadRequest("query is required".into()));
    }
    let mut history: Vec<String> = Settings::get_json(&state.db, "search_history")
        .await?
        .unwrap_or_default();
    history.retain(|h| !h.eq_ignore_ascii_case(&q));
    history.insert(0, q);
    history.truncate(MAX_HISTORY_SIZE);
    Settings::set_json(&state.db, "search_history", &history).await?;
    Ok(Json(json!({ "success": true, "history": history })))
}

async fn clear_search_history(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
) -> AppResult<Json<Value>> {
    let empty: Vec<String> = Vec::new();
    Settings::set_json(&state.db, "search_history", &empty).await?;
    Ok(Json(json!({ "success": true })))
}

// ── Boolean settings (ai-enhancement, bookmarks-enabled) ──────────────────

async fn get_ai_enhancement(
    State(state): State<AppState>,
    _: CurrentUser,
) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "enabled": bool_setting(&state, "ai_history_enhancement", true).await? }),
    ))
}

#[derive(Deserialize)]
struct EnabledBody {
    enabled: bool,
}

async fn set_ai_enhancement(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<EnabledBody>,
) -> AppResult<Json<Value>> {
    Settings::set(
        &state.db,
        "ai_history_enhancement",
        Some(&body.enabled.to_string()),
    )
    .await?;
    Ok(Json(json!({ "success": true, "enabled": body.enabled })))
}

async fn get_bookmarks_enabled(
    State(state): State<AppState>,
    _: CurrentUser,
) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "enabled": bool_setting(&state, "bookmarks_enabled", true).await? }),
    ))
}

async fn set_bookmarks_enabled(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<EnabledBody>,
) -> AppResult<Json<Value>> {
    Settings::set(
        &state.db,
        "bookmarks_enabled",
        Some(&body.enabled.to_string()),
    )
    .await?;
    Ok(Json(json!({ "success": true, "enabled": body.enabled })))
}

async fn bool_setting(state: &AppState, key: &str, default: bool) -> AppResult<bool> {
    let raw = Settings::get(&state.db, key).await?;
    Ok(raw
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "true" | "1" | "yes"))
        .unwrap_or(default))
}

// ── Sync timestamps ───────────────────────────────────────────────────────

async fn get_last_sync(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "last_sync_time": Settings::get(&state.db, "last_sync_time").await? }),
    ))
}

#[derive(Deserialize)]
struct TimestampBody {
    timestamp: String,
}

async fn set_last_sync(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<TimestampBody>,
) -> AppResult<Json<Value>> {
    Settings::set(&state.db, "last_sync_time", Some(&body.timestamp)).await?;
    Ok(Json(json!({ "last_sync_time": body.timestamp })))
}

// ── Bookmarks ─────────────────────────────────────────────────────────────

async fn list_bookmarks(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let bookmarks = Bookmark::all(&state.db).await?;
    Ok(Json(json!({ "bookmarks": bookmarks })))
}

#[derive(Deserialize)]
struct UpsertBookmark {
    slot: i64,
    doc_id: String,
    title: String,
    file_type: String,
    file_path: Option<String>,
}

async fn upsert_bookmark(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<UpsertBookmark>,
) -> AppResult<Json<Value>> {
    if !(1..=5).contains(&body.slot) {
        return Err(AppError::BadRequest("slot must be 1..=5".into()));
    }
    // A doc_id already bookmarked in a different slot blocks upsert — clear it first.
    if let Some(existing) = Bookmark::get_by_doc_id(&state.db, &body.doc_id).await? {
        if existing.slot != body.slot {
            Bookmark::delete_by_slot(&state.db, existing.slot).await?;
        }
    }
    let bm = Bookmark::upsert(
        &state.db,
        body.slot,
        &body.doc_id,
        &body.title,
        &body.file_type,
        body.file_path.as_deref(),
    )
    .await?;
    Ok(Json(json!({ "success": true, "bookmark": bm })))
}

async fn delete_bookmark(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Path(slot): Path<i64>,
) -> AppResult<Json<Value>> {
    Bookmark::delete_by_slot(&state.db, slot).await?;
    Ok(Json(json!({ "success": true })))
}

async fn bookmark_status(
    State(state): State<AppState>,
    _: CurrentUser,
    Path(doc_id): Path<String>,
) -> AppResult<Json<Value>> {
    match Bookmark::get_by_doc_id(&state.db, &doc_id).await? {
        Some(b) => Ok(Json(json!({ "bookmarked": true, "slot": b.slot }))),
        None => Ok(Json(json!({ "bookmarked": false }))),
    }
}

// ── Recovery Key ──────────────────────────────────────────────────────────

async fn generate_recovery_key(
    State(state): State<AppState>,
    CurrentUser(current): CurrentUser,
    _: CsrfToken,
    _session: Session,
) -> AppResult<Json<Value>> {
    let _cfg = VaultConfig::get(&state.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("vault not configured".into()))?;

    let kek_hex = current
        .vault_kek_hex
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("vault KEK not in session".into()))?;
    let kek = crypto::kek_from_hex(kek_hex)?;

    let recovery_dek = crypto::generate_recovery_key();
    let wrapped_recovery_dek =
        crypto::wrap_dek(&kek, &recovery_dek).map_err(AppError::Internal)?;

    RecoveryKey::upsert(&state.db, &wrapped_recovery_dek)
        .await
        .map_err(AppError::Internal)?;

    let recovery_key_hex = crypto::recovery_key_to_hex(&recovery_dek);

    Ok(Json(json!({
        "success": true,
        "recovery_key": recovery_key_hex,
        "message": "Save this recovery key in a secure location. It can be used to reset your password if you forget it."
    })))
}

// ── Factory reset ─────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct ConfirmBody {
    #[serde(default)]
    confirm: bool,
}

async fn factory_reset(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    body: Option<Json<ConfirmBody>>,
) -> AppResult<Json<Value>> {
    let confirmed = body.map(|Json(b)| b.confirm).unwrap_or(false);
    if !confirmed {
        return Err(AppError::BadRequest(
            "pass {\"confirm\":true} to wipe all data".into(),
        ));
    }

    let mut errors: Vec<String> = Vec::new();

    // Drop every app table. Schema gets reapplied on next boot.
    let tables = [
        "encrypted_files",
        "vault_config",
        "bookmarks",
        "qb_torrents",
        "indexed_folders",
        "settings",
        "users",
    ];
    for t in tables {
        if let Err(e) = sqlx::query(&format!("DELETE FROM {t}"))
            .execute(&state.db)
            .await
        {
            errors.push(format!("{t}: {e}"));
        }
    }

    // Wipe the vault directory on disk.
    if let Err(e) = wipe_dir(&state.config.vault_dir) {
        errors.push(format!("vault: {e}"));
    }
    // Wipe generated thumbnails.
    if let Err(e) = wipe_dir(&state.config.thumbnails_dir) {
        errors.push(format!("thumbnails: {e}"));
    }

    // Wipe every document from Meilisearch too.
    if let Ok(m) = crate::services::meili::Meili::from_settings(&state.db).await {
        if let Err(e) = m.clear_documents().await {
            errors.push(format!("meilisearch: {e}"));
        }
    }

    Ok(Json(json!({
        "success": errors.is_empty(),
        "message": if errors.is_empty() { "factory reset complete" } else { "factory reset completed with errors" },
        "errors": errors,
    })))
}

fn wipe_dir(p: &StdPath) -> std::io::Result<()> {
    if !p.exists() {
        return Ok(());
    }
    // Best-effort: one locked/in-use file (common on Windows) must not abort
    // the whole wipe and strand the rest on disk after the DB rows are already
    // gone. Log and keep going.
    for entry in std::fs::read_dir(p)? {
        let path = match entry {
            Ok(e) => e.path(),
            Err(e) => {
                tracing::warn!("factory reset: unreadable entry in {}: {e}", p.display());
                continue;
            }
        };
        let res = if path.is_dir() {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
        if let Err(e) = res {
            tracing::warn!("factory reset: could not remove {}: {e}", path.display());
        }
    }
    Ok(())
}

//! Native file/folder picker for the desktop app.
//!
//! A web page can't read a real local filesystem path from `<input type=file>`
//! — browser security only exposes the file *name*. So the "Browse" buttons ask
//! the backend (which runs on the same machine as the WebView) to pop a native
//! dialog and hand back the chosen absolute path. Windows-only, matching the
//! desktop build; on other targets the endpoint reports that the path must be
//! typed, and the UI falls back to manual entry.

use axum::extract::Query;
use axum::response::Json;
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::CurrentUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/pick", get(pick))
}

#[derive(Deserialize)]
struct PickQuery {
    /// `folder` opens a directory picker; anything else opens a `.zim`/`.zip`
    /// file picker.
    #[serde(default)]
    kind: String,
}

/// Open a native picker and return `{ "path": "<absolute path>" | null }`.
/// `path` is `null` when the user cancels the dialog.
async fn pick(_: CurrentUser, Query(q): Query<PickQuery>) -> AppResult<Json<Value>> {
    let path = pick_native(q.kind == "folder").await?;
    Ok(Json(json!({ "path": path })))
}

#[cfg(target_os = "windows")]
async fn pick_native(want_folder: bool) -> AppResult<Option<String>> {
    // rfd's synchronous dialog runs its own modal message loop, so keep it off
    // the async runtime via spawn_blocking.
    let picked = tokio::task::spawn_blocking(move || {
        let dialog = rfd::FileDialog::new();
        if want_folder {
            dialog.set_title("Select a folder to index").pick_folder()
        } else {
            dialog
                .set_title("Select a .zim or .zip archive")
                .add_filter("Archives (*.zim, *.zip)", &["zim", "zip"])
                .pick_file()
        }
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("file dialog task: {e}")))?;
    Ok(picked.map(|p| p.display().to_string()))
}

#[cfg(not(target_os = "windows"))]
async fn pick_native(_want_folder: bool) -> AppResult<Option<String>> {
    Err(AppError::BadRequest(
        "the native file picker is only available in the desktop app — enter the path manually"
            .into(),
    ))
}

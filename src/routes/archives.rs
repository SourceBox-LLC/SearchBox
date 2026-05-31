//! `/api/archive/*` — index ZIP/ZIM archives by treating them like a folder.
//!
//! An archive is unpacked into `<base_dir>/archives/<name>/` and then handed to
//! the normal folder-indexing pipeline, so everything inside becomes searchable
//! and viewable exactly like any other indexed folder. Indexing runs as a
//! background job (same as folder sync); poll `/api/archive/status?job_id=…`.

use std::path::{Path as StdPath, PathBuf};

use anyhow::{anyhow, Result};
use axum::extract::{Query, State};
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::task;

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::jobs::{JobRegistry, JobStatus};
use crate::routes::folders::index_folder_task;
use crate::services::meili::Meili;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/archive/index", post(index_archive))
        .route("/api/archive/status", get(archive_status))
        .route("/api/archive/list", get(list_archives))
        .route("/api/archive/remove", post(remove_archive))
}

/// Extracted archives live under `<base_dir>/archives/<name>/`.
fn archives_root(state: &AppState) -> PathBuf {
    state.config.base_dir.join("archives")
}

#[derive(Deserialize)]
struct ArchivePathBody {
    path: String,
}

async fn index_archive(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<ArchivePathBody>,
) -> AppResult<Json<Value>> {
    let archive = PathBuf::from(&body.path);
    if !archive.is_file() {
        return Err(AppError::BadRequest(format!(
            "archive not found: {}",
            body.path
        )));
    }
    let ext = archive
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "zip" && ext != "zim" {
        return Err(AppError::BadRequest(format!(
            "unsupported archive type '.{ext}' (supported: .zip, .zim)"
        )));
    }
    if ext == "zim" {
        return Err(AppError::NotImplemented(
            "ZIM indexing is coming next — .zip archives work now".into(),
        ));
    }
    let stem = archive
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("archive")
        .to_string();
    let dest = archives_root(&state).join(&stem);
    let source = "zip";

    let job_id = JobRegistry::new_id();
    let mut job = JobStatus::new(job_id.clone());
    job.folder = Some(format!("{} (archive)", body.path));
    state.jobs.insert(job);

    let meili = Meili::from_settings(&state.db).await?;
    let jobs = state.jobs.clone();
    let job_id_bg = job_id.clone();
    let thumb_dir = state.config.thumbnails_dir.clone();

    task::spawn(async move {
        // Extraction is synchronous and IO-heavy — keep it off the runtime.
        let dest2 = dest.clone();
        let extracted =
            match task::spawn_blocking(move || extract_archive(&archive, &dest2, &ext)).await {
                Ok(r) => r,
                Err(e) => Err(anyhow!("extract task: {e}")),
            };
        if let Err(e) = extracted {
            jobs.update(&job_id_bg, |j| {
                j.status = "failed".into();
                j.errors.push(format!("extract: {e}"));
            });
            return;
        }
        let dest_str = dest.display().to_string();
        if let Err(e) =
            index_folder_task(&dest_str, &meili, &jobs, &job_id_bg, &thumb_dir, source).await
        {
            jobs.update(&job_id_bg, |j| {
                j.status = "failed".into();
                j.errors.push(e.to_string());
            });
        } else {
            jobs.update(&job_id_bg, |j| {
                if j.status == "running" {
                    j.status = "completed".into();
                }
            });
        }
    });

    Ok(Json(json!({
        "job_id": job_id,
        "status": "started",
        "archive": body.path,
    })))
}

#[derive(Deserialize)]
struct StatusQuery {
    job_id: String,
}

async fn archive_status(
    State(state): State<AppState>,
    _: CurrentUser,
    Query(q): Query<StatusQuery>,
) -> AppResult<Json<Value>> {
    match state.jobs.get(&q.job_id) {
        Some(j) => Ok(Json(serde_json::to_value(&j).unwrap())),
        None => Err(AppError::NotFound(format!("no such job: {}", q.job_id))),
    }
}

async fn list_archives(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let root = archives_root(&state);
    let mut archives = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&root) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    archives.push(json!({
                        "name": name,
                        "path": p.display().to_string(),
                    }));
                }
            }
        }
    }
    Ok(Json(json!({ "archives": archives })))
}

async fn remove_archive(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<ArchivePathBody>,
) -> AppResult<Json<Value>> {
    // `body.path` is the extracted-archive directory (from /api/archive/list).
    // Confine the delete to within our archives root.
    let dir = PathBuf::from(&body.path);
    let root = archives_root(&state);
    if !dir.starts_with(&root) {
        return Err(AppError::BadRequest("not an archive path".into()));
    }
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| AppError::Internal(e.into()))?;
    }
    // Purge the indexed docs whose file_path is under that directory.
    let mut deletion_task: Option<Value> = None;
    if let Ok(m) = Meili::from_settings(&state.db).await {
        let filter = json!({
            "filter": format!(
                "file_path STARTS WITH \"{}\"",
                body.path.replace('\\', "\\\\").replace('"', "\\\"")
            )
        });
        if let Ok(t) = m.delete_documents_by_filter(&filter).await {
            deletion_task = Some(t);
        }
    }
    Ok(Json(
        json!({ "success": true, "deletion_task": deletion_task }),
    ))
}

// ── Extraction ─────────────────────────────────────────────────────────────

fn extract_archive(archive: &StdPath, dest: &StdPath, ext: &str) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    match ext {
        "zip" => extract_zip(archive, dest),
        "zim" => extract_zim(archive, dest),
        other => Err(anyhow!("unsupported archive type: .{other}")),
    }
}

fn extract_zip(archive: &StdPath, dest: &StdPath) -> Result<()> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| anyhow!("open zip: {e}"))?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| anyhow!("zip entry {i}: {e}"))?;
        // enclosed_name() rejects absolute paths and `..` traversal (zip-slip).
        let Some(rel) = entry.enclosed_name() else {
            continue;
        };
        let outpath = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(&outpath)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }
    Ok(())
}

fn extract_zim(_archive: &StdPath, _dest: &StdPath) -> Result<()> {
    // TODO(zim): use the `zim` crate to write every article out to an HTML file
    // under `dest`, then the folder indexer picks them up automatically.
    // Pending validation of the crate against a real (zstd) ZIM file.
    Err(anyhow!(
        "ZIM extraction isn't wired up yet — ZIP archives work today; ZIM is the next step"
    ))
}

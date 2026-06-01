//! `/api/folder*` + `/api/folders*` — folder indexing routes.
//!
//! Indexing is async via a background task that writes progress into the
//! shared `JobRegistry`. The handler returns immediately with a job id.

use std::path::{Path as StdPath, PathBuf};

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
use crate::models::IndexedFolder;
use crate::services::extractor;
use crate::services::meili::Meili;
use crate::services::thumbnail;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/folder/index", post(start_index))
        .route("/api/folder/index/status", get(index_status))
        .route("/api/folders", get(list_folders))
        .route("/api/folders/sync", post(sync_folders))
        .route("/api/folder/remove", post(remove_folder))
}

#[derive(Deserialize)]
struct PathBody {
    path: String,
}

#[derive(Deserialize)]
struct RemoveBody {
    path: String,
    #[serde(default)]
    delete_documents: bool,
}

#[derive(Deserialize)]
struct StatusQuery {
    job_id: String,
}

async fn start_index(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<PathBody>,
) -> AppResult<Json<Value>> {
    let path = PathBuf::from(&body.path);
    if !path.is_dir() {
        return Err(AppError::BadRequest(format!(
            "path is not a directory: {}",
            body.path
        )));
    }
    IndexedFolder::add(&state.db, &body.path).await?;

    let job_id = JobRegistry::new_id();
    let mut job = JobStatus::new(job_id.clone());
    job.folder = Some(body.path.clone());
    state.jobs.insert(job);

    let jobs = state.jobs.clone();
    let meili = Meili::from_settings(&state.db).await?;
    let folder = body.path.clone();
    let job_id_bg = job_id.clone();
    let thumb_dir = state.config.thumbnails_dir.clone();
    task::spawn(async move {
        if let Err(e) =
            index_folder_task(&folder, &meili, &jobs, &job_id_bg, &thumb_dir, "folder").await
        {
            jobs.update(&job_id_bg, |j| {
                j.status = "failed".into();
                j.errors.push(e.to_string());
            });
        } else {
            jobs.update(&job_id_bg, |j| j.status = "completed".into());
        }
    });

    Ok(Json(json!({
        "job_id": job_id,
        "status": "started",
        "folder": body.path,
    })))
}

pub async fn index_folder_task(
    folder: &str,
    meili: &Meili,
    jobs: &JobRegistry,
    job_id: &str,
    thumbnails_dir: &StdPath,
    source: &str,
) -> anyhow::Result<()> {
    // Gather files up-front so we can report `total`.
    let mut files: Vec<PathBuf> = Vec::new();
    collect_files(StdPath::new(folder), &mut files)?;

    jobs.update(job_id, |j| j.total = files.len() as u64);

    meili.ensure_index().await.ok();
    meili.configure_index().await.ok();

    for chunk in files.chunks(100) {
        let docs = extractor::batch_extract(chunk).await.unwrap_or_default();
        let mut batch: Vec<Value> = Vec::with_capacity(docs.len());
        for (i, d) in docs.iter().enumerate() {
            if d.error.is_some() {
                jobs.update(job_id, |j| j.failed += 1);
                continue;
            }
            let file_path = chunk[i].display().to_string();
            let id = doc_id_for_path(&file_path);
            let filename = chunk[i]
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let file_type = d.file_type.clone().unwrap_or_default();
            let is_image = thumbnail::is_image_ext(&file_type);
            // Use metadata() rather than the DirEntry's cached value so
            // symlinks resolve. Reused for both size and the indexed date.
            let meta = std::fs::metadata(&chunk[i]).ok();
            let file_size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            // Date shown in the viewer + used for Explore's "sort by recent".
            // Prefer the file's modified time (stable across re-syncs); fall
            // back to now. Mirrors the upload handler's `uploaded_at`.
            let uploaded_at = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

            // Best-effort thumbnail for supported image types. Failures are
            // logged and the doc still indexes.
            if thumbnail::is_supported_ext(&file_type) {
                let dst = thumbnails_dir.join(format!("{id}.jpg"));
                if let Err(e) =
                    thumbnail::write_from_path(&chunk[i], &dst, thumbnail::DEFAULT_MAX_DIM)
                {
                    tracing::warn!(
                        "thumbnail generation failed for {}: {e}",
                        chunk[i].display()
                    );
                }
            }

            let all_images: Vec<String> = if is_image {
                vec![format!("/api/thumbnail/{id}")]
            } else {
                Vec::new()
            };

            batch.push(json!({
                "id":          id,
                "filename":    filename,
                "file_path":   file_path,
                "file_type":   file_type,
                "file_size":   file_size,
                "uploaded_at": uploaded_at,
                "content":     d.content.clone().unwrap_or_default(),
                "source":      source,
                "is_image":    is_image,
                "has_images":  is_image,
                "image_count": if is_image { 1 } else { 0 },
                "all_images":  all_images,
            }));
        }
        if !batch.is_empty() {
            match meili.add_documents(&Value::Array(batch.clone())).await {
                Ok(_) => jobs.update(job_id, |j| j.indexed += batch.len() as u64),
                Err(e) => jobs.update(job_id, |j| {
                    j.failed += batch.len() as u64;
                    j.errors.push(e.to_string());
                }),
            }
        }
        jobs.update(job_id, |j| j.processed += chunk.len() as u64);
    }

    Ok(())
}

fn collect_files(root: &StdPath, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    // Be permissive: a single unreadable directory shouldn't kill an
    // otherwise-successful traversal. Common hits on Windows are
    // `C:\System Volume Information`, `C:\$Recycle.Bin`, and any dir
    // whose ACL denies read access to the current user. We log and
    // continue so indexing completes on the parts we *can* read.
    let iter = match std::fs::read_dir(root) {
        Ok(it) => it,
        Err(e) => {
            tracing::warn!("skipping unreadable dir {}: {e}", root.display());
            return Ok(());
        }
    };
    for entry in iter {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("skipping unreadable entry in {}: {e}", root.display());
                continue;
            }
        };
        let p = entry.path();
        if p.is_dir() {
            // Recurse but treat per-subdir errors the same way —
            // recover to the parent's loop rather than bubble.
            if let Err(e) = collect_files(&p, out) {
                tracing::warn!("partial traversal of {}: {e}", p.display());
            }
        } else if p.is_file() {
            out.push(p);
        }
    }
    Ok(())
}

fn doc_id_for_path(path: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    hex::encode(&hasher.finalize()[..16])
}

async fn index_status(
    State(state): State<AppState>,
    _: CurrentUser,
    Query(q): Query<StatusQuery>,
) -> AppResult<Json<Value>> {
    match state.jobs.get(&q.job_id) {
        Some(j) => Ok(Json(serde_json::to_value(&j).unwrap())),
        None => Err(AppError::NotFound(format!("no such job: {}", q.job_id))),
    }
}

async fn list_folders(State(state): State<AppState>, _: CurrentUser) -> AppResult<Json<Value>> {
    let paths = IndexedFolder::paths(&state.db).await?;
    Ok(Json(json!({ "folders": paths })))
}

async fn sync_folders(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
) -> AppResult<Json<Value>> {
    // Kick off a re-index pass for every active folder. Returns the list of
    // job ids the caller can poll individually.
    let paths = IndexedFolder::paths(&state.db).await?;
    let mut job_ids = Vec::with_capacity(paths.len());
    for p in &paths {
        let job_id = JobRegistry::new_id();
        let mut job = JobStatus::new(job_id.clone());
        job.folder = Some(p.clone());
        state.jobs.insert(job);
        job_ids.push(job_id.clone());

        let meili = Meili::from_settings(&state.db).await?;
        let jobs = state.jobs.clone();
        let folder = p.clone();
        let job_id_bg = job_id.clone();
        let thumb_dir = state.config.thumbnails_dir.clone();
        task::spawn(async move {
            let _ =
                index_folder_task(&folder, &meili, &jobs, &job_id_bg, &thumb_dir, "folder").await;
            jobs.update(&job_id_bg, |j| {
                if j.status == "running" {
                    j.status = "completed".into();
                }
            });
        });
    }
    Ok(Json(json!({ "success": true, "job_ids": job_ids })))
}

async fn remove_folder(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Json(body): Json<RemoveBody>,
) -> AppResult<Json<Value>> {
    IndexedFolder::remove(&state.db, &body.path).await?;

    // The actual doc count is resolved by Meili asynchronously; we return
    // the queued task id so the caller can poll if they need the true count.
    let mut deletion_task: Option<Value> = None;
    if body.delete_documents {
        let m = Meili::from_settings(&state.db).await?;
        let filter = serde_json::json!({
            "filter": format!("file_path STARTS WITH \"{}\"", body.path.replace('\\', "\\\\").replace('"', "\\\""))
        });
        match m.delete_documents_by_filter(&filter).await {
            Ok(task) => {
                tracing::info!(
                    ?task,
                    "issued Meili delete-by-filter for folder {}",
                    body.path
                );
                deletion_task = Some(task);
            }
            Err(e) => {
                tracing::warn!(
                    "Meili delete-by-filter failed for folder {}: {e}",
                    body.path
                );
            }
        }
    }

    Ok(Json(json!({
        "success": true,
        "deletion_task": deletion_task,
    })))
}

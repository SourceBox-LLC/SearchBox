//! Document routes: `/api/document*`, `/api/documents`, `/api/upload`,
//! `/api/thumbnail/<id>`, `/api/pdf/<id>`, `/api/docx/<id>`, `/api/html/<id>`.

use std::path::{Path as StdPath, PathBuf};

use axum::body::Bytes;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::{CsrfToken, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::models::{EncryptedFile, VaultConfig};
use crate::services::extractor;
use crate::services::meili::Meili;
use crate::services::thumbnail;
use crate::state::AppState;
use crate::vault::crypto;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/documents", get(list_documents))
        .route(
            "/api/document/{doc_id}",
            get(get_document).delete(delete_document),
        )
        .route("/api/document/{doc_id}/open", post(open_document))
        .route("/api/document/{doc_id}/reveal", post(reveal_document))
        .route("/api/upload", post(upload))
        .route("/api/thumbnail/{doc_id}", get(thumbnail))
        .route("/api/pdf/{doc_id}", get(serve_pdf))
        .route("/api/docx/{doc_id}", get(serve_docx))
        .route("/api/html/{doc_id}", get(serve_html))
}

// ── Listing ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ListQuery {
    #[serde(default = "default_limit")]
    limit: u32,
    #[serde(default)]
    offset: u32,
}
fn default_limit() -> u32 {
    100
}

async fn list_documents(
    State(state): State<AppState>,
    _: CurrentUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    let m = Meili::from_settings(&state.db).await?;
    let results = m.list_documents(q.limit, q.offset).await?;
    Ok(Json(results))
}

async fn get_document(
    State(state): State<AppState>,
    _: CurrentUser,
    Path(doc_id): Path<String>,
) -> AppResult<Json<Value>> {
    validate_doc_id(&doc_id)?;
    let m = Meili::from_settings(&state.db).await?;
    match m.get_document(&doc_id).await? {
        Some(v) => Ok(Json(v)),
        None => Err(AppError::NotFound(format!("document not found: {doc_id}"))),
    }
}

// ── Deletion ──────────────────────────────────────────────────────────────

async fn delete_document(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Path(doc_id): Path<String>,
) -> AppResult<Json<Value>> {
    validate_doc_id(&doc_id)?;
    let m = Meili::from_settings(&state.db).await?;
    m.delete_document(&doc_id).await?;

    // Encrypted vault file? Wipe the ciphertext + DB row.
    if let Some(enc) = EncryptedFile::get(&state.db, &doc_id).await? {
        let path = state.config.vault_dir.join(&enc.encrypted_filename);
        if let Err(e) = std::fs::remove_file(&path) {
            tracing::warn!("failed to delete vault file {}: {e}", path.display());
        }
        EncryptedFile::delete(&state.db, &doc_id).await?;
    }

    Ok(Json(json!({ "success": true })))
}

// ── Upload ───────────────────────────────────────────────────────────────────

async fn upload(
    State(state): State<AppState>,
    user: CurrentUser,
    _: CsrfToken,
    mut mp: Multipart,
) -> AppResult<Json<Value>> {
    let Some(mut field) = mp
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    else {
        return Err(AppError::BadRequest("missing file".into()));
    };
    let original_name = field.file_name().unwrap_or("upload.bin").to_string();

    // Collect bytes with size limit enforcement
    let max_size = state.config.max_upload_size;
    let mut bytes_acc = Vec::new();
    let mut total_size: usize = 0;

    loop {
        let chunk = field
            .chunk()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        match chunk {
            Some(data) => {
                total_size += data.len();
                if total_size > max_size {
                    return Err(AppError::BadRequest(format!(
                        "file exceeds maximum size of {} bytes",
                        max_size
                    )));
                }
                bytes_acc.extend_from_slice(&data);
            }
            None => break,
        }
    }
    let bytes = Bytes::from(bytes_acc);

    // Write to a temp file so the extractor binary can read it by path.
    let tmp_path = std::env::temp_dir().join(format!("searchbox-upload-{}", uuid::Uuid::new_v4()));
    if let Err(e) = std::fs::write(&tmp_path, &bytes) {
        tracing::error!("failed to write temp file: {e}");
        return Err(AppError::Internal(e.into()));
    }

    let doc_id = uuid::Uuid::new_v4().to_string();
    let file_type = StdPath::new(&original_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    // Extract text.
    let extracted = extractor::extract_text(&tmp_path).await.ok();
    let content = extracted
        .as_ref()
        .and_then(|d| d.content.clone())
        .unwrap_or_default();

    // Clean up temp file
    if let Err(e) = std::fs::remove_file(&tmp_path) {
        tracing::warn!("failed to cleanup temp file {}: {e}", tmp_path.display());
    }

    // Best-effort thumbnail for image uploads. Runs off the in-memory bytes
    // so the vault flow never writes plaintext to disk just for a preview.
    // Failures are logged, not fatal — the doc still indexes.
    if thumbnail::is_supported_ext(&file_type) {
        let dst = state.config.thumbnails_dir.join(format!("{doc_id}.jpg"));
        if let Err(e) = thumbnail::write_from_bytes(&bytes, &dst, thumbnail::DEFAULT_MAX_DIM) {
            tracing::warn!("thumbnail generation failed for {doc_id}: {e}");
        }
    }

    // Encrypt + store in vault when one is configured. If the vault is configured
    // but locked (e.g. after a restart, before the user unlocks it), refuse the
    // upload rather than silently storing it in the clear.
    let mut source = "upload";
    let vault_kek = crate::vault::current_kek(&state.vault_seal_key, &user.0);
    if vault_kek.is_none() && VaultConfig::get(&state.db).await?.is_some() {
        return Err(AppError::Unauthorized(
            "vault is locked — unlock it in Settings to upload encrypted files".into(),
        ));
    }
    if let Some(kek) = vault_kek {
        let dek = crypto::generate_dek();
        let wrapped = crypto::wrap_dek(&kek, &dek).map_err(AppError::Internal)?;

        let encrypted = crypto::encrypt_bytes(&dek, &bytes).map_err(AppError::Internal)?;
        let enc_filename = format!("{doc_id}.enc");
        if let Err(e) = std::fs::create_dir_all(&state.config.vault_dir) {
            tracing::error!("failed to create vault dir: {e}");
            return Err(AppError::Internal(e.into()));
        }
        let dst = state.config.vault_dir.join(&enc_filename);
        if let Err(e) = std::fs::write(&dst, &encrypted) {
            tracing::error!("failed to write encrypted file: {e}");
            return Err(AppError::Internal(e.into()));
        }

        EncryptedFile::create(&state.db, &doc_id, &wrapped, &enc_filename, &original_name).await?;
        source = "vault";
    }

    // Index in Meilisearch.
    let m = Meili::from_settings(&state.db).await?;
    m.ensure_index().await.ok();
    // Idempotent — makes sure `is_image` / `has_images` are filterable so
    // the /images page's `filter: is_image = true` query matches even on a
    // fresh install that has only ever uploaded (never folder-indexed).
    m.configure_index().await.ok();
    let is_image = thumbnail::is_image_ext(&file_type);
    let all_images = if is_image {
        vec![format!("/api/thumbnail/{doc_id}")]
    } else {
        Vec::new()
    };
    let doc = json!({
        "id":          doc_id,
        "filename":    original_name,
        "file_type":   file_type,
        "file_size":   bytes.len(),
        "content":     content,
        "source":      source,
        "uploaded_at": chrono::Utc::now().to_rfc3339(),
        "is_image":    is_image,
        "has_images":  is_image,
        "image_count": if is_image { 1 } else { 0 },
        "all_images":  all_images,
    });
    m.add_documents(&Value::Array(vec![doc.clone()])).await?;

    Ok(Json(json!({ "success": true, "document": doc })))
}

// ── Viewer helpers (PDF, DOCX, thumbnails) ────────────────────────────────

async fn thumbnail(
    State(state): State<AppState>,
    _: CurrentUser,
    Path(doc_id): Path<String>,
) -> AppResult<Response> {
    validate_doc_id(&doc_id)?;
    let path = state.config.thumbnails_dir.join(format!("{doc_id}.jpg"));
    serve_file(&path, "image/jpeg").await
}

/// Reject doc ids that contain anything other than alphanumerics, `-`, `_`.
/// Upload-sourced ids are UUIDs (`uuid::new_v4().to_string()`) and folder-
/// sourced ids are 32-char hex digests — both are safe under this rule.
/// Blocks `..`, slashes, NUL, and unicode path-separator tricks.
fn validate_doc_id(doc_id: &str) -> AppResult<()> {
    if doc_id.is_empty() || doc_id.len() > 128 {
        return Err(AppError::BadRequest("invalid doc_id".into()));
    }
    if !doc_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::BadRequest("invalid doc_id".into()));
    }
    Ok(())
}

async fn serve_pdf(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(doc_id): Path<String>,
) -> AppResult<Response> {
    validate_doc_id(&doc_id)?;
    serve_encrypted_or_plain(&state, &user, &doc_id, "application/pdf").await
}

async fn serve_docx(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(doc_id): Path<String>,
) -> AppResult<Response> {
    validate_doc_id(&doc_id)?;
    serve_encrypted_or_plain(
        &state,
        &user,
        &doc_id,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    .await
}

/// Serve an indexed `.html`/`.htm` file as its raw markup so the viewer can
/// render it as a page (in a script-blocking sandboxed iframe). The CSP header
/// is defense-in-depth for anyone who navigates straight to this URL: it stops
/// the page's own scripts/plugins from running in the app's origin.
async fn serve_html(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(doc_id): Path<String>,
) -> AppResult<Response> {
    validate_doc_id(&doc_id)?;
    let mut resp =
        serve_encrypted_or_plain(&state, &user, &doc_id, "text/html; charset=utf-8").await?;
    resp.headers_mut().insert(
        header::CONTENT_SECURITY_POLICY,
        header::HeaderValue::from_static("script-src 'none'; object-src 'none'"),
    );
    Ok(resp)
}

async fn serve_encrypted_or_plain(
    state: &AppState,
    user: &CurrentUser,
    doc_id: &str,
    content_type: &str,
) -> AppResult<Response> {
    if let Some(enc) = EncryptedFile::get(&state.db, doc_id).await? {
        let kek = crate::vault::current_kek(&state.vault_seal_key, &user.0).ok_or_else(|| {
            AppError::Unauthorized(
                "vault is locked — unlock it in Settings to view encrypted files".into(),
            )
        })?;
        let dek = crypto::unwrap_dek(&kek, &enc.wrapped_dek).map_err(AppError::Internal)?;
        let ct_path = state.config.vault_dir.join(&enc.encrypted_filename);
        let ct = std::fs::read(&ct_path).map_err(|e| AppError::Internal(e.into()))?;
        let pt = crypto::decrypt_bytes(&dek, &ct).map_err(AppError::Internal)?;
        return Ok((
            StatusCode::OK,
            [(header::CONTENT_TYPE, content_type)],
            Bytes::from(pt),
        )
            .into_response());
    }

    // Folder-sourced document: look up file_path in Meilisearch and stream it.
    let m = Meili::from_settings(&state.db).await?;
    let doc = m
        .get_document(doc_id)
        .await?
        .ok_or_else(|| AppError::NotFound("no such document".into()))?;
    let path_str = doc
        .get("file_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::NotFound("document missing file_path".into()))?;
    serve_file(StdPath::new(path_str), content_type).await
}

async fn serve_file(path: &StdPath, content_type: &str) -> AppResult<Response> {
    match std::fs::read(path) {
        Ok(bytes) => Ok((
            StatusCode::OK,
            [(header::CONTENT_TYPE, content_type)],
            Bytes::from(bytes),
        )
            .into_response()),
        Err(_) => Err(AppError::NotFound(format!(
            "file not found: {}",
            path.display()
        ))),
    }
}

// ── OS integrations ───────────────────────────────────────────────────────

async fn open_document(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Path(doc_id): Path<String>,
) -> AppResult<Json<Value>> {
    validate_doc_id(&doc_id)?;
    let p = resolve_disk_path(&state, &doc_id).await?;
    os_open(&p)?;
    Ok(Json(json!({ "success": true })))
}

async fn reveal_document(
    State(state): State<AppState>,
    _: CurrentUser,
    _: CsrfToken,
    Path(doc_id): Path<String>,
) -> AppResult<Json<Value>> {
    validate_doc_id(&doc_id)?;
    let p = resolve_disk_path(&state, &doc_id).await?;
    let parent = p.parent().unwrap_or(StdPath::new("."));
    os_open(parent)?;
    Ok(Json(json!({ "success": true })))
}

async fn resolve_disk_path(state: &AppState, doc_id: &str) -> AppResult<PathBuf> {
    // Prefer the vault location if the doc is encrypted; else the folder-sourced file_path.
    if let Some(enc) = EncryptedFile::get(&state.db, doc_id).await? {
        return Ok(state.config.vault_dir.join(&enc.encrypted_filename));
    }
    let m = Meili::from_settings(&state.db).await?;
    let doc = m
        .get_document(doc_id)
        .await?
        .ok_or_else(|| AppError::NotFound("no such document".into()))?;
    let path = doc
        .get("file_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::NotFound("document missing file_path".into()))?;
    Ok(PathBuf::from(path))
}

fn os_open(p: &StdPath) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    let cmd = {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW (0x08000000): don't flash a console window for the
        // `cmd /C start` helper that hands the file to its default app.
        std::process::Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(p)
            .creation_flags(0x0800_0000)
            .spawn()
    };
    #[cfg(target_os = "macos")]
    let cmd = std::process::Command::new("open").arg(p).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let cmd = std::process::Command::new("xdg-open").arg(p).spawn();
    cmd.map(|_| ()).map_err(|e| AppError::Internal(e.into()))
}

#[cfg(test)]
mod tests {
    use super::validate_doc_id;

    #[test]
    fn accepts_uuid_and_hex() {
        assert!(validate_doc_id("5f3c2a1b-8e4d-4f6a-9c1e-0123456789ab").is_ok());
        assert!(validate_doc_id("abcdef0123456789abcdef0123456789").is_ok());
        assert!(validate_doc_id("doc_id-123").is_ok());
    }

    #[test]
    fn rejects_path_traversal() {
        assert!(validate_doc_id("../etc/passwd").is_err());
        assert!(validate_doc_id("..\\secret").is_err());
        assert!(validate_doc_id("foo/bar").is_err());
        assert!(validate_doc_id("foo\\bar").is_err());
        assert!(validate_doc_id("a\0b").is_err());
    }

    #[test]
    fn rejects_empty_and_oversized() {
        assert!(validate_doc_id("").is_err());
        assert!(validate_doc_id(&"a".repeat(129)).is_err());
    }
}

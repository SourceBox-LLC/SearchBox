//! `/api/archive/*` — index ZIP/ZIM archives by treating them like a folder.
//!
//! An archive is unpacked into `<base_dir>/archives/<name>/` and then handed to
//! the normal folder-indexing pipeline, so everything inside becomes searchable
//! and viewable exactly like any other indexed folder. Indexing runs as a
//! background job (same as folder sync); poll `/api/archive/status?job_id=…`.

use std::path::{Path as StdPath, PathBuf};

use anyhow::{anyhow, Result};
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{Json, Response};
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
        .route("/api/zim/content/{archive}/{*path}", get(serve_zim_content))
        .route(
            "/api/archive/raw/{archive}/{*path}",
            get(serve_archive_file),
        )
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
    let stem = archive
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("archive")
        .to_string();
    let dest = archives_root(&state).join(&stem);
    let source = if ext == "zim" { "zim" } else { "zip" };

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
    // Remove the ZIM source sidecar too (no-op for ZIP archives).
    let _ = std::fs::remove_file(PathBuf::from(format!("{}.zimsource", dir.display())));
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

// ── ZIM on-demand serving ───────────────────────────────────────────────────

/// Serve one entry (article, image, stylesheet, …) straight out of the source
/// `.zim` of an extracted archive. HTML responses get a `<base href>` injected
/// so the article's relative images / CSS / inter-article links all resolve back
/// through this same endpoint — turning the viewer iframe into a little offline
/// browser. Scripts are blocked (CSP here + the iframe `sandbox`).
async fn serve_zim_content(
    State(state): State<AppState>,
    _: CurrentUser,
    Path((archive, url)): Path<(String, String)>,
) -> AppResult<Response> {
    if archive.is_empty()
        || archive.contains("..")
        || archive.contains('/')
        || archive.contains('\\')
    {
        return Err(AppError::BadRequest("invalid archive".into()));
    }
    let archive_dir = archives_root(&state).join(&archive);
    let sidecar = PathBuf::from(format!("{}.zimsource", archive_dir.display()));
    let zim_path = std::fs::read_to_string(&sidecar)
        .map_err(|_| AppError::NotFound("not a ZIM archive".into()))?
        .trim()
        .to_string();

    let archive_for_base = archive.clone();
    let (mime, bytes) =
        task::spawn_blocking(move || resolve_zim(&zim_path, &url, &archive_for_base))
            .await
            .map_err(|e| AppError::Internal(anyhow!("zim task: {e}")))?
            .map_err(AppError::Internal)?;

    let ct = HeaderValue::from_str(&mime)
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"));
    let mut resp = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, ct)
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(anyhow!("build response: {e}")))?;
    if mime.starts_with("text/html") {
        resp.headers_mut().insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("script-src 'none'; object-src 'none'"),
        );
    }
    Ok(resp)
}

/// Open `zim_path`, find the entry named `url` (following redirects), and return
/// `(mime, bytes)`. HTML gets a `<base href>` pointing back at the content
/// endpoint injected so relative references resolve.
fn resolve_zim(zim_path: &str, url: &str, archive: &str) -> Result<(String, Vec<u8>)> {
    use zim::{MimeType, Target, Zim};

    let z = Zim::new(zim_path).map_err(|e| anyhow!("open zim: {e}"))?;

    let mut target = None;
    let mut mime = None;
    for e in z.iterate_by_urls() {
        if e.url == url {
            target = e.target;
            mime = Some(e.mime_type);
            break;
        }
    }
    let mut target = target.ok_or_else(|| anyhow!("not found in zim: {url}"))?;
    let mut mime = mime.unwrap_or_else(|| MimeType::Type("application/octet-stream".into()));

    // Alternate titles are redirect entries pointing at the canonical article.
    let mut hops = 0;
    while let Target::Redirect(idx) = target {
        let e = z
            .get_by_url_index(idx)
            .map_err(|e| anyhow!("redirect: {e}"))?;
        mime = e.mime_type;
        target = e
            .target
            .ok_or_else(|| anyhow!("redirect target has no content"))?;
        hops += 1;
        if hops > 8 {
            return Err(anyhow!("redirect loop for {url}"));
        }
    }
    let (cluster, blob) = match target {
        Target::Cluster(c, b) => (c, b),
        Target::Redirect(_) => return Err(anyhow!("unresolved redirect for {url}")),
    };
    let bytes = z
        .get_cluster(cluster)
        .map_err(|e| anyhow!("cluster {cluster}: {e}"))?
        .get_blob(blob)
        .map_err(|e| anyhow!("blob: {e}"))?
        .to_vec();

    let mime_str = match mime {
        MimeType::Type(t) => t,
        _ => "application/octet-stream".to_string(),
    };
    if mime_str.starts_with("text/html") {
        let base = format!("/api/zim/content/{}/", urlencoding::encode(archive));
        return Ok((mime_str, inject_base_href(&bytes, &base)));
    }
    Ok((mime_str, bytes))
}

/// Insert `<base href="…">` right after the opening `<head>` tag.
fn inject_base_href(html: &[u8], base: &str) -> Vec<u8> {
    let s = String::from_utf8_lossy(html);
    let tag = format!("<base href=\"{base}\">");
    if let Some(hpos) = s.find("<head") {
        if let Some(gt) = s[hpos..].find('>') {
            let at = hpos + gt + 1;
            let mut out = String::with_capacity(s.len() + tag.len());
            out.push_str(&s[..at]);
            out.push_str(&tag);
            out.push_str(&s[at..]);
            return out.into_bytes();
        }
    }
    let mut out = String::with_capacity(s.len() + tag.len());
    out.push_str(&tag);
    out.push_str(&s);
    out.into_bytes()
}

/// Serve a file straight out of an extracted ZIP archive directory, confined to
/// that archive. The viewer points an iframe at an archived web page (via its
/// real file URL) so the page's relative images / CSS / links resolve against
/// the on-disk siblings. HTML gets a script-blocking CSP (the iframe `sandbox`
/// blocks scripts too). ZIM uses `serve_zim_content` instead (its assets live
/// in the .zim, not on disk).
async fn serve_archive_file(
    State(state): State<AppState>,
    _: CurrentUser,
    Path((archive, rel)): Path<(String, String)>,
) -> AppResult<Response> {
    if archive.is_empty()
        || archive.contains("..")
        || archive.contains('/')
        || archive.contains('\\')
    {
        return Err(AppError::BadRequest("invalid archive".into()));
    }
    let base = archives_root(&state).join(&archive);
    let target = confined_path(&base, &rel)
        .ok_or_else(|| AppError::NotFound("file not found in archive".into()))?;

    let bytes = std::fs::read(&target).map_err(|e| AppError::Internal(e.into()))?;
    let mime_str = mime_guess::from_path(&target)
        .first_or_octet_stream()
        .to_string();
    let ct = HeaderValue::from_str(&mime_str)
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"));

    let mut resp = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, ct)
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(anyhow!("build response: {e}")))?;
    if mime_str.starts_with("text/html") {
        resp.headers_mut().insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("script-src 'none'; object-src 'none'"),
        );
    }
    Ok(resp)
}

/// Resolve `rel` under `base`, returning the canonical path only if it stays
/// inside `base` (rejects `..` traversal and symlink escapes) and exists.
fn confined_path(base: &StdPath, rel: &str) -> Option<PathBuf> {
    let canon_base = std::fs::canonicalize(base).ok()?;
    let canon_target = std::fs::canonicalize(base.join(rel)).ok()?;
    canon_target
        .starts_with(&canon_base)
        .then_some(canon_target)
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

/// Write every HTML article in the ZIM out as a `.html` file under `dest`, so
/// the folder indexer treats the archive like a folder of web pages. Filtering
/// by MIME (`text/html`) is namespace-scheme agnostic (old `A`, new `C`). Only
/// articles are extracted (images/CSS stay in the .zim, keeping the search index
/// clean); the viewer serves an article's images/CSS/links on-demand from the
/// source archive (`serve_zim_content`), located via a `.zimsource` sidecar.
fn extract_zim(archive: &StdPath, dest: &StdPath) -> Result<()> {
    use zim::{MimeType, Target, Zim};

    let z = Zim::new(archive).map_err(|e| anyhow!("open zim: {e}"))?;

    // Pass 1: collect each HTML article AND each image, each tagged with the
    // on-disk extension to write it as. Articles become searchable text docs;
    // images are written out too so the folder indexer thumbnails them and
    // indexes them as searchable image docs — that's what fills the results-page
    // image gallery (their Wikipedia filenames carry the relevant keywords).
    let mut items: Vec<(String, u32, u32, &'static str)> = Vec::new();
    let mut article_count = 0usize;
    for entry in z.iterate_by_urls() {
        let MimeType::Type(mime) = &entry.mime_type else {
            continue;
        };
        let ext = if mime.starts_with("text/html") {
            article_count += 1;
            "html"
        } else if let Some(e) = image_ext_from_mime(mime) {
            e
        } else {
            continue;
        };
        if let Some(Target::Cluster(cluster, blob)) = entry.target {
            items.push((entry.url, cluster, blob, ext));
        }
    }
    if article_count == 0 {
        return Err(anyhow!(
            "no HTML articles found in this ZIM (unsupported layout or empty archive)"
        ));
    }

    // Group by cluster so each cluster is decompressed only once.
    items.sort_by_key(|item| item.1);

    let mut written = 0usize;
    let mut i = 0;
    while i < items.len() {
        let cluster_idx = items[i].1;
        match z.get_cluster(cluster_idx) {
            Ok(cluster) => {
                while i < items.len() && items[i].1 == cluster_idx {
                    let url = items[i].0.clone();
                    let blob = items[i].2;
                    let ext = items[i].3;
                    i += 1;
                    let bytes = match cluster.get_blob(blob) {
                        Ok(b) => b.to_vec(),
                        Err(_) => continue,
                    };
                    // Skip Kiwix redirect/alias stubs (tiny `<meta http-equiv=
                    // refresh>` pages) — navigation aliases, not real articles.
                    if ext == "html" && is_redirect_html(&bytes) {
                        continue;
                    }
                    let rel = if ext == "html" {
                        zim_article_path(&url)
                    } else {
                        zim_media_path(&url, ext)
                    };
                    let outpath = dest.join(rel);
                    if let Some(parent) = outpath.parent() {
                        if std::fs::create_dir_all(parent).is_err() {
                            continue;
                        }
                    }
                    // Best-effort per entry: one unwritable file (e.g. an
                    // over-long path) must not abort extraction of the other
                    // thousands of articles + images.
                    if std::fs::write(&outpath, &bytes).is_ok() {
                        written += 1;
                    }
                }
            }
            // A cluster we can't read/decompress (e.g. legacy bzip2/zlib) skips
            // its whole group rather than aborting the entire extraction.
            Err(_) => {
                while i < items.len() && items[i].1 == cluster_idx {
                    i += 1;
                }
            }
        }
    }

    if written == 0 {
        return Err(anyhow!("could not extract any articles from this ZIM"));
    }
    // Record the source .zim path next to the extracted dir so the viewer can
    // serve each article's images / CSS / links on-demand (serve_zim_content).
    let abs = std::fs::canonicalize(archive).unwrap_or_else(|_| archive.to_path_buf());
    let sidecar = PathBuf::from(format!("{}.zimsource", dest.display()));
    if let Err(e) = std::fs::write(&sidecar, abs.to_string_lossy().as_bytes()) {
        tracing::warn!("zim sidecar write failed ({}): {e}", sidecar.display());
    }
    tracing::info!(
        "extracted {written} ZIM entries (articles + images) to {}",
        dest.display()
    );
    Ok(())
}

/// Turn a ZIM entry URL into a safe, `.html`-suffixed relative path (drops `..`
/// traversal and Windows-invalid characters).
fn zim_article_path(url: &str) -> PathBuf {
    let mut path = PathBuf::new();
    for comp in url.split('/') {
        if comp.is_empty() || comp == "." || comp == ".." {
            continue;
        }
        let safe: String = comp
            .chars()
            .map(|c| match c {
                '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\' => '_',
                c if (c as u32) < 0x20 => '_',
                c => c,
            })
            .collect();
        path.push(safe);
    }
    if path.as_os_str().is_empty() {
        return PathBuf::from("index.html");
    }
    let has_html_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| matches!(e.to_ascii_lowercase().as_str(), "html" | "htm"))
        .unwrap_or(false);
    if has_html_ext {
        path
    } else {
        let mut s = path.into_os_string();
        s.push(".html");
        PathBuf::from(s)
    }
}

/// Map an image MIME type to the file extension we write it out as. Returns
/// `None` for types we can't rasterise a thumbnail for (e.g. SVG), which are
/// then skipped during extraction.
fn image_ext_from_mime(mime: &str) -> Option<&'static str> {
    match mime.split(';').next().unwrap_or(mime).trim() {
        "image/webp" => Some("webp"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/bmp" | "image/x-ms-bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        _ => None,
    }
}

/// Turn a ZIM image entry URL into a safe relative path under `_zim_media_/`,
/// keeping the descriptive Wikipedia filename (so search matches it) but forcing
/// the extension to match the actual bytes: Kiwix recodes most media to WebP, so
/// a URL ending in `.jpg` can really be WebP — writing it as `.jpg` would break
/// thumbnail decoding (which keys off the extension).
fn zim_media_path(url: &str, ext: &str) -> PathBuf {
    let mut path = PathBuf::from("_zim_media_");
    for comp in url.split('/') {
        if comp.is_empty() || comp == "." || comp == ".." {
            continue;
        }
        let safe: String = comp
            .chars()
            .map(|c| match c {
                '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\' => '_',
                c if (c as u32) < 0x20 => '_',
                c => c,
            })
            .collect();
        path.push(safe);
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("image")
        .to_string();
    match path.parent() {
        Some(parent) => parent.join(format!("{stem}.{ext}")),
        None => PathBuf::from(format!("_zim_media_/{stem}.{ext}")),
    }
}

/// Detect a Kiwix redirect/alias stub: a tiny HTML page whose only job is a
/// `<meta http-equiv="refresh" …>` to the real article (e.g. "Climate of
/// Washington, D.C." → "Washington, D.C.#Climate"). They're navigation aliases,
/// not content, so they're skipped during extraction.
fn is_redirect_html(bytes: &[u8]) -> bool {
    // Normalise the head — lowercase, drop whitespace + quotes — so every
    // `http-equiv="refresh"` / `='refresh'` / `=refresh` spelling collapses to a
    // single needle. Only the first 2 KB (the <head>) is worth scanning.
    let end = bytes.len().min(2048);
    let head: String = String::from_utf8_lossy(&bytes[..end])
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '"' && *c != '\'')
        .collect::<String>()
        .to_ascii_lowercase();
    head.contains("http-equiv=refresh")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confined_path_serves_inside_and_blocks_traversal() {
        let root = std::env::temp_dir().join(format!("sb-confine-{}", std::process::id()));
        std::fs::create_dir_all(root.join("site/img")).unwrap();
        std::fs::write(root.join("site/index.html"), b"<html></html>").unwrap();
        std::fs::write(root.join("site/img/logo.png"), b"x").unwrap();
        // A real file OUTSIDE the archive, so we test the prefix check rather
        // than just "the escaped file happens not to exist".
        std::fs::write(root.join("secret.txt"), b"top secret").unwrap();
        let base = root.join("site");

        assert!(confined_path(&base, "index.html").is_some());
        assert!(confined_path(&base, "img/logo.png").is_some());
        assert!(confined_path(&base, "../secret.txt").is_none());
        assert!(confined_path(&base, "../../etc/passwd").is_none());
        assert!(confined_path(&base, "missing.html").is_none());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn base_href_inserted_after_head() {
        let html = b"<!DOCTYPE html><html><head>\n<title>x</title></head><body>hi</body></html>";
        let s = String::from_utf8(inject_base_href(html, "/api/zim/content/a/")).unwrap();
        assert!(s.contains("<head><base href=\"/api/zim/content/a/\">"));
        assert!(s.find("<base").unwrap() < s.find("<title>").unwrap());
        assert!(s.contains("<body>hi</body>"));
    }

    #[test]
    fn base_href_handles_head_attributes() {
        let s = String::from_utf8(inject_base_href(b"<head lang=\"en\">z", "/c/")).unwrap();
        assert_eq!(s, "<head lang=\"en\"><base href=\"/c/\">z");
    }

    #[test]
    fn base_href_prepends_when_no_head() {
        let s = String::from_utf8(inject_base_href(b"<p>x</p>", "/b/")).unwrap();
        assert_eq!(s, "<base href=\"/b/\"><p>x</p>");
    }

    #[test]
    fn article_path_adds_html_and_sanitizes() {
        assert_eq!(
            zim_article_path("Albert_Einstein"),
            PathBuf::from("Albert_Einstein.html")
        );
        // literal '%' in the URL is preserved (round-trips through the endpoint)
        assert_eq!(
            zim_article_path("100%_renewable"),
            PathBuf::from("100%_renewable.html")
        );
        // an existing .html extension is kept (not doubled)
        assert_eq!(zim_article_path("page.html"), PathBuf::from("page.html"));
        // `..` traversal components are dropped
        assert_eq!(
            zim_article_path("../../secret"),
            PathBuf::from("secret.html")
        );
        assert_eq!(zim_article_path(""), PathBuf::from("index.html"));
    }

    #[test]
    fn zim_media_path_keeps_name_swaps_ext() {
        // Descriptive Wikipedia name kept (so it's searchable), extension forced
        // to match the real bytes, namespaced under _zim_media_/.
        let p = zim_media_path(
            "_assets_/abc123/12-07-13-washington-by-RalfR-08.jpg",
            "webp",
        );
        assert!(
            p.to_string_lossy()
                .replace('\\', "/")
                .ends_with("12-07-13-washington-by-RalfR-08.webp"),
            "{p:?}"
        );
        assert!(p.starts_with("_zim_media_"));
        // `..` traversal components are dropped.
        assert!(!zim_media_path("../../x.png", "png")
            .to_string_lossy()
            .contains(".."));
    }

    #[test]
    fn image_ext_from_mime_maps_known_types() {
        assert_eq!(image_ext_from_mime("image/webp"), Some("webp"));
        assert_eq!(image_ext_from_mime("image/png"), Some("png"));
        assert_eq!(image_ext_from_mime("image/jpeg"), Some("jpg"));
        // Parameters after `;` are ignored.
        assert_eq!(
            image_ext_from_mime("image/jpeg; charset=binary"),
            Some("jpg")
        );
        // SVG (no raster thumbnail) and non-images are skipped.
        assert_eq!(image_ext_from_mime("image/svg+xml"), None);
        assert_eq!(image_ext_from_mime("text/html"), None);
    }

    #[test]
    fn is_redirect_html_detects_meta_refresh() {
        let stub = br#"<html><head><title>Climate of Washington, D.C.</title>
            <meta http-equiv="refresh" content="0;URL='./Washington,_D.C.#Climate'" />
            </head><body><a href="./Washington,_D.C.#Climate">Climate of Washington, D.C.</a></body></html>"#;
        assert!(is_redirect_html(stub));
        // A real article (no meta refresh) is kept.
        let real =
            b"<html><head><title>Real</title></head><body><p>Lots of genuine prose.</p></body></html>";
        assert!(!is_redirect_html(real));
        assert!(!is_redirect_html(b""));
    }
}

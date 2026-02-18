# Changelog

## 2.3.0 — 2026-02-18

### Parallel ZIM extraction

- **Multithreaded C++ extractor** — ZIM processing now uses a producer-consumer thread pool. The main thread iterates ZIM entries and feeds a bounded work queue; N worker threads (`hardware_concurrency() - 2`, minimum 2) handle HTML parsing, image resolution, and thumbnail generation in parallel. Expected 3–6x speedup depending on core count.
- **Thread-safe architecture** — `BoundedQueue<T>` template class for work distribution, `std::atomic<int>` counters, mutex-protected image dedup map and stdout JSONL output. All worker-called functions (libzim reads, gumbo_parse, stb_image, librsvg/cairo) verified thread-safe.

### SVG rasterization

- **SVG thumbnail rendering** — SVG images are now rasterized to JPEG thumbnails via `librsvg` and `cairo` instead of being skipped. Renders at 4 sizes (100, 150, 300, 800px).
- **Icon filtering** — SVGs with dimensions ≤ 64px are rejected as UI icons. Filename-based filtering skips paths containing "icon", "logo", "button", "arrow", "chevron", "badge", or "favicon".
- **New dependencies** — `librsvg2-dev` and `libcairo2-dev` (build stage), `librsvg2-2`, `libcairo2`, `libcairo-gobject2` (runtime stage).

### Image deduplication

- **Cross-article dedup** — tracks image usage count across articles. Two-pass candidate selection: first pass skips images used ≥ 3 times (banners/logos), second pass falls back to any working candidate.
- **Result** — diverse, article-specific thumbnails instead of the same site banner on every article.

### Adaptive resource monitor improvements

- **Max batch size increased** — `BATCH_MAX` raised from 200 to 400 for Meilisearch writes. The adaptive monitor still scales down under memory pressure.

### Documentation

- **README overhaul** — new centered header with badge, expanded features list, ZIM architecture section with performance estimates, encryption details table, security table, C++ library reference, adaptive monitor behavior table, CLI usage for all three modes, updated project structure with `resource_monitor.py` and `stb/`.
- **CHANGELOG** — added 2.3.0 entries for all changes since 2.2.0.

---

## 2.2.0 — 2026-02-12

### C++ extraction engine

- **Native document extractor** — replaced Python libraries (pdfplumber, docx2txt, PyMuPDF, python-docx) with a custom C++ binary (`doc_extractor`) built on MuPDF. Supports PDF, DOCX, DOC, XLSX, HTML, HTM, TXT, and MD.
- **Single-file and batch modes** — CLI supports `--text`, `--images`, `--all` for individual files, and `--batch <dir>` for processing entire directories. Output is JSON (single) or JSONL (batch) on stdout.
- **Image extraction** — C++ binary extracts embedded images from PDF, DOCX, and XLSX files. Raw images are converted to multi-size thumbnails by the Python layer.

### Docker deployment

- **Multi-stage Dockerfile** — Stage 1 compiles the C++ extractor on `debian:bookworm`. Stage 2 is the runtime image (`python3.10-bookworm-slim`) with Meilisearch, the compiled binary, and Python dependencies.
- **docker-compose.yml** — single-container deployment with volume mounts for `/home`, `/mnt`, `/media` (read-only) so the app can index files from anywhere on the host.
- **entrypoint.sh** — starts Meilisearch, waits for health check, then starts the Flask app.

### Background indexing

- **Async folder indexing** — `POST /api/folder/index` starts a background thread. Frontend polls `GET /api/folder/index/status` for real-time progress (processed/total/indexed/failed counts).
- **Batch Meilisearch writes** — documents are batched (100 per batch) for efficient indexing. Applied to both `index_folder` and `sync_folders`.

### New file types

- **XLSX** — Excel spreadsheet text and image extraction via C++.
- **HTML/HTM** — HTML text extraction via C++.

### Dependency cleanup

- **Removed 4 Python dependencies** — `pdfplumber`, `docx2txt`, `pymupdf`, `python-docx`. All document extraction now handled by the C++ binary.
- **Removed dead code** — Python fallback extraction methods in `document_service.py` and `image_extractor.py` (5 methods removed).

---

## 2.1.0 — 2026-02-07

### Codebase cleanup

- **Template refactor** — All four templates (`index.html`, `settings.html`, `view.html`, `images.html`) now extend a shared `base.html` layout. Inline CSS and JS extracted into dedicated static files under `static/css/` and `static/js/`.
- **Removed dead migration code** — Deleted one-time JSON→SQLite migration functions from `meilisearch_service.py`, `config_service.py`, `vault_service.py`, and `routes/folders.py`. Removed the three migration config constants from `config.py`.
- **Removed stale files** — Deleted `indexed_folders.json.migrated`, `searchbox_config.json.outdated`, `IMAGE_SEARCH_GUIDE.md`, empty `dumps/` directory, and five one-off scripts in `scripts/`.
- **Removed unused static files** — Deleted `static/css/main.css` and `static/js/main.js` (intern duplicates, never referenced).
- **Fixed auto-start bug** — `auto_start_meilisearch` was registered with `atexit` (ran on shutdown instead of startup). Now runs immediately during app creation.
- **Documentation overhaul** — Rewrote README and CHANGELOG from scratch for accuracy and readability.

## 2.0.0 — 2026-02-05

### Image search

- Added `::image` search command — append it to any query to find images inside matching documents
- New `/images` page with a gallery grid, pagination, and hover previews
- "Search Images" button on the main search page
- Image extraction and thumbnailing for PDFs and DOCX files via `image_extractor.py`
- Meilisearch filter: `has_images = true` for efficient image-only queries

### AI-powered summaries

- Optional Ollama integration for streaming search result summaries
- RAG pipeline in `utils/rag_helper.py` — retrieves relevant document chunks and generates context-aware answers
- Settings UI for connecting to Ollama, choosing models, and toggling AI search
- Streaming endpoint at `/api/search/summary/stream`

## 1.0.0 — Initial release

- Full-text search with Meilisearch (PDFs, DOCX, TXT, Markdown)
- Boolean search syntax (`::&&`, `::||`, `::!`) and file type filtering (`::pdf`, `::docx`, etc.)
- Real-time syntax validation with color-coded feedback
- Vault system with 4-digit PIN protection
- Folder indexing — point at a directory, all supported files get indexed
- Document viewer with PDF and DOCX rendering
- SQLite-backed settings and configuration
- Dark theme UI

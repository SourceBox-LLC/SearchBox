<div align="center">

# SearchBox

**A self-hosted, local-first document search engine.**

Index your files, search them instantly, browse visual thumbnails, and keep sensitive documents in an encrypted vault. Everything runs on your machine — nothing leaves your computer.

Built with Flask, Meilisearch, a multithreaded C++ extraction engine, and optional Ollama AI integration. Ships as a single Docker container.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## Features

- **Full-text search** — PDFs, Word docs, Excel, HTML, text files, Markdown, and images
- **C++ extraction engine** — native text and image extraction via MuPDF with multithreaded ZIM processing
- **ZIM archive indexing** — index Wikipedia and other ZIM archives (16M+ articles) with parallel thumbnail generation, SVG rasterization, image deduplication, and adaptive resource management
- **Image search** — find images embedded in your documents
- **Explore** — masonry grid to visually browse all indexed documents
- **Encrypted vault** — AES-256-GCM storage with PIN protection (PBKDF2, 600k iterations)
- **Folder indexing** — background processing with real-time progress reporting
- **qBittorrent integration** — index completed downloads from your torrent client
- **AI summaries** — optional Ollama integration for streaming search result summaries
- **Security** — session auth, CSRF protection, rate limiting, input validation
- **Dark theme UI** — responsive layout across all pages

---

## Quick Start

### Prerequisites

- **[Docker](https://docs.docker.com/get-docker/)** and **Docker Compose**
- **[Ollama](https://ollama.com)** (optional, for AI summaries)

### Run with Docker

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
docker compose up -d
```

Open **http://localhost:5000** in your browser.

The container bundles Meilisearch, the compiled C++ extractor, and all Python dependencies. Your home directory, `/mnt`, and `/media` are mounted read-only so SearchBox can index files from anywhere on your system.

### Environment Variables

Set these in `docker-compose.yml` or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `FLASK_SECRET_KEY` | auto-generated | Flask session secret |
| `MEILI_MASTER_KEY` | `aSampleMasterKey` | Meilisearch authentication key |
| `MEILI_HOST` | `http://localhost` | Meilisearch host URL |
| `MEILI_PORT` | `7700` | Meilisearch port |
| `OLLAMA_URL` | `http://host.docker.internal:11434` | Ollama API URL |
| `SEARCHBOX_HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Flask bind address |
| `SEARCHBOX_PORT` | `5000` | Flask port |
| `SEARCHBOX_DB_DIR` | project root (`/app/instance` in Docker) | SQLite database directory |

### Local Development (without Docker)

Requires Python 3.10+, [uv](https://docs.astral.sh/uv/), a Meilisearch binary, and optionally the compiled `doc_extractor` binary on your PATH.

```bash
uv sync
uv run python app.py
```

> **Note:** Without the C++ `doc_extractor` binary, text and image extraction for PDF, DOCX, XLSX, and HTML files will not work. The binary must be compiled from `extractor/` and placed on your PATH. TXT, MD, and image files work without it.

### First-Time Setup

1. Open **http://localhost:5000**
2. Go to the **Index Folder** tab
3. Enter a folder path and click **Index Folder**
4. Watch the progress bar as files are processed

---

## Search Syntax

SearchBox supports a query language for filtering results by file type and combining conditions.

### Basics

| What you type | What it does |
|---|---|
| `quarterly report` | Search all files for "quarterly report" |
| `budget::pdf` | Search only PDFs |
| `notes::pdf::docx::txt` | Search across multiple file types |
| `*::pdf` | Browse all PDFs in the index |
| `"exact phrase"::md` | Exact phrase match in Markdown files |

### Boolean Operators

| Operator | Meaning | Example |
|---|---|---|
| `::&&` | AND | `ml::pdf::&& ai::txt` — PDFs with "ml" AND text files with "ai" |
| `::||` | OR | `research::pdf::|| notes::docx` — either match |
| `::!` | NOT | `report::pdf::! draft::tmp` — reports, excluding drafts |

### Image Search

Append `::image` to any query to search for images inside matching documents:

```
machine learning::image
```

You can also click the **Search Images** button, or use the dedicated gallery at `/images`.

### Validation Feedback

The search bar border changes color as you type:
- **Green** — valid syntax, ready to search
- **Orange** — incomplete (e.g. operator without a second term)
- **Red** — syntax error

---

## ZIM Archive Indexing

SearchBox can index ZIM archives (the offline format used by Wikipedia, Stack Exchange, and other projects). Designed to handle archives with millions of articles.

### How It Works

1. The **C++ extractor** iterates all HTML articles in the ZIM archive using `libzim`
2. For each article, it extracts plain text (via Gumbo HTML parser) and generates multi-size JPEG thumbnails
3. **Parallel processing** — a thread pool (auto-detected from CPU cores) processes articles concurrently using a producer-consumer model
4. The **Python layer** reads JSONL output line-by-line and writes to Meilisearch in adaptive batches

### Performance Features

- **Multithreaded extraction** — `hardware_concurrency() - 2` worker threads (minimum 2) for parallel HTML parsing, image resolution, and thumbnail generation
- **SVG rasterization** — SVG images rendered to JPEG thumbnails via `librsvg` and `cairo`, with icon filtering (skips UI icons ≤ 64px)
- **Image deduplication** — tracks image usage across articles to avoid repeated banners/logos dominating thumbnails
- **Adaptive resource monitor** — reads `/proc/meminfo` every 50 articles to dynamically adjust batch sizes (10–400), defer image processing under memory pressure, and apply backpressure sleep during high load
- **Bounded work queue** — prevents memory explosion on large archives by limiting in-flight work items

### Estimated Performance

| CPU Cores | Worker Threads | Est. Speedup |
|-----------|---------------|-------------|
| 4 | 2 | ~1.8x |
| 8 | 6 | ~4x |
| 12 | 10 | ~5.5x |
| 16 | 14 | ~6x |

---

## Explore

The Explore page (`/explore`) provides a visual, browsable grid of all indexed documents — one representative thumbnail per document.

- **Masonry layout** — cards sized to their natural image dimensions
- **Filter pills** — narrow by file type (PDF, DOCX, TXT, MD, Images)
- **Sort** — by recent, name, or file size
- **Infinite scroll** — loads 40 documents at a time
- **Source badges** — folder, vault, qBittorrent, ZIM, or ZIP origin
- Click any card to open the document viewer

---

## Supported File Types

| Type | Extensions | Extraction Method |
|---|---|---|
| Documents | `.pdf`, `.docx`, `.doc`, `.xlsx` | C++ (MuPDF / libzip / pugixml) |
| Web | `.html`, `.htm` | C++ (Gumbo) |
| Text | `.txt`, `.md` | Native Python read |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp` | Indexed as metadata |
| Archives | `.zim` | C++ (libzim) with parallel processing |
| Archives | `.zip` | Python (zipfile) |

---

## Vault

The vault provides AES-256-GCM encrypted storage for sensitive documents.

1. **Set a PIN** — Settings → Vault Security → enter a 4-digit PIN
2. **Upload to vault** — use the upload dialog's "Vault" tab
3. **Access vault files** — click the lock icon on a search result, then enter your PIN

### Encryption Details

| Layer | Algorithm | Detail |
|---|---|---|
| PIN → KEK | PBKDF2-HMAC-SHA256 | 600,000 iterations, 16-byte random salt |
| KEK → DEK | AES-256-GCM | Per-file random 32-byte Data Encryption Key |
| DEK → File | AES-256-GCM | 12-byte nonce + ciphertext + 16-byte auth tag |

- Files on disk: `vault/{id}_{filename}.enc`
- Temp decrypted files auto-deleted after 30 seconds
- PIN can be changed or reset from Settings

---

## qBittorrent Integration

Index completed downloads from a local qBittorrent instance.

1. Go to **Settings → qBittorrent**
2. Enable the toggle and enter your Web UI host, port, username, and password
3. Click **Test Connection** to verify
4. Click **Sync Downloads** to index completed torrents

Indexed torrents appear in search results with an orange download icon and "qBittorrent" source label. Sync is manual (click the button to pull new completions).

---

## Security

| Feature | Implementation |
|---|---|
| **Session auth** | PIN verified once per session, 30-minute timeout, server-side storage |
| **CSRF protection** | Flask-WTF CSRF tokens on all state-changing requests |
| **Rate limiting** | 5 PIN attempts per IP, 5-minute lockout |
| **Input validation** | `secure_filename()` on uploads, Meilisearch filter injection prevention |
| **SSRF guards** | Ollama URL validation |
| **No external requests** | Everything runs locally — nothing leaves your machine |

---

## AI Search (Optional)

If you have [Ollama](https://ollama.com) running locally, SearchBox can generate AI-powered summaries of your search results.

1. Install Ollama and pull a model (e.g. `ollama pull gemma3:12b`)
2. In Settings → AI Search, enable it and set the Ollama URL (default: `http://localhost:11434`)
3. Choose a model — SearchBox will stream a summary alongside your results

This is entirely optional. SearchBox works fine without it.

---

## Architecture

### C++ Extraction Engine

SearchBox uses a custom C++ binary (`doc_extractor`) for fast document processing. Built with:

| Library | Purpose |
|---|---|
| MuPDF | PDF text and image extraction |
| libzip | DOCX/XLSX (Open XML) decompression |
| pugixml | XML parsing for DOCX/XLSX content |
| Gumbo | HTML parsing and text extraction |
| libzim | ZIM archive reading |
| librsvg + cairo | SVG rasterization to JPEG |
| stb_image | Image decoding (JPEG, PNG, GIF, WebP, BMP) |
| stb_image_resize2 | Thumbnail resizing |
| stb_image_write | JPEG thumbnail output |

The binary supports three modes:

```bash
# Single file
doc_extractor <file> --text
doc_extractor <file> --images <out_dir>
doc_extractor <file> --all <out_dir>

# Batch directory
doc_extractor --batch <dir> --out <image_out_dir>
doc_extractor --batch <dir> --text-only

# ZIM archive (parallel)
doc_extractor --zim <path>
doc_extractor --zim <path> --extract-images <dir>
doc_extractor --zim <path> --limit <N>
```

Output is JSON (single file) or JSONL (batch/ZIM) on stdout. Logs go to stderr. If the binary is not available, extraction fails for document formats (PDF, DOCX, XLSX, HTML). Simple formats (TXT, MD) are read natively in Python.

### Docker Container

Multi-stage build:

1. **Stage 1** (`debian:bookworm`) — compiles the C++ extractor with CMake, linking MuPDF, libzim, librsvg, cairo, Gumbo, and all dependencies
2. **Stage 2** (`uv:python3.10-bookworm-slim`) — runtime image with uv, Meilisearch, Python deps, and the compiled binary

Both stages use Debian Bookworm for glibc compatibility. The entrypoint starts Meilisearch, waits for its health check, then starts the Flask app.

### Adaptive Resource Monitor

The `AdaptiveMonitor` reads `/proc/meminfo` and `/proc/self/status` to dynamically tune indexing behavior:

| Memory Usage | Batch Size | Image Processing | Backpressure |
|---|---|---|---|
| < 50% | Scale up (→ 400) | Normal | None |
| 50–65% | Default (50) | Normal | None |
| 65–80% | Scale down | Normal | None |
| 80–90% | Minimum (10) | Deferred | None |
| > 90% | Minimum (10) | Deferred | 2s cooldown sleep |

Deferred images are queued and processed later when memory recovers below 50%.

## Project Structure

```
SearchBox/
├── app.py                     # Flask application factory and entrypoint
├── config.py                  # Constants (paths, allowed extensions)
├── models.py                  # SQLAlchemy models (Settings, IndexedFolder, VaultConfig, EncryptedFile, QBTorrent, IndexedArchive)
├── Dockerfile                 # Multi-stage build (C++ compiler → Python runtime)
├── docker-compose.yml         # Container config with volume mounts
├── entrypoint.sh              # Starts Meilisearch → Flask
├── pyproject.toml             # Python dependencies (uv)
│
├── extractor/                 # C++ document extraction engine
│   ├── CMakeLists.txt         #   Build config (MuPDF, libzim, librsvg, cairo, Gumbo)
│   └── src/
│       ├── main.cpp           #   Extractor CLI with parallel ZIM processing
│       └── stb/               #   stb single-header image libraries
│
├── routes/                    # Flask Blueprints
│   ├── helpers.py             #   Shared route helpers (get_config, get_index)
│   ├── pages.py               #   Page routes (/, /settings, /view, /images, /explore)
│   ├── documents.py           #   Document CRUD, upload, thumbnails, file serving
│   ├── folders.py             #   Folder indexing (background), sync, removal
│   ├── zim.py                 #   ZIM/ZIP archive indexing with progress tracking
│   ├── meilisearch_routes.py  #   Meilisearch start/stop/status/config
│   ├── settings.py            #   Search history, AI prefs, sync times, factory reset
│   ├── vault.py               #   Vault PIN setup/verify/change/reset/lock
│   ├── ollama.py              #   Ollama status, models, AI summaries
│   └── qbittorrent.py         #   qBittorrent config, sync, indexed torrents
│
├── services/                  # Business logic
│   ├── config_service.py      #   Read/write app config from SQLite
│   ├── meilisearch_service.py #   Meilisearch process management and client
│   ├── document_service.py    #   C++ extractor integration, file validation
│   ├── zim_service.py         #   ZIM/ZIP indexing with adaptive batching
│   ├── vault_service.py       #   PIN hashing, vault config
│   └── qbittorrent_service.py #   qBittorrent Web API client
│
├── utils/                     # Helpers
│   ├── auth.py                #   @require_pin decorator, session validation
│   ├── crypto.py              #   AES-256-GCM envelope encryption
│   ├── resource_monitor.py    #   Adaptive batch sizing via /proc
│   ├── image_extractor.py     #   Thumbnail generation from C++ images
│   ├── ollama_client.py       #   Ollama HTTP client
│   ├── ollama_helper.py       #   Model recommendations, connection testing
│   └── rag_helper.py          #   RAG pipeline for AI summaries
│
├── templates/                 # Jinja2 (extends base.html)
│   ├── base.html              #   Shared layout, fonts, PIN modal
│   ├── index.html             #   Main search page
│   ├── settings.html          #   Settings panel
│   ├── view.html              #   Document viewer
│   ├── images.html            #   Image search gallery
│   └── explore.html           #   Visual document browser
│
└── static/
    ├── css/                   #   Per-page stylesheets
    ├── js/                    #   Per-page JavaScript
    └── thumbnails/            #   Generated document thumbnails (gitignored)
```

---

## API Reference

### Pages

| Method | Path | Description |
|---|---|---|
| GET | `/` | Main search page |
| GET | `/settings` | Settings panel |
| GET | `/view/<doc_id>` | Document viewer |
| GET | `/images` | Image search gallery |
| GET | `/explore` | Visual document browser |

### Documents

| Method | Path | Description |
|---|---|---|
| GET | `/api/documents` | List all indexed documents |
| GET | `/api/document/<doc_id>` | Get a single document |
| POST | `/api/document/<doc_id>/open` | Open document in system app |
| POST | `/api/document/<doc_id>/reveal` | Show document in file manager |
| DELETE | `/api/documents/<doc_id>` | Delete a document from the index |
| POST | `/api/upload` | Upload and index a file |
| GET | `/api/thumbnail/<doc_id>` | Get document thumbnail |
| GET | `/api/pdf/<doc_id>` | Serve a PDF for viewing |
| GET | `/api/docx/<doc_id>` | Serve a DOCX for viewing |
| GET | `/local-image/<path>` | Serve a local image (for Markdown rendering) |

### Folders

| Method | Path | Description |
|---|---|---|
| GET | `/api/folders` | List indexed folders |
| POST | `/api/folder/index` | Start background folder indexing job |
| GET | `/api/folder/index/status` | Poll indexing job progress |
| POST | `/api/folders/sync` | Sync all indexed folders |
| POST | `/api/folder/remove` | Remove an indexed folder |

### ZIM/ZIP Archives

| Method | Path | Description |
|---|---|---|
| POST | `/api/zim/index` | Index a ZIM or ZIP archive |
| GET | `/api/zim/index/status` | Poll archive indexing progress |
| GET | `/api/zim/indexed` | List indexed archives |
| POST | `/api/zim/remove` | Remove an indexed archive |
| POST | `/api/zim/sync` | Re-index all tracked archives |
| GET | `/api/zim/article?path=...&url=...` | Serve a ZIM article's HTML |
| GET | `/api/zim/image?path=...&img=...` | Serve an image from a ZIM archive |

### Meilisearch

| Method | Path | Description |
|---|---|---|
| GET | `/api/meilisearch/status` | Status and document count |
| POST | `/api/meilisearch/start` | Start the search engine |
| POST | `/api/meilisearch/stop` | Stop the search engine |
| GET | `/api/meilisearch/config` | Get search engine config |
| POST | `/api/meilisearch/config` | Update search engine config |
| POST | `/api/meilisearch/clear` | Clear the entire index |

### Vault

| Method | Path | Description |
|---|---|---|
| GET | `/api/vault/status` | Check if PIN is set |
| POST | `/api/vault/setup` | Set initial PIN |
| POST | `/api/vault/verify` | Verify a PIN |
| POST | `/api/vault/change-pin` | Change PIN |
| POST | `/api/vault/reset` | Reset PIN (requires current PIN) |
| POST | `/api/vault/lock` | Lock the session |
| GET | `/api/vault/session` | Check session status and remaining time |

### qBittorrent

| Method | Path | Description |
|---|---|---|
| GET | `/api/qbittorrent/status` | Connection status and transfer stats |
| GET | `/api/qbittorrent/config` | Get qBittorrent settings |
| POST | `/api/qbittorrent/config` | Save qBittorrent settings |
| POST | `/api/qbittorrent/test` | Test connection with provided credentials |
| GET | `/api/qbittorrent/torrents` | List completed and active torrents |
| POST | `/api/qbittorrent/sync` | Index new completed torrents |
| GET | `/api/qbittorrent/indexed` | List indexed torrents |
| POST | `/api/qbittorrent/remove` | Remove a torrent and its documents from the index |

### Settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings/search-history` | Get saved search history |
| POST | `/api/settings/search-history` | Add a query to search history |
| DELETE | `/api/settings/search-history` | Clear all search history |
| GET | `/api/settings/ai-enhancement` | Get AI history enhancement preference |
| PUT | `/api/settings/ai-enhancement` | Set AI history enhancement preference |
| GET | `/api/settings/last-sync-time` | Get last folder sync timestamp |
| PUT | `/api/settings/last-sync-time` | Set last folder sync timestamp |
| GET | `/api/settings/last-archive-sync-time` | Get last archive sync timestamp |
| PUT | `/api/settings/last-archive-sync-time` | Set last archive sync timestamp |
| POST | `/api/settings/factory-reset` | Wipe all data and restore defaults |

### Ollama (AI)

| Method | Path | Description |
|---|---|---|
| GET | `/api/ollama/status` | Ollama connection status |
| GET | `/api/ollama/models` | List available models |
| POST | `/api/ollama/test` | Test Ollama connection |
| POST | `/api/ollama/pull` | Pull a model |
| GET | `/api/ollama/recommendations` | Get search recommendations |
| POST | `/api/search/summary` | Generate AI summary |
| POST | `/api/search/summary/stream` | Stream AI summary |

---

## Troubleshooting

**Container won't start**
- Check Docker logs: `docker compose logs -f`
- Make sure ports 5000 and 7700 aren't already in use: `lsof -i :5000 -i :7700`
- Verify Docker and Docker Compose are installed

**"Invalid folder path" when indexing**
- The folder must be accessible inside the container. By default, `/home`, `/mnt`, and `/media` are mounted. If your files are elsewhere, add a volume mount to `docker-compose.yml`

**No search results**
- Make sure Meilisearch is running (green status in Settings)
- Verify your files are indexed (check the document count)
- Try a simpler query first — just a word, no operators

**C++ extractor errors**
- Check startup logs for `C++ doc_extractor found: /usr/local/bin/doc_extractor`
- If missing, rebuild the Docker image: `docker compose build --no-cache`

**Vault PIN not working**
- PINs are exactly 4 digits
- If you've forgotten it, you'll need to reset from Settings (requires the current PIN)

**AI summaries not working**
- Make sure Ollama is running on your host: `ollama serve`
- The container connects via `http://host.docker.internal:11434` by default
- Verify you have a model pulled: `ollama list`

---

## Contributing

1. Fork the repo
2. Create a branch
3. Make your changes
4. Test all pages (`/`, `/settings`, `/view/<id>`, `/images`, `/explore`)
5. Open a pull request

---

## License

MIT
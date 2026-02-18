# SearchBox

A local document search engine. Index your files, search them instantly, and keep sensitive documents in an encrypted vault. Everything runs on your machine — nothing leaves your computer.

Built with Flask, Meilisearch, a C++ document extraction engine, and an optional Ollama integration for AI-powered summaries. Runs in a single Docker container.

---

## What it does

- **Full-text search** across PDFs, Word docs, Excel spreadsheets, HTML, text files, and Markdown
- **C++ extraction engine** — fast native text and image extraction via MuPDF, replacing Python libraries
- **Image search** — find images embedded in your documents
- **Explore** — visual masonry grid to browse all indexed documents
- **ZIM/ZIP indexing** — index Wikipedia dumps and other ZIM/ZIP archives
- **Vault** — AES-256-GCM encrypted storage with PIN protection
- **Folder indexing** — point it at a folder and everything inside becomes searchable, with background processing and progress reporting
- **qBittorrent integration** — index completed downloads directly from your torrent client
- **AI summaries** — optional Ollama integration for search result summaries and recommendations
- **Session auth & CSRF** — session-based PIN authentication with CSRF protection
- **Dark theme UI** with a responsive layout

---

## Quick start

### Prerequisites

- **[Docker](https://docs.docker.com/get-docker/)** and **Docker Compose**
- **[Ollama](https://ollama.com)** (optional, for AI summaries)

### Run with Docker (recommended)

```bash
git clone <repository-url>
cd SearchBox
docker compose up -d
```

Open **http://localhost:5000** in your browser.

The container bundles Meilisearch, the C++ extraction binary, and all Python dependencies. Your home directory, `/mnt`, and `/media` are mounted read-only so SearchBox can index files from anywhere on your system.

### Environment variables

Set these in `docker-compose.yml` or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `FLASK_SECRET_KEY` | `super-secret-change-me` | Flask session secret |
| `MEILI_MASTER_KEY` | `aSampleMasterKey` | Meilisearch authentication key |
| `OLLAMA_URL` | `http://host.docker.internal:11434` | Ollama API URL |

### Local development (without Docker)

Requires Python 3.10+, [uv](https://docs.astral.sh/uv/), a Meilisearch binary, and optionally the compiled `doc_extractor` binary on your PATH.

```bash
uv sync
uv run python app.py
```

> **Note:** Without the C++ `doc_extractor` binary, text and image extraction for PDF, DOCX, XLSX, and HTML files will not work. The binary must be compiled from `extractor/` and placed on your PATH. TXT, MD, and image files work without it.

### First-time setup

1. Open **http://localhost:5000**
2. Go to the **Index Folder** tab
3. Enter a folder path and click **Index Folder**
4. Watch the progress bar as files are processed

---

## Search syntax

SearchBox supports a query language for filtering results by file type and combining conditions.

### Basics

| What you type | What it does |
|---|---|
| `quarterly report` | Search all files for "quarterly report" |
| `budget::pdf` | Search only PDFs |
| `notes::pdf::docx::txt` | Search across multiple file types |
| `*::pdf` | Browse all PDFs in the index |
| `"exact phrase"::md` | Exact phrase match in Markdown files |

### Boolean operators

| Operator | Meaning | Example |
|---|---|---|
| `::&&` | AND | `ml::pdf::&& ai::txt` — PDFs with "ml" AND text files with "ai" |
| `::||` | OR | `research::pdf::|| notes::docx` — either match |
| `::!` | NOT | `report::pdf::! draft::tmp` — reports, excluding drafts |

### Image search

Append `::image` to any query to search for images inside matching documents:

```
machine learning::image
```

You can also click the **Search Images** button, or use the dedicated gallery at `/images`.

---

## Explore

The Explore page (`/explore`) provides a visual, browsable grid of all indexed documents — one representative thumbnail per document.

- **Masonry layout** — cards sized to their natural image dimensions
- **Filter pills** — narrow by file type (PDF, DOCX, TXT, MD, Images)
- **Sort** — by recent, name, or file size
- **Infinite scroll** — loads 40 documents at a time
- **Source badges** — folder, vault, or qBittorrent origin
- Click any card to open the document viewer

### Validation feedback

The search bar border changes color as you type:
- **Green** — valid syntax, ready to search
- **Orange** — incomplete (e.g. operator without a second term)
- **Red** — syntax error

---

## Supported file types

| Type | Extensions | Extraction |
|---|---|---|
| Documents | `.pdf`, `.docx`, `.doc`, `.xlsx` | C++ (MuPDF / libzip) |
| Web | `.html`, `.htm` | C++ |
| Text | `.txt`, `.md` | Native Python read |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp` | Indexed as metadata |
| Archives | `.zim`, `.zip` | Python (libzim / zipfile) |

---

## Vault

The vault provides AES-256-GCM encrypted storage for sensitive documents.

1. **Set a PIN** — Settings → Vault Security → enter a 4-digit PIN
2. **Upload to vault** — use the upload dialog's "Vault" tab
3. **Access vault files** — click the lock icon on a search result, then enter your PIN

**How it works:**
- PIN → PBKDF2-HMAC-SHA256 (600k iterations) → Key Encryption Key (KEK)
- Each file gets a unique random Data Encryption Key (DEK), wrapped by the KEK
- Files on disk: `vault/{id}_{filename}.enc`
- Temp decrypted files auto-deleted after 30 seconds

Vault files are stored locally in the `vault/` directory. The PIN can be changed or reset from Settings.

---

## qBittorrent integration

Index completed downloads from a local qBittorrent instance.

1. Go to **Settings → qBittorrent**
2. Enable the toggle and enter your Web UI host, port, username, and password
3. Click **Test Connection** to verify
4. Click **Sync Downloads** to index completed torrents

Indexed torrents appear in search results with an orange download icon and "qBittorrent" source label. Sync is manual (click the button to pull new completions).

---

## Security

- **Session auth** — PIN verified once per session (30-minute timeout), stored server-side
- **CSRF protection** — all state-changing requests require a CSRF token
- **Rate limiting** — 5 PIN attempts per IP, 5-minute lockout
- **Input validation** — `secure_filename()` on uploads, Meilisearch filter injection prevention, SSRF guards on Ollama URL
- **No external requests** — everything runs locally, nothing leaves your machine

---

## AI search (optional)

If you have [Ollama](https://ollama.com) running locally, SearchBox can generate AI-powered summaries of your search results.

1. Install Ollama and pull a model (e.g. `ollama pull llama2`)
2. In Settings → AI Search, enable it and set the Ollama URL (default: `http://localhost:11434`)
3. Choose a model — SearchBox will stream a summary alongside your results

This is entirely optional. SearchBox works fine without it.

---

## Architecture

### C++ extraction engine

SearchBox uses a custom C++ binary (`doc_extractor`) built with MuPDF for fast document processing. The binary supports two modes:

- **Single file** — `doc_extractor <file> --text` or `doc_extractor <file> --images <out_dir>`
- **Batch directory** — `doc_extractor --batch <dir> --out <image_out_dir>`

Output is JSON (single file) or JSONL (batch) on stdout. The Python app calls it via subprocess and parses the results. If the binary is not available, extraction fails for document formats (PDF, DOCX, XLSX, HTML). Simple formats (TXT, MD) are read natively in Python.

### Docker container

The Dockerfile uses a multi-stage build:

1. **Stage 1** (`debian:bookworm`) — compiles the C++ extractor with CMake
2. **Stage 2** (`python3.10-bookworm-slim`) — runtime image with Meilisearch, Python deps, and the compiled binary

Both stages use Debian Bookworm to ensure glibc compatibility. The entrypoint starts Meilisearch, waits for it to be healthy, then starts the Flask app.

### Background indexing

Folder indexing runs in a background thread with progress tracking. The frontend polls `/api/folder/index/status` for real-time updates. Documents are batched (100 per batch) for efficient Meilisearch writes.

## Project structure

```
SearchBox/
├── app.py                  # Application factory and entrypoint
├── config.py               # Constants (paths, allowed extensions)
├── models.py               # SQLAlchemy models (Settings, IndexedFolder, VaultConfig)
├── Dockerfile              # Multi-stage build (C++ compiler + Python runtime)
├── docker-compose.yml      # Container config with volume mounts
├── entrypoint.sh           # Starts Meilisearch + Flask app
│
├── extractor/              # C++ document extraction engine
│   ├── CMakeLists.txt      #   CMake build config
│   └── src/
│       └── main.cpp        #   MuPDF-based text/image extractor CLI
│
├── routes/                 # Flask Blueprints
│   ├── pages.py            #   Page routes (/, /settings, /view, /images, /explore)
│   ├── documents.py        #   Document CRUD, upload, thumbnails, file serving
│   ├── folders.py          #   Folder indexing (background), sync, removal, progress
│   ├── zim.py              #   ZIM/ZIP archive indexing
│   ├── meilisearch_routes.py  # Meilisearch start/stop/status/config
│   ├── settings.py         #   App settings API
│   ├── vault.py            #   Vault PIN setup/verify/change/reset/lock/session
│   ├── ollama.py           #   Ollama status, models, AI summaries
│   └── qbittorrent.py      #   qBittorrent config, sync, indexed torrents
│
├── services/               # Business logic
│   ├── config_service.py   #   Read/write app config from SQLite
│   ├── meilisearch_service.py # Meilisearch process management and client
│   ├── document_service.py #   C++ extractor integration, file validation
│   ├── zim_service.py      #   ZIM/ZIP archive parsing and indexing
│   ├── vault_service.py    #   PIN hashing, vault config
│   └── qbittorrent_service.py # qBittorrent Web API client
│
├── utils/                  # Helpers
│   ├── auth.py             #   @require_pin decorator, session validation
│   ├── crypto.py           #   AES-256-GCM encryption for vault
│   ├── ollama_client.py    #   Ollama HTTP client
│   ├── ollama_helper.py    #   Model recommendations, connection testing
│   ├── rag_helper.py       #   RAG pipeline for AI summaries
│   └── image_extractor.py  #   Thumbnail generation from C++ extracted images
│
├── templates/              # Jinja2 (extends base.html)
│   ├── base.html           #   Shared layout, fonts, PIN modal, base styles
│   ├── index.html          #   Main search page
│   ├── settings.html       #   Settings panel
│   ├── view.html           #   Document viewer
│   ├── images.html         #   Image search gallery
│   └── explore.html        #   Visual document browser
│
├── static/
│   ├── css/                #   base.css, index.css, settings.css, view.css, images.css, explore.css
│   ├── js/                 #   base.js, index.js, settings.js, view.js, images.js, explore.js
│   └── thumbnails/         #   Generated document thumbnails
│
├── vault/                  # Encrypted vault storage
├── meili_data/             # Meilisearch database files (Docker volume)
├── pyproject.toml          # Python dependencies
└── uv.lock                 # Locked dependency versions
```

---

## API reference

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
| GET | `/api/zim/indexed` | List indexed archives |
| POST | `/api/zim/remove` | Remove an indexed archive |
| GET | `/api/zim/article/<archive_id>/<path>` | Serve a ZIM article |
| GET | `/api/zim/image/<archive_id>/<path>` | Serve a ZIM image |

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
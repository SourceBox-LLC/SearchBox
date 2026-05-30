# SearchBox

Private, local-first document search. Index PDFs, docs, images, and more;
search instantly with optional AI summaries via Ollama. Everything runs on
your own machine — nothing leaves it.

Written in Rust. Free and open source.

## Stack

- **[Axum](https://github.com/tokio-rs/axum)** web server
- **[SQLite](https://www.sqlite.org/)** via `sqlx` — single-file DB
- **[Meilisearch](https://www.meilisearch.com/)** as a sidecar — typo-tolerant full-text search
- **[MiniJinja](https://github.com/mitsuhiko/minijinja)** for HTML templates
- **[Ollama](https://ollama.com/)** (optional) — local LLMs for RAG summaries
- **Pure-Rust document extraction** — `pdf-extract`, `calamine` (XLSX),
  `quick-xml` + `zip` (DOCX), `pulldown-cmark`, `scraper` (HTML)
- **AES-256-GCM vault** with PBKDF2-derived KEK (600k rounds) — encrypt
  uploaded docs with the admin password
- **Single-binary deploy** — templates and static assets are embedded via
  `rust-embed`; the release binary needs no sibling `templates/` or
  `static/` dirs. Debug builds read from disk so edits are live.

## Install

Pick the path that matches your platform:

### Docker (Linux, macOS, Windows)

```bash
docker compose up -d
# App:          http://localhost:8080
# Meilisearch:  http://localhost:7700
```

First launch walks you through admin setup, then index a folder from the
Settings page. Data lives in named volumes (`searchbox-data`,
`searchbox-vault`, `searchbox-thumbnails`, `meili-data`) so `docker compose
down` is non-destructive.

One-shot run without compose:

```bash
docker run -d --name searchbox \
  -p 8080:8080 -p 7700:7700 \
  -v searchbox-data:/app/instance \
  -v searchbox-vault:/app/vault \
  -v searchbox-thumbnails:/app/static/thumbnails \
  -v meili-data:/app/meili_data \
  -e SEARCHBOX_SECRET_KEY=change-me \
  sourcebox/searchbox:latest
```

On Windows, if you want to index drive letters (`C:\`, `D:\`, …) rather
than whatever Docker maps into the Linux VM, add the drive-letter overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d
```

### Windows installer (MSI)

1. Go to [Releases](https://github.com/SourceBox-LLC/SearchBox/releases).
2. Download the latest `SearchBox-<version>-x86_64.msi`.
3. Double-click. The wizard installs SearchBox + a bundled Meilisearch
   to `C:\Program Files\SourceBox\SearchBox\`, drops a Start Menu
   shortcut, and registers an uninstaller in Add/Remove Programs.
4. Start Menu → **SearchBox**. Browse to <http://localhost:8080>.

Runtime data (DB, vault, thumbnails, Meilisearch index) is written to
`%LocalAppData%\SearchBox\` — uninstalling the app leaves your data
intact. A second MSI install upgrades in place.

Maintainers: the MSI is built and published by GitHub Actions on every
`v*` tag. See [`BUILD.md`](BUILD.md) for the release flow and for
building installers locally during iteration.

### From source

Requires Rust 1.84+ and Meilisearch installed (or drop a `meilisearch`
binary next to `searchbox` — the app auto-detects it).

```bash
cargo run --release
# browse to http://localhost:8080 — it'll walk you through first-admin setup
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `SEARCHBOX_HOST` | `0.0.0.0` | Bind address |
| `SEARCHBOX_PORT` | `8080` | Bind port |
| `SEARCHBOX_DB_DIR` | `.` | Where `searchbox.db` lives |
| `SEARCHBOX_BASE_DIR` | cwd | Root for writable runtime dirs (`vault/`, `meili_data/`, `static/thumbnails/`). Templates and static assets are baked into the binary — no path config needed. |
| `SEARCHBOX_SECRET_KEY` | dev stub | Session cookie signing (set this in prod) |
| `MEILI_PUBLIC_HOST` | — | Browser-facing Meilisearch URL when it differs from server-side (e.g. Docker bridge) |
| `MEILI_PORT` | `7700` | Port for the Meilisearch sidecar (entrypoint.sh) |
| `MEILI_MASTER_KEY` | dev stub | Meilisearch master key (entrypoint.sh) |
| `OLLAMA_URL` | — | Configured via the Settings page at runtime; this env var is only read by tooling |

The rest — Meilisearch path, Ollama URL / model / timeout, qBittorrent
credentials, AI-search toggle — live in the `settings` table and are
editable via the Settings UI.

## Layout

```
├── src/           # Rust source
│   ├── main.rs
│   ├── config.rs, db.rs, state.rs, error.rs, templates.rs
│   ├── auth/      # argon2 + session extractor
│   ├── models/    # SQLx FromRow structs + CRUD
│   ├── routes/    # Axum route handlers
│   ├── services/  # Meili, Ollama, extractor, Meili supervisor
│   ├── vault/     # AES-256-GCM + PBKDF2 wrap/unwrap
│   └── jobs/      # In-memory background job tracker
├── schema.sql     # Applied on boot (CREATE TABLE IF NOT EXISTS)
├── templates/     # HTML (rendered by MiniJinja)
├── static/        # CSS + JS
├── Dockerfile
├── docker-compose.yml
├── fly.toml
└── entrypoint.sh  # Starts Meilisearch sidecar then execs `searchbox`
```

## Features

- **Full-text search** with filter syntax: `::pdf`, `::docx`, `::image`,
  boolean `::&&`, `::||`, `::!`
- **Folder indexing** — point at any directory, progress streams via
  background jobs; poll `/api/folder/index/status?job_id=…`
- **Upload + encrypted vault** — uploaded files are AES-256-GCM encrypted
  under a DEK wrapped by a PBKDF2 KEK derived from your admin password
- **Document viewer** for PDF, DOCX, and Markdown
- **Image gallery** + **Explore** masonry browse
- **Bookmarks** (5 slots) and **search history** (last 5 queries)
- **AI summaries** — optional Ollama integration, with streaming output
- **qBittorrent integration** — discover completed torrents and track them
- **Meilisearch supervisor** — start/stop the sidecar from the app UI

## Known follow-ups

- **ZIM / Wikipedia archive indexing.** Endpoints return `501`; needs a
  Rust libzim binding.

## License

[AGPL-3.0-or-later](LICENSE).

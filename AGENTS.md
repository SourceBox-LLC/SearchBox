# AGENTS.md

Guidance for AI agents working on this codebase.

## Project overview

SearchBox is a local-first document search engine. Index PDFs, Word docs,
spreadsheets, Markdown, and HTML; search with typo-tolerant full-text plus
optional Ollama-powered AI summaries. Everything runs on the user's own
machine.

## Stack

- **Web:** [Axum](https://github.com/tokio-rs/axum) 0.8 on Tokio
- **DB:** SQLite via [SQLx](https://github.com/launchbadge/sqlx) (WAL mode)
- **Search:** [Meilisearch](https://www.meilisearch.com/) as a sidecar, spoken to over REST via `reqwest`
- **Templates:** [MiniJinja](https://github.com/mitsuhiko/minijinja)
- **Auth:** [tower-sessions](https://github.com/maxcountryman/tower-sessions) (SQLite store) + `argon2`
- **Crypto:** `aes-gcm` + `pbkdf2` for the vault
- **Doc extraction:** pure Rust — `pdf-extract`, `quick-xml` + `zip`,
  `calamine`, `pulldown-cmark`, `scraper`, `encoding_rs`
- **Optional AI:** Ollama via HTTP; streaming summaries pass through NDJSON
- **Logging:** `tracing` + `tracing-subscriber`

## Layout

```
SearchBox/
├── Cargo.toml
├── schema.sql              # Applied on boot; CREATE TABLE IF NOT EXISTS
├── src/
│   ├── main.rs
│   ├── config.rs           # Env-driven config
│   ├── db.rs               # SQLite pool + schema init
│   ├── state.rs            # AppState: config, db, templates, jobs, meili supervisor
│   ├── error.rs            # AppError → IntoResponse
│   ├── templates.rs        # MiniJinja wrapper + url_for/csrf_token/tojson
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── password.rs     # argon2 hash/verify
│   │   └── session.rs      # CurrentUser extractor, SessionUser struct
│   ├── models/             # SQLx FromRow structs + CRUD
│   │   ├── user.rs, settings.rs, folder.rs, vault.rs,
│   │   ├── qbt.rs, bookmark.rs
│   ├── routes/             # Axum handlers
│   │   ├── auth.rs, pages.rs, settings.rs, meili.rs, folders.rs,
│   │   ├── documents.rs, vault.rs, ollama.rs, qbittorrent.rs, archives.rs,
│   │   └── health.rs
│   ├── services/
│   │   ├── extractor.rs        # Pure-Rust text extraction
│   │   ├── meili.rs            # REST client + DB-backed config
│   │   ├── meili_process.rs    # Child-process supervisor
│   │   └── ollama.rs           # HTTP client
│   ├── vault/crypto.rs     # AES-256-GCM wrap/unwrap + PBKDF2 KEK
│   └── jobs/mod.rs         # In-memory background job tracker
├── templates/              # Loaded by MiniJinja at runtime
├── static/                 # css/, js/, thumbnails/
├── Dockerfile, docker-compose.yml, docker-compose.windows.yml
├── entrypoint.sh           # Starts Meilisearch, then execs `searchbox`
├── fly.toml
├── README.md, CHANGELOG.md
└── LICENSE
```

## Code quality

Before committing:

```bash
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo check
```

Unit tests cover the vault crypto, password hashing, the job registry, the
extractor, thumbnails, and `doc_id` validation; CI runs `cargo test`.
Broader route/integration coverage is a welcome contribution.

## Running locally

```bash
# Requires a Meilisearch binary on PATH (or configure its path in the app).
SEARCHBOX_PORT=8080 cargo run
# Browse http://localhost:8080 — first request walks you through admin setup.
```

## Conventions

- **Errors.** Route handlers return `AppResult<T>`. Any `anyhow::Error`
  auto-converts to a 500 JSON response; use `AppError::BadRequest`,
  `NotFound`, `Unauthorized` for 4xx cases.
- **DB access.** Every model exposes methods on `&SqlitePool` —
  `get_by_id`, `all`, `create`, `upsert`, etc. No implicit transactions;
  compose them in the route handler.
- **Settings.** DB-backed knobs (Meilisearch host/port, Ollama URL, qBT
  credentials, feature flags) live in the `settings` table — read/write
  via `Settings::get` / `Settings::set` / `Settings::set_json`.
- **Auth.** Require `CurrentUser` in a handler signature to enforce login;
  the extractor rejects with `401` for `/api/…` and redirects otherwise.
- **Background work.** Use `tokio::task::spawn`. Track progress by writing
  to `JobRegistry` (`state.jobs`) keyed by a short UUID.
- **Templates.** Rendered via `state.templates.render_response(name, ctx)`.
  Context uses `minijinja::context!{…}`. `url_for('static', filename='x')`
  and `csrf_token()` are registered as template helpers.

## What NOT to add

- **Billing / Stripe / plan tiers.** SearchBox is free. Any code related
  to subscriptions, paywalls, or quotas should be rejected.
- **Multi-tenant SaaS plumbing.** Organizations, teams, invites, signup
  pages. The app is single-user and runs on the user's machine. Re-opening
  this decision should come with a concrete use case attached.
- **Heavy new runtime dependencies.** Meilisearch + Ollama sidecars are
  deliberate; adding a third (Redis, Postgres, etc.) needs justification.

## Pending work

See the **Known follow-ups** section in `README.md`.

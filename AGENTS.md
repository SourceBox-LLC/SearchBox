# AGENTS.md

Guidance for AI agents working on this codebase.

## Project overview

SearchBox is a local-first document search engine. Index PDFs, Word docs,
spreadsheets, Markdown, HTML, and images — from folders, ZIP archives, ZIM
(Kiwix/Wikipedia) archives, or qBittorrent downloads — and search with
typo-tolerant full-text plus optional Ollama-powered AI summaries. A results
page also shows a relevant-image gallery and per-article thumbnails. Everything
runs on the user's own machine.

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
│   │   ├── qbt.rs, bookmark.rs, recovery_key.rs
│   ├── routes/             # Axum handlers
│   │   ├── auth.rs, pages.rs, settings.rs, meili.rs, folders.rs,
│   │   ├── documents.rs, vault.rs, ollama.rs, qbittorrent.rs, archives.rs,
│   │   ├── picker.rs (native file dialog), update.rs (in-app update),
│   │   └── health.rs
│   ├── services/
│   │   ├── extractor.rs        # Pure-Rust text extraction
│   │   ├── thumbnail.rs        # Image thumbnails (jpeg/png/webp/gif/…)
│   │   ├── meili.rs            # REST client + DB-backed config
│   │   ├── meili_process.rs    # Child-process supervisor
│   │   ├── ollama.rs           # HTTP client
│   │   └── updater.rs          # GitHub-release self-update (Windows)
│   ├── vault/crypto.rs     # AES-256-GCM wrap/unwrap + PBKDF2 KEK
│   ├── jobs/mod.rs         # In-memory background job tracker
│   └── integration_tests.rs   # #[cfg(test)] data-layer + vault + HTTP tests
├── templates/              # Loaded by MiniJinja at runtime
├── static/                 # css/, js/, thumbnails/
├── vendor/zim/             # Vendored + patched `zim` crate (reads modern ZIMs)
├── wix/                    # Windows MSI installer (cargo-wix), x64 + arm64
├── Dockerfile, docker-compose.yml, docker-compose.windows.yml
├── entrypoint.sh           # Starts Meilisearch, then execs `searchbox`
├── fly.toml
├── README.md, CHANGELOG.md, BUILD.md
└── LICENSE
```

## Code quality

Before committing:

```bash
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
cargo audit                  # RustSec advisory scan (also a CI job; see .cargo/audit.toml)
cargo fmt --all -- --check   # run LAST — clippy fixups can change formatting
```

Unit tests cover the vault crypto (including the in-memory KEK sealing), password
hashing, the login throttle, the at-rest secret encryption (`services::secret`),
the job registry, the extractor, thumbnails, `doc_id` validation, the ZIM/archive
path + redirect helpers, and the update version comparator + checksum. On top of that, `src/integration_tests.rs`
(`#[cfg(test)]`) exercises every model's CRUD against an in-memory SQLite, the
full vault round-trip (derive KEK → encrypt → wrap → store → unwrap → decrypt),
and the real Axum app over an ephemeral port (health, auth gating, CSRF, and the
setup → authenticated flow with a cookie-aware client). CI runs `cargo test`.

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

Shipped history is in `CHANGELOG.md`. Open follow-ups (non-blocking):

- Bundle the WebView2 Evergreen runtime in the MSI (`wix/`; see `BUILD.md`).
- Optional MSI code-signing (`WINDOWS_CERT_*` secrets) — deliberately left
  unsigned for now (cost).
- Publish the winget package — the workflow is ready in
  `.github/workflows/winget.yml`, awaiting the maintainer's one-time classic PAT
  (`WINGET_TOKEN`) + a `winget-pkgs` fork + the initial-submission CLA.
- Deferred idea: an in-app "ZIM catalog / app store" (browse + download Kiwix
  ZIMs via the OPDS catalog, opt-in/off by default).
- Large (multi-GB) ZIMs would benefit from indexing the `.zim` in place rather
  than the current extract-everything-to-disk approach in `extract_zim`.

Both ZIM and ZIP archives render fully in the viewer — ZIM via the on-demand
`/api/zim/content/<archive>/<url>` endpoint, ZIP via the extracted files served
from `/api/archive/raw/<archive>/<path>`.

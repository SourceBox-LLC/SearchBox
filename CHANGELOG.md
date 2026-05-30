# Changelog

## Unreleased

## 0.2.0 — 2026-05-30

### Fixed
- **Search filters and the document viewer now work.** Filters like `::pdf`,
  `::docx`, and `::image` were silently matching nothing, and PDFs / Word docs
  / Markdown wouldn't open in the built-in viewer — both were caused by the
  same file-type mismatch, now corrected.
- **The `::torrent` filter works.** Files indexed from qBittorrent downloads
  are now tagged correctly, so you can narrow a search to just those.

### Changed
- **Windows: SearchBox is now a desktop app.** Instead of opening the default
  browser and living in the system tray, the Windows release renders the UI in
  its own native window (WebView2 via `wry`), backed by the same local server.
  Closing the window quits cleanly — no more orphaned background process you
  can't reopen. Dev (`cargo run`) and the Docker/Linux server build are
  unchanged (headless).

## 0.1.0 — 2026-04-23

### Full Rust rewrite

The entire app was rewritten from the ground up. New codebase, new runtime
characteristics, new deploy story.

**New stack**
- [Axum 0.8](https://github.com/tokio-rs/axum) web server on Tokio
- [SQLx](https://github.com/launchbadge/sqlx) against SQLite (WAL mode,
  runtime-checked queries)
- [MiniJinja](https://github.com/mitsuhiko/minijinja) for HTML rendering
- [tower-sessions](https://github.com/maxcountryman/tower-sessions) with
  the SQLite store
- [argon2](https://docs.rs/argon2) for password hashing (replaces bcrypt —
  **all existing users need to be re-created**, there is no compatibility
  layer)
- [aes-gcm](https://docs.rs/aes-gcm) + [pbkdf2](https://docs.rs/pbkdf2) for
  the vault (AES-256-GCM, PBKDF2-HMAC-SHA256, 600k rounds, per-install salt)

**Pure-Rust document extraction**
- `pdf-extract` for PDF
- `quick-xml` + `zip` for DOCX
- `calamine` for XLSX
- `pulldown-cmark` for Markdown
- `scraper` for HTML
- `encoding_rs` for non-UTF-8 text fallback
- **C++ `doc_extractor` binary was removed.** Everything builds with pure
  Rust; no MuPDF, libgumbo, libzim, librsvg, or cairo dependencies in the
  runtime image.

**Dropped features**
- Billing (Stripe checkout, portal, webhooks, plan tiers). Free software.
- Multi-tenant SaaS — organizations, teams, team members, invite codes,
  signup routes, migration tokens. Local-first single-user.
- ZIM indexing + article viewer. Endpoints return `501 Not Implemented`;
  a Rust libzim binding is the follow-up.

**Infra**
- New multi-stage Dockerfile — `rust:1.84-slim-bookworm` builder stage,
  `debian:bookworm-slim` runtime stage with the Meilisearch apt package.
- `entrypoint.sh` reduced to a `/bin/sh` wrapper that starts Meilisearch,
  waits for its health endpoint, then execs the binary.
- `fly.toml` updated for port 8080 + `/api/health`.
- `docker-compose.override.yml`, `Dockerfile.cloud`, `entrypoint.cloud.sh`
  removed — the single Dockerfile now covers both local and cloud builds.

**Known follow-ups** — see `README.md`: ZIM / Wikipedia archive indexing
(endpoints return `501` pending a Rust libzim binding). CSRF tokens,
thumbnail generation, Meili prefix-delete, qBittorrent content sync, and
`rust-embed` single-binary packaging have all since landed.

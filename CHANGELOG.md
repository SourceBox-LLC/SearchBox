# Changelog

## Unreleased

### Fixed
- Home-page file-type filters (`::pdf`, `::docx`, `::&&`, …) now match
  documents. They were emitting `file_type = ".pdf"` (leading dot) while
  documents are indexed as `"pdf"`, so every file-type filter returned
  nothing. The document viewer (`/view/…`) shared the same dotted-extension
  bug and never initialized the PDF / DOCX / Markdown renderers — both fixed.
- qBittorrent-indexed documents are now tagged `source = "qbittorrent"`
  (previously `"folder"`), so the `::torrent` source filter works.

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

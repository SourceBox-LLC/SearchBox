# Changelog

## Unreleased

### Fixed
- **Removing an indexed folder or archive now works on Windows.** The remove
  button passed the path through an inline-`onclick` JavaScript string, which
  mangled Windows backslashes (`C:\Users\…` arrived as `C:Users…`), so the
  wrong path reached the server and nothing was removed. It now reads the path
  from the list element instead. Affected the folder list (main page +
  Settings) and the indexed-archive list.

### Changed
- Internal: removed ~510 lines of dead SaaS code (subscription, team
  management, invite modal, billing portal, and "upgrade to cloud" UI) from
  `settings.js` and `settings.css`. It referenced endpoints and DOM elements
  that don't exist in the local-first app, so nothing changes for users.

## 0.2.7 — 2026-05-30

### Added
- **ZIM articles now render fully — images, styling, and clickable links.**
  Opening a Wikipedia/Kiwix article in the viewer now serves it and its images,
  CSS, and inter-article links on-demand straight from the source `.zim`, so you
  can browse the archive like an offline mini-Wikipedia: pages keep their
  original look, images load, and clicking a link opens the next article in
  place. It renders in a locked-down, no-JavaScript sandbox, so it stays safe.

### Notes
- Serving is on-demand — nothing extra is unpacked to disk and the search index
  stays clean (still only article text is indexed). Articles are matched by
  filename, so the rare title containing filesystem-reserved characters falls
  back to plain text. Very old ZIMs using bzip2/zlib cluster compression remain
  unsupported (modern zstd/xz work).

## 0.2.6 — 2026-05-30

### Added
- **ZIM archive indexing now works** (the v0.2.5 "coming next" is here). Point
  SearchBox at a `.zim` file — Kiwix, Wikipedia, or any openZIM archive — and
  it extracts every HTML article and indexes them like a folder: full-text
  searchable and viewable as pages, just like any other content. Both modern
  (zstd) and legacy (xz) compression are supported. Validated against a real
  2024 Wikipedia ZIM (~3,800 articles extracted cleanly).

### Notes
- ZIM articles are unpacked to disk under the app's data folder, so a large
  archive needs proportional free space. Article text and structure render in
  the viewer; embedded images and inter-article links don't resolve yet (a
  follow-up — same limitation as any indexed `.html`).

## 0.2.5 — 2026-05-30

### Added
- **Index ZIP archives like folders.** Point SearchBox at a `.zip` file and it
  unpacks it and indexes the contents, so every file inside becomes searchable
  and viewable just like a normal indexed folder. (`.zim` archive support is
  the next step — it reports a clear "coming soon" for now.)
- **HTML files render as pages.** Indexed `.html` / `.htm` files now open as
  actual rendered pages in the viewer — inside a locked-down, script-blocking
  sandbox — instead of showing raw source text.
- **Vault recovery key** — During setup, you now download a recovery key that
  can reset your password. Save it somewhere safe — without it, password
  recovery is impossible.
- **Password reset flow** — Forgot your password? Use your recovery key to
  reset it and keep accessing your vault. The recovery key is never stored
  on disk, only wrapped under your password-derived key.
- **Regenerate recovery key** — Settings page lets you generate a new recovery
  key at any time (invalidates the old one).

### Changed
- **README & SECURITY.md** — Updated to reflect the recovery key system and
  clarify that password recovery is possible with the recovery key.

## 0.2.4 — 2026-05-30

### Fixed
- **The document-manager panel no longer crashes.** Opening the upload /
  manage-documents panel threw a JavaScript error (a `const` was reassigned).
- **The Vault file list, delete, and folder-sync now work.** The list read the
  wrong field of the search response (always empty), delete used the wrong URL
  (405 — nothing was removed), and folder-sync reported a false failure.
- **Explore "Sort by Name"** no longer errors (`filename` is now sortable).
- **Password changes are atomic** — the vault re-encryption and the new
  password commit together, so an interruption can't leave the vault in an
  unrecoverable split state.
- **Factory reset is best-effort** — one locked file no longer aborts the wipe
  and strands the rest on disk.
- A **relative Meilisearch data path** is rejected (it would resolve into
  read-only Program Files and stop the engine from starting).
- No console-window flash when opening or revealing a file in its default app.

### Changed
- CI/release workflows opt into Node 24 (Node 20 runner deprecation).

## 0.2.3 — 2026-05-30

### Fixed
- **No more stray terminal window.** A black console window appeared next to
  the app on launch — it was the bundled Meilisearch engine's own console
  (newly visible because v0.2.2 made the engine stay running). The engine is
  now spawned with `CREATE_NO_WINDOW`, so it runs invisibly in the background.

## 0.2.2 — 2026-05-30

### Fixed
- **The search engine now starts in the installed app.** When installed under
  `Program Files`, the bundled Meilisearch engine inherited the app's
  read-only working directory and exited immediately at startup (`Access is
  denied, os error 5`), so search never worked. It's now launched with a
  writable working directory (its data folder). The Settings → Search Engine
  **Start** button also recovers when the engine has stopped, instead of
  doing nothing.

## 0.2.1 — 2026-05-30

### Fixed
- **The installed app now launches.** Installed via the MSI (under
  `Program Files`), the desktop window failed to open: WebView2 tried to put
  its data folder next to the read-only executable and errored with
  `0x80070005` (access denied), so the app shut itself down on start. Its data
  folder is now redirected to a writable per-user location
  (`%LocalAppData%\SearchBox\webview2`).

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

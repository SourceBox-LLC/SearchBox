# Security Policy

> **In plain English:** SearchBox runs entirely on your own computer. It
> doesn't send your files or activity anywhere, has no ads or tracking, and
> works offline. Anything you put in the **vault** is encrypted with your
> password — strong enough that the files can't be read without it. During
> setup, you'll download a **recovery key** — save it somewhere safe. If you
> forget your password, the recovery key lets you reset it and keep accessing
> your vault. Without the recovery key, vault files **cannot** be recovered.
>
> The rest of this page is the technical detail and how to report a security
> issue.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | ✅ Current release (Rust rewrite) |
| ≤ 2.x   | ❌ Python-era, unsupported |

## Architecture

SearchBox runs entirely on the user's own machine. It opens no outbound
network connections by default — Meilisearch runs as a local sidecar and
Ollama is only contacted when the user explicitly enables it.

Both the app's web server and the Meilisearch sidecar bind to loopback
(`127.0.0.1`) only, so neither the UI/API nor the full-text index (which holds
the extracted text of every indexed file) is reachable from the local network.
Set `SEARCHBOX_HOST=0.0.0.0` to deliberately opt into LAN access. The
Meilisearch master key is a private, per-install random value generated on first
run — never a shared default.

### Data privacy

- All processing happens on your infrastructure.
- No telemetry, no analytics, no phone-home.

### Encryption

- **Vault:** AES-256-GCM with a per-file Data-Encryption Key (DEK), 12-byte
  random nonce, authenticated tag.
- **Key derivation:** PBKDF2-HMAC-SHA256, 600 000 iterations, random 16-byte
  salt stored once in `vault_config`.
- **KEK lifecycle:** derived from the admin password at login and held only in
  process memory, sealed under a per-process key that is regenerated on each
  start. Only the *sealed* form is written to the session store, so a copied
  data directory never yields a usable key. The vault re-locks on restart;
  Settings → Vault Security shows an **Unlock** prompt to re-derive the key from
  your password without logging out.
- **DEK wrapping:** each file's DEK is AES-256-GCM-wrapped under the KEK;
  the wrapped blob is stored in `encrypted_files`.

### Authentication

- Passwords hashed with **argon2id** via the `argon2` crate.
- **Login is rate-limited:** repeated failures lock an account's logins (and the
  vault-unlock endpoint) for a cooldown that grows with each failure, slowing
  online guessing. A successful login clears it.
- Sessions managed by `tower-sessions` with the SQLite store.
- Cookies are `HttpOnly`, `SameSite=Lax`; flip `with_secure(true)` in
  `src/main.rs` when serving over HTTPS.
- **qBittorrent password** is encrypted at rest (AES-256-GCM under a per-install
  key kept outside the database), so a leaked database alone can't reveal it.

### Input validation

- Parameterised SQLx queries everywhere — no raw string concatenation in
  SQL.
- `url_for` and file-serving paths are rooted at known directories; no
  path traversal entry points exposed.
- SSRF guard on Ollama URL configuration — only `http://` / `https://`
  schemes accepted.
- Meilisearch configuration validates the binary path (must be a file,
  basename must contain `meilisearch`).

### CSRF

State-changing endpoints require a CSRF token. A 32-byte random token is
generated per session and surfaced to the browser via a
`<meta name="csrf-token">` tag and hidden form fields. Requests echo it back
through the `X-CSRFToken` header (JSON/`fetch` routes) or a `csrf_token` form
field (login/setup); the server compares it against the session token in
constant time and rejects mismatches with `403`. This sits on top of
`HttpOnly`, `SameSite=Lax` session cookies.

### Updates

The opt-in in-app updater downloads the new MSI over TLS from GitHub Releases and
verifies its SHA-256 against the published `<msi>.sha256` sidecar before running
the installer, refusing on mismatch. This is an integrity check — installers are
intentionally unsigned (no paid certificate), so TLS plus the checksum, not a
code signature, establish trust.

### Dependency auditing

CI runs `cargo audit` against the [RustSec](https://rustsec.org) advisory
database on every push and pull request, failing on security vulnerabilities.
Known-unreachable transitive advisories are documented and ignored in
`.cargo/audit.toml`.

## Reporting a vulnerability

**Do NOT open a public GitHub issue.** Email
`security@sourcebox.dev` with a description of the issue, reproduction
steps, and potential impact. Include your preferred contact channel.

Expected timeline: 48-hour acknowledgement, 30-day target fix, 90-day
maximum disclosure window. We credit reporters in the release notes
unless asked not to.

### Out of scope

- Denial-of-service attacks
- Social engineering
- Physical access
- Bugs in upstream dependencies (report those upstream)

## Dependencies worth watching

- **Rust crates:** monitor [rustsec.org](https://rustsec.org) advisories
  for `axum`, `tokio`, `sqlx`, `tower-sessions`, `reqwest`, `argon2`,
  `aes-gcm`, `pdf-extract`, `scraper`.
- **Meilisearch:** runs as a sidecar. Track its releases.
- **Ollama (optional):** only contacted when configured.

## Deployment hardening

### Bind address

SearchBox binds `127.0.0.1` by default. Only set `SEARCHBOX_HOST=0.0.0.0` if you
intend to expose it on a network — and if you do, put it behind a reverse proxy
that adds TLS. The Meilisearch master key is generated automatically (random,
per-install); you don't need to set one.

### Terminate TLS upstream

Put SearchBox behind Caddy / nginx with Let's Encrypt. Don't serve port
8080 directly to the public internet.

### Restrict index sources

In Docker, only mount the directories you want indexed, read-only:

```yaml
volumes:
  - /home/me/Documents:/home/me/Documents:ro
```

### Vault password

- Choose a strong admin password — it's the only thing between an
  attacker with filesystem access and the vault contents.
- **Save your recovery key.** During setup, SearchBox generates a random
  256-bit recovery key and wraps it under your password-derived key. Store
  this recovery key somewhere safe (password manager, encrypted USB, safe).
- **Lost password + lost recovery key = lost vault.** The recovery key is
  the only way to reset your password. Without it, vault files cannot be
  recovered.
- **Recovery key lifecycle:** The recovery key is generated once at setup.
  It can be regenerated at any time from Settings (which invalidates the old
  one). The recovery key is never stored on disk — only a version wrapped
  under your password-derived KEK.

---

**Last updated:** June 2026 (v0.3.17 — loopback binding, sealed in-memory KEK,
login rate-limiting, encrypted qBittorrent password, update checksums, CI audit)

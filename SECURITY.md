# Security Policy

> **In plain English:** SearchBox runs entirely on your own computer. It
> doesn't send your files or activity anywhere, has no ads or tracking, and
> works offline. Anything you put in the **vault** is encrypted with your
> password — strong enough that the files can't be read without it. The
> trade-off: **there's no password reset.** If you forget your password, the
> vaulted files are gone for good, so keep it somewhere safe.
>
> The rest of this page is the technical detail and how to report a security
> issue.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Current release (Rust rewrite) |
| ≤ 2.x   | ❌ Python-era, unsupported |

## Architecture

SearchBox runs entirely on the user's own machine. It opens no outbound
network connections by default — Meilisearch runs as a local sidecar and
Ollama is only contacted when the user explicitly enables it.

### Data privacy

- All processing happens on your infrastructure.
- No telemetry, no analytics, no phone-home.

### Encryption

- **Vault:** AES-256-GCM with a per-file Data-Encryption Key (DEK), 12-byte
  random nonce, authenticated tag.
- **Key derivation:** PBKDF2-HMAC-SHA256, 600 000 iterations, random 16-byte
  salt stored once in `vault_config`.
- **KEK lifecycle:** derived from the admin password at login, held only in
  the session cookie payload (hex-encoded). Never persisted to disk.
- **DEK wrapping:** each file's DEK is AES-256-GCM-wrapped under the KEK;
  the wrapped blob is stored in `encrypted_files`.

### Authentication

- Passwords hashed with **argon2id** via the `argon2` crate.
- Sessions managed by `tower-sessions` with the SQLite store.
- Cookies are `HttpOnly`, `SameSite=Lax`; flip `with_secure(true)` in
  `src/main.rs` when serving over HTTPS.

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

### Change the defaults

```bash
SEARCHBOX_SECRET_KEY=$(openssl rand -hex 32)
MEILI_MASTER_KEY=$(openssl rand -hex 32)
```

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
- There is no recovery. Lose the password → lose the encrypted files.

---

**Last updated:** May 2026

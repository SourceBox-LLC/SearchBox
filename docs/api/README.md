# API Reference

Programmatic access to SearchBox.

> **Navigation:** [Documentation](../README.md) > [API Reference](README.md)

---

## Overview

SearchBox provides a RESTful API for:

- 🔍 **Search** — Query documents
- 📁 **Files** — Upload, download, manage
- 📂 **Folders** — Index directories
- 🔐 **Vault** — Encrypted file management
- ⚙️ **Settings** — Configure instance

**Base URL:** `http://localhost:5000/api/`

**Authentication:**PIN-based (vault operations)

---

## Endpoints

| Category | Endpoints |
|----------|-----------|
| [Search](endpoints.md#search) | Search documents |
| [Documents](endpoints.md#documents) | Upload, download, thumbnails |
| [Folders](endpoints.md#folders) | Index folders, sync status |
| [Vault](endpoints.md#vault) | PIN management, encryption |
| [Bookmarks](endpoints.md#bookmarks) | Quick access bookmarks |
| [qBittorrent](endpoints.md#qbittorrent) | Torrent indexing |
| [ZIM Archives](endpoints.md#zim-archives) | Wikipedia dumps |
| [Ollama](endpoints.md#ollama) | AI summaries |
| [Settings](endpoints.md#settings) | Configuration |
| [Meilisearch](endpoints.md#meilisearch) | Search engine management |

---

## Quick Reference

### Search

```bash
GET /api/search?q=python&filters=file_type:pdf
```

### Upload File

```bash
POST /api/documents/upload
Content-Type: multipart/form-data

file: <file>
```

### Get Document

```bash
GET /api/documents/{doc_id}
```

### Index Folder

```bash
POST /api/folders/index
Content-Type: application/json

{"folder_path": "/home/user/Documents"}
```

### Unlock Vault

```bash
POST /api/vault/unlock
Content-Type: application/json

{"pin": "1234"}
```

---

## Authentication

Most endpoints require no authentication. Vault endpoints require the correct PIN.

### Vault PIN

Vault-protected endpoints use session-based authentication:

```bash
# Unlock vault (stores session)
POST /api/vault/unlock
{"pin": "1234"}

# Now can access encrypted files
GET /api/vault/download/{doc_id}
```

---

## Response Format

All responses are JSON:

**Success:**
```json
{
  "status": "ok",
  "data": { ... }
}
```

**Error:**
```json
{
  "status": "error",
  "error": "Error message"
}
```

---

## Rate Limiting

Vault PIN attempts are rate-limited:
- **Max attempts:** 5
- **Lockout:** 5 minutes

Other endpoints have no rate limiting.

---

## Next Steps

- **[Endpoints](endpoints.md)** — Full endpoint documentation
- **[Examples](examples.md)** — Code examples
- **[Architecture](../architecture/overview.md)** — System design

---

**Next:** [Endpoints](endpoints.md)
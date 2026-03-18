# API Endpoints

Complete endpoint reference.

> **Navigation:** [Documentation](../README.md) > [API Reference](README.md) > [Endpoints](endpoints.md)

---

## Search

### Search Documents

Search across all indexed documents.

```http
GET /api/search
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `q` | string | Search query |
| `filters` | string | Meilisearch filter string |
| `page` | integer | Page number (default: 1) |
| `page_size` | integer | Results per page (default: 20) |

**Response:**
```json
{
  "hits": [
    {
      "id": "doc_123",
      "title": "Document Title",
      "content": "Matching text...",
      "file_type": "pdf",
      "file_path": "/path/to/file.pdf",
      "score": 0.95
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 20
}
```

**Example:**
```bash
curl "http://localhost:5000/api/search?q=python&filters=file_type:pdf&page=1&page_size=10"
```

---

### Get Suggestions

Get autocomplete suggestions.

```http
GET /api/search/suggestions
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `q` | string | Partial query |

**Response:**
```json
{
  "suggestions": ["python tutorial", "python documentation", "python code"]
}
```

---

## Documents

### Get Document

Retrieve a document by ID.

```http
GET /api/documents/{doc_id}
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `doc_id` | string | Document ID |

**Response:**
```json
{
  "id": "doc_123",
  "title": "Document Title",
  "content": "Full document content...",
  "file_type": "pdf",
  "file_path": "/path/to/file.pdf",
  "created_at": "2024-01-15T10:30:00Z",
  "size": 1024000
}
```

---

### Upload Document

Upload a document to the vault.

```http
POST /api/documents/upload
Content-Type: multipart/form-data
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `file` | file | Document file |
| `encrypt` | boolean | Encrypt in vault (default: true) |

**Response:**
```json
{
  "status": "ok",
  "doc_id": "doc_456",
  "message": "Document uploaded successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/documents/upload \
  -F "file=@document.pdf"
```

---

### Download Document

Download a document file.

```http
GET /api/documents/{doc_id}/download
```

**Headers:**

| Name | Description |
|------|-------------|
| `X-Vault-Pin` | Vault PIN (required for encrypted files) |

**Response:**
Binary file download.

**Example:**
```bash
curl -H "X-Vault-Pin: 1234" \
  http://localhost:5000/api/documents/doc_123/download \
  -o document.pdf
```

---

### Get Thumbnail

Get document thumbnail image.

```http
GET /api/documents/{doc_id}/thumbnail
```

**Response:**
WebP image (400x300).

---

### Get Page Image

Get extracted page image (for PDFs).

```http
GET /api/documents/{doc_id}/page/{page_num}
```

**Response:**
PNG image of the specified page.

---

### Delete Document

Delete a document from the index.

```http
DELETE /api/documents/{doc_id}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Document deleted"
}
```

---

## Folders

### List Indexed Folders

Get all indexed folders.

```http
GET /api/folders
```

**Response:**
```json
{
  "folders": [
    {
      "id": 1,
      "folder_path": "/home/user/Documents",
      "folder_name": "Documents",
      "last_synced": "2024-01-15T10:30:00Z",
      "is_active": true
    }
  ]
}
```

---

### Add Folder

Add a folder to the index queue.

```http
POST /api/folders/add
Content-Type: application/json
```

**Body:**
```json
{
  "folder_path": "/home/user/Documents"
}
```

**Response:**
```json
{
  "status": "ok",
  "folder_id": 1,
  "message": "Folder added to index queue"
}
```

---

### Index Folder

Start indexing a folder.

```http
POST /api/folders/index
Content-Type: application/json
```

**Body:**
```json
{
  "folder_path": "/home/user/Documents"
}
```

**Response:**
```json
{
  "status": "ok",
  "job_id": "job_abc123",
  "message": "Indexing started"
}
```

---

### Get Indexing Status

Check indexing progress.

```http
GET /api/folders/status/{job_id}
```

**Response:**
```json
{
  "job_id": "job_abc123",
  "status": "running",
  "total": 1000,
  "processed": 450,
  "indexed": 445,
  "failed": 5,
  "skipped": 0
}
```

**Status values:**
- `pending` — Job queued
- `running` — Currently indexing
- `completed` — Finished
- `failed` — Error occurred

---

### Remove Folder

Remove a folder from the index.

```http
DELETE /api/folders/{folder_id}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Folder removed"
}
```

---

## Vault

### Get Vault Status

Check if vault PIN is set up.

```http
GET /api/vault/status
```

**Response:**
```json
{
  "pin_set": true
}
```

---

### Setup Vault PIN

Initialize vault with a PIN.

```http
POST /api/vault/setup
Content-Type: application/json
```

**Body:**
```json
{
  "pin": "1234"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Vault PIN set"
}
```

---

### Unlock Vault

Unlock vault with PIN (stores session).

```http
POST /api/vault/unlock
Content-Type: application/json
```

**Body:**
```json
{
  "pin": "1234"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Vault unlocked"
}
```

---

### Change Vault PIN

Change vault PIN.

```http
POST /api/vault/change
Content-Type: application/json
```

**Body:**
```json
{
  "old_pin": "1234",
  "new_pin": "5678"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "PIN changed"
}
```

---

### Upload to Vault

Upload encrypted file to vault.

```http
POST /api/vault/upload
Content-Type: multipart/form-data
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `file` | file | File to upload |
| `pin` | string | Vault PIN |

**Response:**
```json
{
  "status": "ok",
  "doc_id": "doc_789",
  "message": "File uploaded to vault"
}
```

---

## Bookmarks

### List Bookmarks

Get all bookmarks.

```http
GET /api/bookmarks
```

**Response:**
```json
{
  "bookmarks": [
    {
      "slot": 1,
      "doc_id": "doc_123",
      "title": "Important Document",
      "file_type": "pdf"
    }
  ]
}
```

---

### Add Bookmark

Add document to bookmark slot.

```http
POST /api/bookmarks
Content-Type: application/json
```

**Body:**
```json
{
  "slot": 1,
  "doc_id": "doc_123",
  "title": "Important Document",
  "file_type": "pdf"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Bookmark added"
}
```

---

### Remove Bookmark

Remove bookmark from slot.

```http
DELETE /api/bookmarks/{slot}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Bookmark removed"
}
```

---

## qBittorrent

### List Indexed Torrents

Get all indexed torrents.

```http
GET /api/qbittorrent/torrents
```

**Response:**
```json
{
  "torrents": [
    {
      "hash": "abc123",
      "name": "Linux Distro",
      "save_path": "/downloads/linux",
      "files_indexed": 150
    }
  ]
}
```

---

### Index Torrent

Index files from a torrent.

```http
POST /api/qbittorrent/index
Content-Type: application/json
```

**Body:**
```json
{
  "torrent_hash": "abc123"
}
```

---

## ZIM Archives

### List Indexed ZIMs

Get all indexed ZIM archives.

```http
GET /api/zim/archives
```

**Response:**
```json
{
  "archives": [
    {
      "path": "/data/wikipedia.zim",
      "name": "Wikipedia",
      "articles_indexed": 6500000
    }
  ]
}
```

---

### Index ZIM

Index a ZIM archive.

```http
POST /api/zim/index
Content-Type: application/json
```

**Body:**
```json
{
  "archive_path": "/data/wikipedia.zim"
}
```

---

## Ollama

### Generate Summary

Generate AI summary for document.

```http
POST /api/ollama/summarize
Content-Type: application/json
```

**Body:**
```json
{
  "doc_id": "doc_123",
  "model": "llama2"
}
```

**Response:**
```json
{
  "summary": "This document discusses..."
}
```

---

### Get Ollama Status

Check Ollama connection.

```http
GET /api/ollama/status
```

**Response:**
```json
{
  "running": true,
  "models": ["llama2", "mistral"]
}
```

---

## Settings

### Get Settings

Get all settings.

```http
GET /api/settings
```

**Response:**
```json
{
  "theme": "dark",
  "page_size": 20,
  "ollama_model": "llama2"
}
```

---

### Update Setting

Update a setting.

```http
PUT /api/settings/{key}
Content-Type: application/json
```

**Body:**
```json
{
  "value": "dark"
}
```

---

## Meilisearch

### Get Status

Get Meilisearch status.

```http
GET /api/meilisearch/status
```

**Response:**
```json
{
  "running": true,
  "version": "1.5.0",
  "document_count": 15000,
  "database_size": 524288000
}
```

---

### Start Meilisearch

Start the Meilisearch server.

```http
POST /api/meilisearch/start
```

---

### Stop Meilisearch

Stop the Meilisearch server.

```http
POST /api/meilisearch/stop
```

---

### Rebuild Index

Rebuild search index.

```http
POST /api/meilisearch/rebuild
```

---

## Error Responses

All endpoints may return errors:

```json
{
  "status": "error",
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

**Common error codes:**

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Resource not found |
| `INVALID_PIN` | Vault PIN incorrect |
| `RATE_LIMITED` | Too many requests |
| `UNAUTHORIZED` | Authentication required |
| `VALIDATION_ERROR` | Invalid input |

---

## Next Steps

- **[Examples](examples.md)** — Code examples in multiple languages
- **[Architecture](../architecture/overview.md)** — System design

---

**Previous:** [API Reference](README.md)  
**Next:** [Examples](examples.md)
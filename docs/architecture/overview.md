# Architecture Overview

Technical architecture of SearchBox.

> **Navigation:** [Documentation](../README.md) > [Architecture](README.md) > [Overview](overview.md)

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                           Browser                                │
│                     (User Interface)                             │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTP/HTTPS
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│                        SearchBox                                 │
│                       (Flask App)                                │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │   Frontend   │    │    Routes    │    │    Middleware     │  │
│  │  (HTML/JS)   │◄──►│  (Blueprints) │◄──►│  (Auth/CSRF)     │  │
│  └──────────────┘    └──────────────┘    └───────────────────┘  │
│                              │                                   │
│  ┌──────────────┐    ┌──────▼──────┐    ┌───────────────────┐  │
│  │   Services   │◄───►│   Models    │◄──►│    Database       │  │
│  │              │    │  (SQLAlchemy) │    │   (SQLite)        │  │
│  └──────────────┘    └─────────────┘    └───────────────────┘  │
│         │                                                       │
│  ┌──────▼─────────────────────────────────────────────────────┐  │
│  │                C++ Extractor (Binary)                        │  │
│  │   • PDF (MuPDF)    • DOCX (libzip/pugixml)                 │  │
│  │   • HTML (Gumbo)   • ZIM (libzim)                          │  │
│  │   • Images (stb)   • SVG (librsvg/cairo)                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────┬────────────────────────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      │                                          │
           ┌──────────▼──────────┐              ┌───────────────▼──────────┐
           │    Meilisearch      │              │    File Storage          │
           │   (Search Engine)   │              │    (Volumes/Vault)       │
           │                     │              │                          │
           │  • Full-text index   │              │  • Document files        │
           │  • Typo tolerance    │              │  • Encrypted vault       │
           │  • Fast filtering    │              │  • Thumbnails            │
           └─────────────────────┘              └──────────────────────────┘
```

---

## Component Overview

### Frontend (HTML/JS)

**Location:** `templates/` and `static/`

**Technologies:**
- Jinja2 templates
- Vanilla JavaScript (no framework)
- CSS with custom properties
- Meilisearch JavaScript client

**Responsibilities:**
- User interface
- Search queries
- Document viewing
- Settings management
- Real-time updates

---

### Backend (Flask)

**Location:** `app.py`, `routes/`, `services/`

**Technologies:**
- Flask 3.x
- SQLAlchemy ORM
- Flask-WTF (CSRF)
- Flask sessions

**Responsibilities:**
- Request routing
- Authentication
- Business logic
- File operations
- Database queries

---

### Database (SQLite)

**Location:** `instance/searchbox.db`

**Models:**
- `Settings` — Key-value configuration
- `IndexedFolder` — Tracked folders
- `VaultConfig` — PIN and encryption config
- `EncryptedFile` — Vault file metadata
- `QBTorrent` — qBittorrent tracking
- `IndexedArchive` — ZIM/ZIP tracking
- `Bookmark` — User bookmarks

**Why SQLite:**
- Zero configuration
- Single file for all data
- Fast for single-user workloads
- Easy backup/restore

---

### Search Engine (Meilisearch)

**Location:** Embedded in Docker container

**Configuration:**
- Runs on port 7700 by default
- Master key authentication
- RAM-based index

**Responsibilities:**
- Full-text search
- Typo tolerance
- Filtering
- Ranking

---

### C++ Extractor

**Location:** `extractor/` (compiled binary)

**Libraries:**
| Library | Purpose |
|---------|---------|
| MuPDF | PDF text and image extraction |
| libzip | DOCX/XLSX decompression |
| pugixml | XML parsing for DOCX/XLSX |
| Gumbo | HTML parsing and text extraction |
| libzim | ZIM archive reading |
| librsvg + cairo | SVG rasterization to JPEG |
| stb_image | Image decoding (JPEG, PNG, GIF, WebP, BMP) |
| stb_image_resize2 | Thumbnail resizing |
| stb_image_write | JPEG thumbnail output |

**Modes:**
```bash
# Single file
doc_extractor <file> --text
doc_extractor <file> --images <out_dir>

# Batch directory
doc_extractor --batch <dir> --out <image_dir>

# ZIM archive
doc_extractor --zim <path>
```

**Output:** JSON (single file) or JSONL (batch/ZIM) on stdout, logs on stderr.

---

## Data Flow

### Search Flow

```
User Input
    │
    ▼
SearchBox Backend
    │  Parse query
    │  Validate syntax
    │  Apply filters
    ▼
Meilisearch
    │  Full-text search
    │  Typo tolerance
    │  Ranking
    ▼
Results
    │  Fetch from DB
    │  Format response
    ▼
User Interface
```

### Indexing Flow

```
User Input (Folder/ZIM)
    │
    ▼
Backend
    │  Scan files
    │  Detect type
    ▼
C++ Extractor
    │  Extract text
    │  Extract images
    │  Generate thumbnails
    ▼
Backend
    │  Save thumbnails
    │  Save metadata
    │  Index in Meilisearch
    ▼
Database Updated
```

---

## Security Architecture

### Authentication

- **Vault:** PIN-based authentication
- **Session:** Server-side session with 30-minute timeout
- **CSRF:** Flask-WTF token validation

### Encryption

- **Algorithm:** AES-256-GCM
- **Key Derivation:** PBKDF2-HMAC-SHA256
- **Iterations:** 600,000
- **Nonce:** 12-byte random per encryption

### Input Validation

- `secure_filename()` on uploads
- Meilisearch filter injection prevention
- SSRF guards on Ollama URL
- Rate limiting on PIN attempts

---

## Performance Characteristics

### Search Speed

| Query Complexity | Time |
|------------------|------|
| Single word | < 20ms |
| Exact phrase | < 30ms |
| Boolean operators | < 50ms |
| File type filter | < 40ms |

### Indexing Speed

| Document Type | Speed |
|---------------|-------|
| Plain text | ~1000 docs/sec |
| PDF | ~50 docs/sec |
| DOCX | ~100 docs/sec |
| HTML | ~500 docs/sec |

### Memory Usage

| Component | Memory |
|-----------|--------|
| Flask app | ~100MB |
| Meilisearch | ~500MB-2GB |
| SQLite DB | ~10-100MB |
| C++ extractor | ~50-200MB |

---

## Scaling Considerations

### Current Limitations

- **SQLite:** Single-user workloads (not concurrent writes)
- **Meilisearch:** Single instance per deployment
- **File storage:** Local filesystem only

### Future Improvements

- **PostgreSQL:** Multi-user support (Cloud)
- **Meilisearch Cloud:** Distributed search
- **S3 Storage:** Cloud file storage
- **Horizontal scaling:** Load balancer + multiple instances

---

## Related Documentation

- **[Database Schema](database.md)** — Detailed database design
- **[C++ Extractor](extractor.md)** — Extraction engine details
- **[Security](security.md)** — Security architecture

---

**Previous:** [Features](../features/README.md)  
**Next:** [Database Schema](database.md)
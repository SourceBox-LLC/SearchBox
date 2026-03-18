# Database Architecture

How SearchBox stores and manages data.

> **Navigation:** [Documentation](../README.md) > [Architecture](overview.md) > [Database](database.md)

---

## Overview

SearchBox uses **SQLite** as its primary database, chosen for simplicity and performance:

- 📁 **Single file** — No separate database server
- ⚡ **Fast** — Zero-configuration, in-process
- 🔒 **Reliable** — ACID compliant, battle-tested
- 💪 **Scalable** — Handles millions of records
- 🔄 **Portable** — Copy the file to backup

**Database location:** `instance/searchbox.db`

---

## Schema

### Tables

```
┌─────────────────────┐     ┌─────────────────────┐
│      settings       │     │   indexed_folders   │
├─────────────────────┤     ├─────────────────────┤
│ id (PK)             │     │ id (PK)             │
│ key (unique)        │     │ folder_path (unique)│
│ value               │     │ folder_name         │
│ description         │     │ created_at          │
│ created_at          │     │ last_synced         │
│ updated_at          │     │ is_active           │
└─────────────────────┘     └─────────────────────┘

┌─────────────────────┐     ┌─────────────────────┐
│    vault_config     │     │   encrypted_files   │
├─────────────────────┤     ├─────────────────────┤
│ id (PK)             │     │ id (PK)             │
│ pin_hash (blob)     │     │ doc_id (unique)     │
│ salt (blob)         │     │ wrapped_dek (blob)  │
│ created_at          │     │ encrypted_filename  │
│ updated_at          │     │ original_filename   │
└─────────────────────┘     │ created_at          │
                            └─────────────────────┘

┌─────────────────────┐     ┌─────────────────────┐
│    qb_torrents      │     │  indexed_archives   │
├─────────────────────┤     ├─────────────────────┤
│ id (PK)             │     │ id (PK)             │
│ torrent_hash(unique)│     │ archive_path(unique)│
│ torrent_name        │     │ archive_name        │
│ save_path           │     │ archive_type        │
│ files_indexed       │     │ articles_indexed    │
│ indexed_at          │     │ indexed_at          │
└─────────────────────┘     └─────────────────────┘

┌─────────────────────┐
│      bookmarks      │
├─────────────────────┤
│ id (PK)             │
│ slot (unique)       │
│ doc_id (unique)     │
│ title               │
│ file_type           │
│ file_path           │
│ created_at          │
│ updated_at          │
└─────────────────────┘
```

---

## Models

### Settings

Application configuration stored as key-value pairs.

```python
class Settings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=True)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
```

**Common settings:**
- `meili_index_name` — Search index name
- `ollama_model` — AI model for summaries
- `theme` — UI theme preference
- `page_size` — Results per page

---

### IndexedFolder

Tracks folders being monitored and indexed.

```python
class IndexedFolder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    folder_path = db.Column(db.String(500), unique=True, nullable=False)
    folder_name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_synced = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
```

**Purpose:**
- Remember which folders to index on startup
- Track sync status for incremental updates
- Enable/disable folders without deletion

---

### VaultConfig

Stores the encrypted vault PIN hash and salt.

```python
class VaultConfig(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pin_hash = db.Column(db.LargeBinary, nullable=False)
    salt = db.Column(db.LargeBinary, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
```

**Security:**
- Never stores the PIN directly
- Uses PBKDF2 with 100,000 iterations
- 16-byte random salt per installation

---

### EncryptedFile

Per-file encryption metadata for vault files.

```python
class EncryptedFile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    doc_id = db.Column(db.String(50), unique=True, nullable=False)
    wrapped_dek = db.Column(db.LargeBinary, nullable=False)
    encrypted_filename = db.Column(db.String(500), nullable=False)
    original_filename = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**Encryption flow:**
1. User enters PIN
2. PIN derives Key Encryption Key (KEK)
3. KEK unwraps Data Encryption Key (DEK)
4. DEK decrypts file content

---

### QBTorrent

Tracks indexed torrents from qBittorrent.

```python
class QBTorrent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    torrent_hash = db.Column(db.String(64), unique=True, nullable=False)
    torrent_name = db.Column(db.String(500), nullable=False)
    save_path = db.Column(db.String(500), nullable=False)
    files_indexed = db.Column(db.Integer, default=0)
    indexed_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**Purpose:**
- Avoid re-indexing same torrents
- Track which files came from which torrent
- Enable cleanup when torrent is removed

---

### IndexedArchive

Tracks ZIM/ZIP archives that have been indexed.

```python
class IndexedArchive(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    archive_path = db.Column(db.String(500), unique=True, nullable=False)
    archive_name = db.Column(db.String(255), nullable=False)
    archive_type = db.Column(db.String(10), nullable=False)
    articles_indexed = db.Column(db.Integer, default=0)
    indexed_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**Archive types:**
- `zim` — Wikipedia, Stack Overflow dumps
- `zip` — Standard ZIP archives

---

### Bookmark

Quick access bookmarks (5 slots).

```python
class Bookmark(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    slot = db.Column(db.Integer, unique=True, nullable=False)
    doc_id = db.Column(db.String(50), unique=True, nullable=False)
    title = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(20), nullable=False)
    file_path = db.Column(db.String(1000), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
```

**Usage:**
- 5 bookmark slots (1-5)
- Quick access from sidebar
- Stored independently of search index

---

## File System

### Directory Structure

```
instance/
├── searchbox.db        # SQLite database
├── vault/              # Encrypted files
│   ├── abc123.enc      # Encrypted file (UUID name)
│   └── def456.enc
└── thumbnails/         # Document thumbnails
    ├── abc123.webp     # Thumbnail (doc_id.webp)
    └── def456.webp

meili_data/             # Meilisearch index (separate)
├── data.mdb
└── ...
```

### Vault Files

Files in the vault are:

1. **Encrypted at rest** — AES-256-GCM
2. **Renamed** — Original name replaced with UUID
3. **Metadata stored in DB** — Links doc_id to filename

---

## Concurrency

### SQLite WAL Mode

SearchBox enables Write-Ahead Logging (WAL) for better concurrency:

```python
# Enable WAL mode
db.engine.execute("PRAGMA journal_mode=WAL")
db.engine.execute("PRAGMA busy_timeout=5000")
```

**Benefits:**
- Multiple readers, single writer
- No blocking between reads
- Better performance under load

### Connection Pooling

Flask-SQLAlchemy manages connection pooling:

```python
SQLALCHEMY_POOL_SIZE = 10
SQLALCHEMY_MAX_OVERFLOW = 20
SQLALCHEMY_POOL_TIMEOUT = 30
```

---

## Migrations

### Automatic Schema Creation

On first startup, tables are created automatically:

```python
with app.app_context():
    db.create_all()
```

### Future Migrations

For schema changes, SearchBox uses Flask-Migrate/Alembic (future):

```bash
# Initialize migrations
flask db init

# Create migration
flask db migrate -m "Add new column"

# Apply migration
flask db upgrade
```

---

## Backups

### Manual Backup

```bash
# Stop SearchBox
docker compose down
# or
systemctl stop searchbox

# Copy database
cp instance/searchbox.db backups/searchbox_$(date +%Y%m%d).db

# Restart
docker compose up -d
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
sqlite3 instance/searchbox.db ".backup 'backups/searchbox_$DATE.db'"
```

### Restore

```bash
# Stop SearchBox
systemctl stop searchbox

# Restore database
cp backups/searchbox_20240115.db instance/searchbox.db

# Start
systemctl start searchbox
```

---

## Performance

### Indexes

All tables have appropriate indexes:

- Primary keys (auto-indexed)
- Foreign keys (indexed)
- Unique constraints (indexed)
- Frequently queried columns (indexed)

### Query Optimization

The ORM generates efficient queries:

```python
# Indexed query
folder = IndexedFolder.query.filter_by(folder_path=path).first()
# Uses index on folder_path

# Bulk query
folders = IndexedFolder.query.filter_by(is_active=True).all()
# Single query, efficient
```

### Vacuum

Reclaim space and optimize:

```bash
sqlite3 instance/searchbox.db "VACUUM;"
```

---

## Future: PostgreSQL

For large-scale deployments (cloud version), PostgreSQL support is planned:

**Advantages:**
- Concurrent connections
- Better performance under load
- Built-in full-text search backup
- Point-in-time recovery

**When to switch:**
- Multiple users accessing simultaneously
- Database > 100GB
- Need for horizontal scaling

---

## Next Steps

- **[Extractor Architecture](extractor.md)** — Document processing
- **[Security Architecture](security.md)** — Security design
- **[Vault](../features/vault.md)** — Encrypted storage feature

---

**Previous:** [Architecture Overview](overview.md)  
**Next:** [Extractor Architecture](extractor.md)
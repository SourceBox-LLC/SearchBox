# Debugging Guide

Advanced debugging techniques.

> **Navigation:** [Documentation](../README.md) > [Troubleshooting](README.md) > [Debugging](debugging.md)

---

## Overview

This guide covers advanced debugging techniques when basic troubleshooting doesn't solve your issue.

---

## Logging

### Enable Debug Logging

```bash
# Docker
docker compose down
# Add to docker-compose.yml:
environment:
  - FLASK_DEBUG=1
  - LOG_LEVEL=DEBUG
docker compose up -d

# Native
export FLASK_DEBUG=1
export LOG_LEVEL=DEBUG
uv run python app.py
```

### View Logs

```bash
# Docker - all logs
docker compose logs -f

# Docker - specific service
docker compose logs -f searchbox
docker compose logs -f meilisearch

# Last 100 lines
docker compose logs --tail 100 searchbox

# Include timestamps
docker compose logs -f --timestamps
```

### Log Files

```bash
# If logs are written to files
tail -f instance/logs/searchbox.log
tail -f instance/logs/meilisearch.log
```

---

## Meilisearch Debugging

### Check Meilisearch Health

```bash
# Health check
curl http://localhost:7700/health

# Version
curl http://localhost:7700/version \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Stats
curl http://localhost:7700/stats \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"
```

### Index Information

```bash
# List indexes
curl http://localhost:7700/indexes \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Index stats
curl http://localhost:7700/indexes/documents/stats \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Get documents
curl "http://localhost:7700/indexes/documents/documents?limit=5" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"
```

### Task Queue

```bash
# List tasks
curl http://localhost:7700/tasks \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Task details
curl http://localhost:7700/tasks/123 \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Failed tasks
curl "http://localhost:7700/tasks?status=failed" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"
```

### Search Debug

```bash
# Raw search
curl -X POST "http://localhost:7700/indexes/documents/search" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q": "test", "limit": 10}'

# With filters
curl -X POST "http://localhost:7700/indexes/documents/search" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q": "test", "filter": "file_type = pdf"}'
```

### Reset Index

```bash
# WARNING: Deletes all data
curl -X DELETE "http://localhost:7700/indexes/documents" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Create new index
curl -X POST "http://localhost:7700/indexes" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"uid": "documents", "primaryKey": "id"}'
```

---

## Database Debugging

### SQLite CLI

```bash
# Open database
sqlite3 instance/searchbox.db

# List tables
.tables

# Schema
.schema

# Query
SELECT * FROM settings;
SELECT * FROM indexed_folders;
SELECT COUNT(*) FROM encrypted_files;

# Exit
.quit
```

### Check Integrity

```bash
# Integrity check
sqlite3 instance/searchbox.db "PRAGMA integrity_check;"

# Foreign keys
sqlite3 instance/searchbox.db "PRAGMA foreign_key_check;"

# Database size
sqlite3 instance/searchbox.db "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();"
```

### Lock Issues

```bash
# Check for locks
lsof instance/searchbox.db

# Kill processes
pkill -f searchbox

# Remove lock files
rm instance/searchbox.db-wal
rm instance/searchbox.db-shm
```

### Database Recovery

```bash
# Backup
cp instance/searchbox.db instance/searchbox.db.bak

# Recover
sqlite3 instance/searchbox.db ".recover" > recover.sql
sqlite3 instance/searchbox_new.db < recover.sql

# Replace
mv instance/searchbox_new.db instance/searchbox.db
```

---

## Docker Debugging

### Container Inspection

```bash
# List containers
docker compose ps

# Inspect container
docker compose exec searchbox env
docker compose exec searchbox cat /etc/os-release

# Check resources
docker stats searchbox

# Shell into container
docker compose exec searchbox bash
```

### Volume Inspection

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect searchbox_instance

# Backup volume
docker run --rm -v searchbox_instance:/data -v $(pwd):/backup \
  alpine tar czf /backup/instance-backup.tar.gz /data
```

### Network Debugging

```bash
# List networks
docker network ls

# Inspect network
docker network inspect searchbox_default

# Test connectivity
docker compose exec searchbox ping meilisearch
docker compose exec searchbox curl http://meilisearch:7700/health
```

### Rebuild from Scratch

```bash
# Stop everything
docker compose down -v

# Remove volumes (WARNING: deletes all data)
docker volume rm searchbox_instance searchbox_meili_data

# Rebuild
docker compose build --no-cache
docker compose up -d
```

---

## Network Debugging

### Port Issues

```bash
# Check if ports are in use
netstat -tlnp | grep 5000
netstat -tlnp | grep 7700

# Or use lsof
lsof -i :5000
lsof -i :7700

# Find process
lsof -i :5000 | awk 'NR>1 {print $2}' | xargs ps -p
```

### Connection Testing

```bash
# Test Flask
curl http://localhost:5000/health

# Test Meilisearch
curl http://localhost:7700/health

# From inside container
docker compose exec searchbox curl http://localhost:5000/health
docker compose exec searchbox curl http://meilisearch:7700/health

# From host
curl http://localhost:5000/health
curl http://localhost:7700/health
```

### Firewall Issues

```bash
# Check firewall (Ubuntu)
sudo ufw status

# Allow ports
sudo ufw allow 5000/tcp
sudo ufw allow 7700/tcp

# Check iptables
sudo iptables -L -n
```

---

## Performance Debugging

### Profiling Flask

```python
# Add to app.py
from werkzeug.middleware.profiler import ProfilerMiddleware

if os.environ.get('FLASK_DEBUG'):
    app.wsgi_app = ProfilerMiddleware(app.wsgi_app)
```

### Memory Profiling

```python
# Install memory_profiler
# pip install memory-profiler

from memory_profiler import profile

@profile
def search_function(query):
    # Your code
    pass
```

### Database Queries

```python
# Enable SQL logging
import logging
logging.basicConfig()
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
```

### Slow Query Analysis

```bash
# sqlite3 slow query log
sqlite3 instance/searchbox.db "PRAGMA temp_store = MEMORY;"
sqlite3 instance/searchbox.db "PRAGMA journal_mode = WAL;"
```

---

## Extractor Debugging

### Test Extractor

```bash
# Manual extraction
docker compose exec searchbox doc_extractor extract /path/to/file.pdf

# Check output
echo $?
```

### Extractor Logs

```bash
# In Python
import subprocess
result = subprocess.run(
    ["doc_extractor", "extract", filepath],
    capture_output=True,
    text=True,
    timeout=60
)
print(result.stdout)
print(result.stderr)
```

### Common Extractor Issues

**Symptom:** Extractor hangs

```bash
# Check timeout in code
subprocess.run(..., timeout=60)
```

**Symptom:** Extractor returns empty

```bash
# Check file type
file /path/to/file

# Check if file is corrupted
pdfinfo /path/to/file.pdf
```

---

## Vault Debugging

### Check Encryption

```python
# In Python shell
from utils.crypto import generate_dek, wrap_dek, unwrap_dek
from services.vault_service import derive_kek_from_pin

from app import app, VaultConfig

with app.app_context():
    config = VaultConfig.get()
    print(f"Vault configured: {config is not None}")
    if config:
        print(f"Salt length: {len(config.salt)}")
        print(f"PIN hash exists: {config.pin_hash is not None}")
```

### Test Encryption/Decryption

```python
from utils.crypto import generate_dek, encrypt_file, decrypt_file

# Generate key
dek = generate_dek()
print(f"Key length: {len(dek)} bytes")

# Test encrypt/decrypt
import tempfile
with tempfile.NamedTemporaryFile() as f:
    f.write(b"test content")
    f.flush()
    # encrypt_file(dek, f.name, "test.enc")
    # decrypt_file(dek, "test.enc", "test.dec")
```

### Vault State

```python
# Check vault files
import os
from config import VAULT_FOLDER

files = os.listdir(VAULT_FOLDER)
print(f"Files in vault: {len(files)}")
for f in files[:5]:
    print(f"  {f}")
```

---

## System Info

### Gather Diagnostics

```bash
# System info
uname -a

# Docker info
docker version
docker compose version

# Resources
free -h
df -h

# Python
python --version
uv --version

# Meilisearch
meilisearch --version

# Environment
docker compose exec searchbox env | sort
```

### Create Diagnostic File

```bash
#!/bin/bash
# diagnostics.sh

echo "=== System ===" > diagnostics.txt
uname -a >> diagnostics.txt

echo -e "\n=== Docker ===" >> diagnostics.txt
docker version >> diagnostics.txt 2>&1

echo -e "\n=== Resources ===" >> diagnostics.txt
free -h >> diagnostics.txt
df -h >> diagnostics.txt

echo -e "\n=== Ports ===" >> diagnostics.txt
lsof -i :5000 >> diagnostics.txt 2>&1
lsof -i :7700 >> diagnostics.txt 2>&1

echo -e "\n=== Logs (last 50 lines) ===" >> diagnostics.txt
docker compose logs --tail 50 >> diagnostics.txt 2>&1

echo "Diagnostics saved to diagnostics.txt"
```

---

## Getting Help

When asking for help, provide:

1. **Diagnostic file** — Run `diagnostics.sh`
2. **Steps to reproduce** — Exact commands
3. **Expected behavior** — What should happen
4. **Actual behavior** — What actually happens
5. **Error messages** — Full logs

### Submit Issue

[GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues)

Include:
- SearchBox version
- Operating system
- Docker version
- Diagnostic output
- Relevant logs
- Steps to reproduce

---

## Next Steps

- **[Common Issues](common-issues.md)** — Quick fixes
- **[FAQ](faq.md)** — Frequently asked questions
- **[Support](../community/support.md)** — Get help

---

**Previous:** [FAQ](faq.md)
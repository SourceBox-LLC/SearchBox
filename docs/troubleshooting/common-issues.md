# Common Issues

Solutions to frequently encountered problems.

> **Navigation:** [Documentation](../README.md) > [Troubleshooting](README.md) > [Common Issues](common-issues.md)

---

## Installation Issues

### Container Won't Start

**Symptom:** `docker compose up` fails or container exits immediately.

**Diagnosis:**
```bash
# Check logs
docker compose logs searchbox

# Check if ports are in use
lsof -i :5000
lsof -i :7700
```

**Solutions:**

1. **Port conflict:**
```bash
# Find process using port
lsof -i :5000

# Kill process or change port in docker-compose.yml
```

2. **Permission issues:**
```bash
# Fix permissions
sudo chown -R $USER:$USER instance vault meili_data
```

3. **Missing environment variables:**
```bash
# Ensure .env file exists
cat .env

# If not, copy example
cp .env.example .env
```

---

### uv Sync Fails

**Symptom:** `uv sync` fails with errors.

**Diagnosis:**
```bash
# Check Python version
python --version  # Should be 3.10+

# Check uv version
uv --version
```

**Solutions:**

1. **Wrong Python version:**
```bash
# Install Python 3.10+ (Ubuntu)
sudo apt install python3.10 python3.10-venv
```

2. **Corrupted cache:**
```bash
# Clear cache and reinstall
rm -rf .venv
uv sync
```

---

## Search Issues

### No Search Results

**Symptom:** Search returns empty results.

**Diagnosis:**
```bash
# Check if documents are indexed
curl "http://localhost:7700/indexes/documents/stats" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Check SearchBox logs
docker compose logs searchbox | grep -i index
```

**Solutions:**

1. **No documents indexed:**
   - Go to Settings → Folders
   - Add a folder and click "Index Now"
   - Wait for indexing to complete

2. **Meilisearch not running:**
```bash
# Check status
docker compose logs meilisearch

# Restart
docker compose restart meilisearch
```

3. **Wrong index name:**
```bash
# Check index name
curl "http://localhost:7700/indexes" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Should match INDEX_NAME in .env
```

---

### Search is Slow

**Symptom:** Search takes > 5 seconds.

**Diagnosis:**
```bash
# Check Meilisearch memory
docker stats meilisearch

# Check document count
curl "http://localhost:7700/indexes/documents/stats" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"
```

**Solutions:**

1. **Not enough memory:**
```bash
# Increase Docker memory limit
# Edit docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 4G
```

2. **Too many documents:**
   - Consider filtering by file type
   - Archive old documents
   - Split into multiple indexes

3. **Slow storage:**
   - Use SSD instead of HDD
   - Move database to faster storage

---

## Folder Indexing Issues

### Invalid Folder Path

**Symptom:** "Invalid folder path" error when adding folder.

**Diagnosis:**
```bash
# Check if folder exists
ls -la /path/to/folder

# Check Docker mounts
docker compose exec searchbox ls /data
```

**Solutions:**

1. **Folder not mounted:**
```yaml
# Add to docker-compose.yml
volumes:
  - /path/to/your/folder:/data:ro
```

2. **Permission denied:**
```bash
# Check permissions
ls -la /path/to/folder

# Fix permissions
chmod -R 755 /path/to/folder
```

3. **Path not absolute:**
   - Use absolute paths: `/home/user/Documents`
   - Not relative: `~/Documents`

---

### Indexing Stuck

**Symptom:** Indexing progresses but never finishes.

**Diagnosis:**
```bash
# Check indexing status
curl "http://localhost:5000/api/folders/status/job_123"

# Check logs
docker compose logs searchbox | grep -i "index"
```

**Solutions:**

1. **Large folder:**
   - Check progress in UI
   - Wait longer (large folders can take hours)

2. **Corrupted file:**
```bash
# Check logs for specific file
docker compose logs searchbox | grep -i "error"

# Skip problematic file by excluding it
```

3. **Out of memory:**
```bash
# Increase memory
docker compose down
# Edit docker-compose.yml to increase memory
docker compose up -d
```

---

## Vault Issues

### Vault PIN Not Working

**Symptom:** "Incorrect PIN" error.

**Diagnosis:**
- PIN must be exactly 4 digits
- Check rate limiting (5 attempts, then 5-minute lockout)

**Solutions:**

1. **Wrong PIN:**
   - Try again with correct PIN
   - Remember: PIN is not recoverable

2. **Rate limited:**
```bash
# Wait 5 minutes
# Or restart container (resets rate limit)
docker compose restart searchbox
```

3. **Forgot PIN:**
   - There is no recovery
   - Files remain encrypted and unreadable
   - Reset vault to start fresh

---

### Files Won't Decrypt

**Symptom:** "Failed to decrypt file" error.

**Diagnosis:**
```bash
# Check vault status
curl "http://localhost:5000/api/vault/status"

# Check if file exists
ls vault/
```

**Solutions:**

1. **Vault not unlocked:**
   - Unlock vault with PIN first
   - Then try downloading file

2. **Missing encryption metadata:**
```bash
# Check database
sqlite3 instance/searchbox.db "SELECT COUNT(*) FROM encrypted_files;"
```

3. **Corrupted file:**
   - File may be incomplete or corrupted
   - Check backup for original

---

## Docker Issues

### Container Won't Start

Already covered in [Installation Issues](#container-wont-start).

### Container Keeps Restarting

**Symptom:** `docker compose ps` shows "Restarting".

**Diagnosis:**
```bash
# Check logs
docker compose logs searchbox --tail 100

# Check exit code
docker compose ps
```

**Solutions:**

1. **Crash loop:**
```bash
# Check for OOM
docker compose logs searchbox | grep -i "oom"

# Increase memory
# Edit docker-compose.yml
```

2. **Configuration error:**
```bash
# Verify environment
docker compose exec searchbox env | grep MEILI
```

---

### Data Lost After Restart

**Symptom:** Data disappears after `docker compose down`.

**Diagnosis:**
```bash
# Check volumes
docker volume ls

# Check if volumes are defined
grep -A 10 "volumes:" docker-compose.yml
```

**Solutions:**

1. **Volumes not persistent:**
```yaml
# Add volumes to docker-compose.yml
volumes:
  - ./instance:/app/instance
  - ./vault:/app/vault
  - ./meili_data:/app/meili_data
```

2. **Wrong directory:**
```bash
# Ensure directory exists
mkdir -p instance vault meili_data
```

---

## Ollama / AI Issues

### AI Summaries Not Working

**Symptom:** "Ollama connection failed" or timeouts.

**Diagnosis:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check SearchBox logs
docker compose logs searchbox | grep -i ollama
```

**Solutions:**

1. **Ollama not running:**
```bash
# Start Ollama
ollama serve &

# Or use Docker
docker run -d --name ollama -p 11434:11434 ollama/ollama
```

2. **Wrong URL:**
```bash
# Check OLLAMA_URL in .env
# Docker: http://host.docker.internal:11434
# Linux: http://localhost:11434
```

3. **Model not downloaded:**
```bash
# Pull model
ollama pull llama2

# Verify
ollama list
```

---

### AI Summary is Slow

**Symptom:** Summaries take > 30 seconds.

**Solutions:**

1. **Use smaller model:**
```bash
# Use faster model
# Edit .env:
OLLAMA_MODEL=phi-3-mini
```

2. **GPU acceleration:**
```bash
# Ensure GPU is being used
nvidia-smi
```

3. **Increase timeout:**
```yaml
# In the request, specify longer timeout
# Or use streaming for progress
```

---

## Network Issues

### Can't Access from Other Devices

**Symptom:** SearchBox works on localhost but not from other devices.

**Solutions:**

1. **Bind to all interfaces:**
```bash
# Edit .env
SEARCHBOX_HOST=0.0.0.0
```

2. **Firewall blocking:**
```bash
# Allow port 5000
sudo ufw allow 5000/tcp

# Or on Windows, configure Windows Firewall
```

3. **Docker networking:**
```yaml
# Use host network mode (Linux only)
# docker-compose.yml:
network_mode: host
```

---

### CORS Errors

**Symptom:** "Cross-Origin Request Blocked" in browser console.

**Solutions:**

1. **Access from same origin:**
   - Use http://localhost:5000
   - Not http://127.0.0.1:5000

2. **Configure CORS (if needed):**
```python
# In config.py
CORS_ORIGINS = ['http://your-domain.com']
```

---

## Next Steps

- **[FAQ](faq.md)** — Frequently asked questions
- **[Debugging](debugging.md)** — Advanced debugging
- **[Production](../deployment/production.md)** — Production deployment

---

**Previous:** [Troubleshooting](README.md)  
**Next:** [FAQ](faq.md)
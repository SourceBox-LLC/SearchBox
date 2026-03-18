# Self-Hosted Deployment

Complete guide for self-hosted SearchBox.

> **Navigation:** [Documentation](../README.md) > [Deployment](README.md) > [Self-Hosted](self-hosted.md)

---

## Overview

Self-hosted deployment gives you **full control** over your SearchBox instance:

- 💾 **Local storage** — All data on your infrastructure
- 🔒 **Complete privacy** — No external services
- ⚙️ **Custom configuration** — Tune for your needs
- 💰 **Free** — No licensing costs

---

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 2GB | 4GB+ |
| **Storage** | 10GB | SSD, 100GB+ |
| **OS** | Linux (Ubuntu 22.04+) | Ubuntu 22.04+ |

### Software Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| **Python** | 3.10+ | Runtime |
| **uv** | Latest | Package manager |
| **Meilisearch** | 1.0+ | Search engine |
| **C++ toolchain** | Any | Extractor compilation (optional) |

---

## Installation Methods

### Method 1: Docker (Recommended)

**Easiest setup** — everything bundled in one container.

```bash
# Clone repository
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox

# Start with Docker Compose
docker compose up -d

# Verify
docker compose ps
docker compose logs -f
```

**Guide:** [Docker Deployment](docker.md)

---

### Method 2: Native Installation

**For advanced users** — manual installation without Docker.

#### Step 1: Install Dependencies

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y python3.10 python3.10-venv python3-pip build-essential
```

**macOS:**
```bash
brew install python@3.10
```

#### Step 2: Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

#### Step 3: Clone Repository

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
```

#### Step 4: Install Python Dependencies

```bash
uv sync
```

#### Step 5: Install Meilisearch

**Linux:**
```bash
curl -L https://install.meilisearch.com | sh
sudo mv meilisearch /usr/local/bin/
```

**macOS:**
```bash
brew install meilisearch
```

#### Step 6: Configure Environment

Create `.env` file:

```bash
# Flask configuration
FLASK_SECRET_KEY=$(openssl rand -hex 32)
MEILI_MASTER_KEY=$(openssl rand -hex 16)

# Meilisearch
MEILI_HOST=http://localhost
MEILI_PORT=7700

# SearchBox
SEARCHBOX_HOST=0.0.0.0
SEARCHBOX_PORT=5000
SEARCHBOX_DB_DIR=./instance

# Optional: Ollama
OLLAMA_URL=http://localhost:11434
```

Generate keys:
```bash
# Add to .env
echo "FLASK_SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "MEILI_MASTER_KEY=$(openssl rand -hex 16)" >> .env
```

#### Step 7: Start Meilisearch

```bash
meilisearch --master-key $MEILI_MASTER_KEY &
```

#### Step 8: Start SearchBox

```bash
uv run python app.py
```

Access at **http://localhost:5000**

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_SECRET_KEY` | Auto-generated | Flask session secret |
| `MEILI_MASTER_KEY` | `aSampleMasterKey` | Meilisearch auth key |
| `MEILI_HOST` | `http://localhost` | Meilisearch host |
| `MEILI_PORT` | `7700` | Meilisearch port |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API URL |
| `SEARCHBOX_HOST` | `127.0.0.1` | Flask bind address |
| `SEARCHBOX_PORT` | `5000` | Flask port |
| `SEARCHBOX_DB_DIR` | `./instance` | SQLite database directory |

### Database

SearchBox uses **SQLite** by default:

```
instance/
├── searchbox.db    # SQLite database
├── vault/          # Encrypted files
└── thumbnails/     # Document thumbnails
```

**Change database location:**
```bash
export SEARCHBOX_DB_DIR=/path/to/custom/location
```

### Folder Access

By default, SearchBox has read-only access to:

| Linux/macOS | Windows |
|-------------|---------|
| `/home` | `C:/` (via `/c/`) |
| `/mnt` | `D:/` (via `/d/`) |
| `/media` | Additional drives |

**Add custom folder:**

Edit `docker-compose.yml`:
```yaml
volumes:
  - /path/to/your/folder:/data:ro
```

---

## Systemd Service

Run SearchBox as a systemd service (Linux).

### Create Service File

```bash
sudo nano /etc/systemd/system/searchbox.service
```

**Content:**
```ini
[Unit]
Description=SearchBox Document Search Engine
After=network.target meilisearch.service

[Service]
Type=simple
User=searchbox
Group=searchbox
WorkingDirectory=/opt/SearchBox
Environment="FLASK_SECRET_KEY=your-secret-key"
Environment="MEILI_MASTER_KEY=your-master-key"
ExecStart=/usr/bin/uv run python app.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Create Meilisearch Service

```bash
sudo nano /etc/systemd/system/meilisearch.service
```

**Content:**
```ini
[Unit]
Description=Meilisearch Search Engine
After=network.target

[Service]
Type=simple
User=searchbox
Group=searchbox
ExecStart=/usr/local/bin/meilisearch --master-key $MEILI_MASTER_KEY --db-path /var/lib/meilisearch
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable Services

```bash
sudo systemctl daemon-reload
sudo systemctl enable meilisearch
sudo systemctl enable searchbox
sudo systemctl start meilisearch
sudo systemctl start searchbox
```

### Manage Services

```bash
# Check status
sudo systemctl status searchbox

# View logs
sudo journalctl -u searchbox -f

# Restart service
sudo systemctl restart searchbox

# Stop service
sudo systemctl stop searchbox
```

---

## Production Checklist

### Security

- [ ] Change default `FLASK_SECRET_KEY`
- [ ] Change default `MEILI_MASTER_KEY`
- [ ] Use HTTPS (reverse proxy with Let's Encrypt)
- [ ] Configure firewall (UFW, iptables)
- [ ] Disable debug mode
- [ ] Secure database file permissions (`chmod 600`)

### Performance

- [ ] Increase Meilisearch heap size
- [ ] Use SSD for database and indexes
- [ ] Configure resource limits (Docker)
- [ ] Enable GZIP compression (nginx)
- [ ] Cache static assets

### Backups

- [ ] Set up automated SQLite backups
- [ ] Backup vault files (`vault/` directory)
- [ ] Backup thumbnails (`static/thumbnails/`)
- [ ] Test backup restoration

### Monitoring

- [ ] Set up health checks
- [ ] Configure log rotation
- [ ] Monitor disk usage
- [ ] Set up uptime monitoring

---

## Updates

### Update SearchBox

```bash
cd SearchBox
git pull
uv sync
sudo systemctl restart searchbox
```

### Update Meilisearch

```bash
curl -L https://install.meilisearch.com | sh
sudo mv meilisearch /usr/local/bin/
sudo systemctl restart meilisearch
```

---

## Troubleshooting

### Meilisearch Won't Start

**Symptom:** Meilisearch fails to start

**Check logs:**
```bash
sudo journalctl -u meilisearch -f
```

**Common causes:**
- Port 7700 in use
- Invalid master key
- Permission issues

**Solution:**
```bash
# Check port
lsof -i :7700

# Fix permissions
sudo chown -R searchbox:searchbox /var/lib/meilisearch
```

### SQLite Database Locked

**Symptom:** "Database is locked" error

**Cause:** SQLite concurrency limit

**Solution:**
- Enable WAL mode
- Reduce concurrent requests
- Consider PostgreSQL migration (future)

### Out of Memory

**Symptom:** Container crashes or OOM killed

**Cause:** Insufficient RAM

**Solution:**
```bash
# Check memory usage
free -h

# Restart with more RAM
docker compose down
# Edit docker-compose.yml to increase memory limits
docker compose up -d
```

---

## Next Steps

- **[Production Hardening](production.md)** — Security and optimization
- **[Troubleshooting](../troubleshooting/common-issues.md)** — Common issues
- **[Features](../features/README.md)** — Learn about capabilities

---

**Previous:** [Deployment Options](README.md)  
**Next:** [Docker Deployment](docker.md)
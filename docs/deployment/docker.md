# Docker Deployment

Deploy SearchBox using Docker - the simplest installation method.

> **Navigation:** [Documentation](../README.md) > [Deployment](README.md) > [Docker](docker.md)

---

## Overview

Docker deployment provides:

- 🐳 **One-command setup** — Everything bundled
- 🔄 **Auto-updates** — Pull latest image
- 🔒 **Isolation** —Contained dependencies
- 📦 **Portability** — Run anywhere Docker runs

---

## Prerequisites

### Install Docker

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**macOS:**
```bash
brew install --cask docker
```

**Windows:**
Download from [docker.com](https://www.docker.com/products/docker-desktop)

### Verify Installation

```bash
docker --version
docker compose version
```

---

## Quick Start

### Clone Repository

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
```

### Start Container

```bash
docker compose up -d
```

### Verify Running

```bash
docker compose ps
docker compose logs -f
```

Access at **http://localhost:5000**

---

## Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# REQUIRED: Change in production
FLASK_SECRET_KEY=$(openssl rand -hex 32)
MEILI_MASTER_KEY=$(openssl rand -hex 16)

# Optional
OLLAMA_URL=http://host.docker.internal:11434
```

**Generate keys:**
```bash
echo "FLASK_SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "MEILI_MASTER_KEY=$(openssl rand -hex 16)" >> .env
```

### docker-compose.yml

Default configuration:

```yaml
version: '3.8'

services:
  searchbox:
    build: .
    ports:
      - "5000:5000"
    environment:
      - FLASK_SECRET_KEY=${FLASK_SECRET_KEY:-change-me}
      - MEILI_MASTER_KEY=${MEILI_MASTER_KEY:-aSampleMasterKey}
      - MEILI_HOST=http://localhost
      - MEILI_PORT=7700
      - MEILI_AUTO_START=true
      - OLLAMA_URL=${OLLAMA_URL:-http://host.docker.internal:11434}
    volumes:
      # Data persistence
      - ./instance:/app/instance
      - ./vault:/app/vault
      - ./static/thumbnails:/app/static/thumbnails
      - ./meili_data:/app/meili_data
      # Folder access (read-only)
      - /home:/home:ro
      - /mnt:/mnt:ro
      - /media:/media:ro
    restart: unless-stopped
```

---

## Volume Mounts

### Required Mounts

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `./instance` | `/app/instance` | SQLite database |
| `./vault` | `/app/vault` | Encrypted files |
| `./static/thumbnails` | `/app/static/thumbnails` | Document thumbnails |
| `./meili_data` | `/app/meili_data` | Search index |

### Folder Access

Mount folders for SearchBox to index:

```yaml
volumes:
  # Linux
  - /home:/home:ro
  - /mnt:/mnt:ro
  - /media:/media:ro
  - /path/to/documents:/data:ro
  
  # Windows (use /c/, /d/ notation)
  - /c/Users:/c/Users:ro
  - /d:/d:ro
```

---

## Advanced Configuration

### Resource Limits

```yaml
services:
  searchbox:
    # ... config ...
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

### Health Check

```yaml
services:
  searchbox:
    # ... config ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Custom Network

```yaml
services:
  searchbox:
    # ... config ...
    networks:
      - searchbox-net

networks:
  searchbox-net:
    driver: bridge
```

---

## Common Commands

### Start/Stop

```bash
# Start in background
docker compose up -d

# Stop
docker compose down

# Restart
docker compose restart

# View logs
docker compose logs -f searchbox
```

### Updates

```bash
# Pull latest code
git pull

# Rebuild image
docker compose build

# Restart with new image
docker compose up -d
```

### Data Management

```bash
# Backup data
docker compose exec searchbox tar czf /app/backup.tar.gz instance vault static/thumbnails

# Access container shell
docker compose exec searchbox bash

# Check disk usage
docker compose exec searchbox du -sh instance vault meili_data
```

---

## Production Setup

### Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name searchbox.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### HTTPS with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d searchbox.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### Environment Variables (Production)

```bash
# .env (production)
FLASK_SECRET_KEY=<64-char-hex>
MEILI_MASTER_KEY=<32-char-hex>
OLLAMA_URL=http://ollama-server:11434
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs searchbox

# Common issues:
# - Port 5000 in use
# - Missing environment variables
# - Permission denied on volumes
```

### Permission Errors

```bash
# Fix volume permissions
sudo chown -R $USER:$USER instance vault meili_data static/thumbnails
```

### Memory Issues

```bash
# Check container stats
docker stats searchbox

# Increase memory limit in docker-compose.yml
```

### Network Issues

```bash
# Check container network
docker network ls
docker network inspect searchbox_default

# Rebuild network
docker compose down
docker compose up -d
```

---

## Next Steps

- **[Production Hardening](production.md)** — Security and optimization
- **[Self-Hosted](self-hosted.md)** — Native installation
- **[Cloud](cloud.md)** — Managed cloud version

---

**Previous:** [Self-Hosted](self-hosted.md)  
**Next:** [Production Hardening](production.md)
# Deployment Options

Deploy SearchBox in your environment.

> **Navigation:** [Documentation](../README.md) > [Deployment](README.md)

---

## Choose Your Deployment Method

| Method | Best For | Difficulty | Time |
|--------|----------|------------|------|
| **Docker (Recommended)** | Most users | Easy | 5 min |
| **Self-Hosted** | Individuals, technical teams | Easy | 10 min |
| **Production** | Production environments | Intermediate | 30 min |
| **Cloud (Coming Soon)** | Teams, non-technical | Easy | Instant |

---

## Option 1: Docker (Recommended)

**Fastest setup** — Single container with everything bundled.

### Quick Start

```bash
# Clone repository
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox

# Start with Docker Compose
docker compose up -d

# Access at http://localhost:5000
```

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- 2GB+ RAM recommended

### Verify Deployment
```bash
docker compose ps
docker compose logs -f
```

**Guide:** [Docker Deployment](docker.md)

---

## Option 2: Self-Hosted

**Full control** — Run on your own infrastructure.

### Requirements
- Python 3.10+
- uv package manager
- Meilisearch binary
- C++ extractor (for advanced formats)

### Installation

```bash
# Clone repository
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox

# Install dependencies
uv sync

# Set environment variables
export FLASK_SECRET_KEY=$(openssl rand -hex 32)
export MEILI_MASTER_KEY=$(openssl rand -hex 16)

# Start Meilisearch (separate process)
meilisearch --master-key $MEILI_MASTER_KEY &

# Start SearchBox
uv run python app.py
```

**Guide:** [Self-Hosted Guide](self-hosted.md)

---

## Option 3: Production

**Production-ready** deploys with hardening and optimization.

### Checklist
- [ ] Secure environment variables
- [ ] HTTPS with SSL certificates
- [ ] Reverse proxy (nginx/traefik)
- [ ] Resource limits configured
- [ ] Automated backups
- [ ] Monitoring enabled
- [ ] Regular updates scheduled

### Resource Requirements

| Users | RAM | CPU | Storage |
|-------|-----|-----|----------|
| 1-5 | 2GB | 2 cores | 50GB |
| 5-20 | 4GB | 4 cores | 200GB |
| 20-50 | 8GB | 8 cores | 500GB |
| 50+ | 16GB+ | 8+ cores | 1TB+ |

**Guide:** [Production Hardening](production.md)

---

## Option 4: Cloud (Coming Soon)

**Managed hosting** with team features.

> ☁️ **SearchBox Cloud** — Coming Soon
>
> - ✅ No setup required
> - ✅ Automatic backups & updates
> - ✅ Team collaboration
> - ✅ 99.9% uptime SLA
> - ✅ Priority support
> - 💰 Starting at $19/month (3 users)
>
> **[Join the Waitlist](https://sourcebox.ai/waitlist)**

---

## Quick Navigation

### Deployment Guides

| Guide | Description | Link |
|-------|-------------|------|
| [Docker](docker.md) | Container deployment | [Guide](docker.md) |
| [Self-Hosted](self-hosted.md) | Manual installation | [Guide](self-hosted.md) |
| [Production](production.md) | Hardening & optimization | [Guide](production.md) |
| [Cloud](cloud.md) | Managed hosting (coming soon) | [Info](cloud.md) |

### Configuration

| Topic | Description | Link |
|-------|-------------|------|
| Environment Variables | Configuration options | [Reference](self-hosted.md#environment-variables) |
| Volume Mounts | File access configuration | [Guide](docker.md#volume-mounts) |
| Resource Limits | Performance tuning | [Guide](production.md#resource-limits) |

### Maintenance

| Topic | Description | Link |
|-------|-------------|------|
| Updates | How to update | [Guide](self-hosted.md#updates) |
| Backups | Backup strategies | [Guide](production.md#backups) |
| Monitoring | Health checks | [Guide](production.md#monitoring) |

---

## Platform-Specific Notes

### Linux (Ubuntu/Debian)

- Default mounts: `/home`, `/mnt`, `/media`
- Docker requires sudo or user in docker group
- Works with Docker Compose

### Windows

- Enable drive sharing in Docker Desktop
- Use Windows override file: `docker-compose.windows.yml`
- Paths use `/c/`, `/d/` notation (C:/, D:/)

### macOS

- Default mounts: `/Users`, `/Volumes`
- Works with Docker Desktop for Mac
- Use `host.docker.internal` for Ollama

---

## Architecture Overview

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP
┌──────▼──────┐
│  SearchBox  │
│   (Flask)   │
└──────┬──────┘
       │
  ┌────┴────┐
  │         │
┌─▼────┐ ┌─▼──────┐
│Meili-│ │ SQLite │
│search│ │ (DB)   │
└──────┘ └────────┘
  │         │
  │         │
┌─▼─────────▼──┐
│ File Storage │
│ (Volumes)    │
└──────────────┘
```

---

## Support

- **[Troubleshooting](../troubleshooting/common-issues.md)** — Common deployment issues
- **[FAQ](../troubleshooting/faq.md)** — Frequently asked questions
- **[Community Support](../community/support.md)** — Get help

---

**Previous:** [Your First Search](../getting-started/first-search.md)  
**Next:** [Docker Deployment](docker.md)
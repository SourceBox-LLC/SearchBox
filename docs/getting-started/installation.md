# Installation Guide

Detailed installation instructions for all platforms.

> **Navigation:** [Documentation](../README.md) > [Getting Started](README.md) > [Installation](installation.md)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | 2.0+ | Container orchestration |
| **Git** | Any | Clone repository |

### Optional Software

| Software | Purpose |
|----------|---------|
| **Ollama** | AI-powered search summaries |
| **qBittorrent** | Torrent integration |

---

## Platform-Specific Installation

### Linux (Ubuntu/Debian)

#### 1. Install Docker

```bash
# Add Docker's official GPG key
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

#### 2. Add User to Docker Group

```bash
sudo usermod -aG docker $USER
newgrp docker
```

#### 3. Clone SearchBox

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
```

#### 4. Start SearchBox

```bash
docker compose up -d
```

---

### macOS

#### 1. Install Docker Desktop

1. Download [Docker Desktop for Mac](https://desktop.docker.com/mac/main/amd64/Docker.dmg)
2. Drag Docker to Applications folder
3. Start Docker Desktop
4. Wait for Docker to finish starting (whale icon in menu bar)

#### 2. Install Git

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Git
brew install git
```

#### 3. Clone SearchBox

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
```

#### 4. Start SearchBox

```bash
docker compose up -d
```

---

### Windows

#### 1. Install Docker Desktop

1. Download [Docker Desktop for Windows](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
2. Run installer
3. Follow installation wizard
4. Restart computer if prompted
5. Start Docker Desktop

#### 2. Enable Drive Sharing

1. Right-click Docker Desktop icon in system tray
2. Click **Settings**
3. Go to **Resources** → **File sharing**
4. Enable drives you want SearchBox to access (C:, D:, etc.)
5. Click **Apply & Restart**

#### 3. Install Git

Download and install [Git for Windows](https://git-scm.com/download/win)

Or use winget:
```powershell
winget install --id Git.Git -e --source winget
```

#### 4. Clone SearchBox

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
```

#### 5. Start SearchBox

```bash
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d
```

---

## Verify Installation

### Check Container Status

```bash
docker compose ps
```

Expected output:
```
NAME                    STATUS          PORTS
searchbox-searchbox-1   Up (healthy)    0.0.0.0:5000->5000/tcp
```

### View Logs

```bash
docker compose logs -f
```

Look for:
```
INFO:werkzeug: * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
```

### Access Web Interface

Open **http://localhost:5000** in your browser.

You should see the SearchBox home page.

---

## Configuration

### Environment Variables

Create a `.env` file in the SearchBox directory:

```bash
# Flask configuration
FLASK_SECRET_KEY=your-secret-key-here

# Meilisearch configuration
MEILI_MASTER_KEY=your-master-key-here
MEILI_HOST=http://localhost
MEILI_PORT=7700

# Optional: Ollama for AI
OLLAMA_URL=http://host.docker.internal:11434

# Optional: Custom host/port
SEARCHBOX_HOST=0.0.0.0
SEARCHBOX_PORT=5000
```

**Important:** Generate secure keys:
```bash
# Generate Flask secret key
openssl rand -hex 32

# Generate Meilisearch master key
openssl rand -hex 16
```

### Volume Mounts

SearchBox mounts these directories by default:

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `$HOME` | `/home` | Home directory |
| `/mnt` | `/mnt` | Mounted drives |
| `/media` | `/media` | External media |

**Windows:**
| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `C:/` | `/c` | C: drive |
| `D:/` | `/d` | D: drive (if enabled) |

---

## Post-Installation

### 1. Index Your First Folder

1. Open http://localhost:5000
2. Click **Index Folder** tab
3. Enter folder path
4. Click **Index Folder**

### 2. Set Up Vault PIN (Optional)

1. Go to **Settings** → **Vault Security**
2. Click **Set Up PIN**
3. Enter 4-digit PIN
4. Confirm PIN

### 3. Enable AI Summaries (Optional)

1. Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull a model: `ollama pull gemma3:12b`
3. In SearchBox: Settings → AI Search → Enable
4. Set Ollama URL: `http://host.docker.internal:11434`

---

## Update SearchBox

### Check for Updates

```bash
cd SearchBox
git pull
```

### Apply Updates

```bash
docker compose pull
docker compose up -d --remove-orphans
```

### Clean Up Old Images

```bash
docker image prune -f
```

---

## Uninstall

### Stop Containers

```bash
docker compose down
```

### Remove Images

```bash
docker rmi searchbox-searchbox
```

### Remove Data (Optional)

```bash
# Remove instance directory (database)
rm -rf instance/

# Remove Meilisearch data
rm -rf meili_data/

# Remove thumbnails
rm -rf static/thumbnails/
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs

# Check port conflicts
lsof -i :5000
netstat -tlnp | grep 5000
```

### Permission Denied

```bash
# Fix ownership
sudo chown -R $USER:$USER instance/ meili_data/

# Fix Docker permissions
sudo usermod -aG docker $USER
newgrp docker
```

### Out of Disk Space

```bash
# Clean Docker
docker system prune -a

# Check disk usage
df -h
```

---

## Next Steps

- **[Quick Start](quickstart.md)** — Get started in 5 minutes
- **[Your First Search](first-search.md)** — Complete search tutorial
- **[Features](../features/README.md)** — Learn about capabilities
- **[Deployment](../deployment/README.md)** — Production deployment

---

## Need Help?

- **[Troubleshooting](../troubleshooting/common-issues.md)** — Common issues
- **[FAQ](../troubleshooting/faq.md)** — Frequently asked questions
- **[Community Support](../community/support.md)** — Get help

---

**Time:** 10 minutes  
**Difficulty:** Easy  
**Previous:** [Quick Start](quickstart.md)  
**Next:** [Your First Search](first-search.md)

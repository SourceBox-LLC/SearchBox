# Quick Start

Get SearchBox running in 5 minutes.

> **Navigation:** [Documentation](../README.md) > [Getting Started](README.md) > [Quick Start](quickstart.md)

---

## Prerequisites

Before you begin, ensure you have:

- **[Docker](https://docs.docker.com/get-docker/)** and **Docker Compose** installed
- A folder with documents you want to index (PDFs, Word docs, etc.)

**Optional:**
- **[Ollama](https://ollama.com)** for AI-powered summaries

---

## Step 1: Clone Repository

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
```

---

## Step 2: Start with Docker

### Linux/macOS

```bash
docker compose up -d
```

### Windows

1. **Enable Drive Sharing in Docker Desktop:**
   - Open Docker Desktop → Settings → Resources → File sharing
   - Enable the drives you want SearchBox to access (C:, D:, etc.)
   - Apply & Restart

2. **Start with Windows override:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d
   ```

---

## Step 3: Open SearchBox

Navigate to **http://localhost:5000** in your browser.

---

## Step 4: Index Your First Folder

1. Click **Index Folder** tab
2. Enter a folder path:
   - **Windows:** `C:/Users/YourName/Documents`
   - **Linux:** `/home/yourname/Documents`
3. Click **Index Folder**
4. Watch the progress bar as files are processed

---

## Step 5: Search Your Documents

1. Return to **Home** tab
2. Type a search query in the search bar
3. Press Enter or click search icon
4. Browse results with thumbnails

---

## What's Next?

### Explore Features

- **[Search Syntax](../features/search.md)** — Learn advanced search operators
- **[Bookmarks](../features/bookmarks.md)** — Save frequently accessed documents
- **[Encrypted Vault](../features/vault.md)** — Store sensitive documents securely
- **[AI Summaries](../features/ai-summaries.md)** — Enable AI-powered summaries

### Learn More

- **[Installation Guide](installation.md)** — Detailed installation instructions
- **[Your First Search](first-search.md)** — Complete search tutorial
- **[Deployment Options](../deployment/self-hosted.md)** — Production deployment

### Get Help

- **[Troubleshooting](../troubleshooting/common-issues.md)** — Common issues and solutions
- **[FAQ](../troubleshooting/faq.md)** — Frequently asked questions
- **[Community Support](../community/support.md)** — Get help from the community

---

## Verify Installation

Check that everything is running:

```bash
docker compose ps
```

You should see:
```
NAME                    STATUS
searchbox-searchbox-1   Up
```

View logs:
```bash
docker compose logs -f
```

Look for: `"Running on http://0.0.0.0:5000"`

---

## Quick Reference

| Task | Command/GUI |
|------|-------------|
| Start SearchBox | `docker compose up -d` |
| Stop SearchBox | `docker compose down` |
| View logs | `docker compose logs -f` |
| Access UI | http://localhost:5000 |
| Index folder | UI → Index Folder tab |
| Search documents | UI → Home tab |

---

**Time:** 5 minutes  
**Difficulty:** Easy  
**Next:** [Installation Guide](installation.md) for detailed setup

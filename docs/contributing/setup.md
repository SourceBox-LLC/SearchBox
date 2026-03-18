# Development Setup

Set up your development environment.

> **Navigation:** [Documentation](../README.md) > [Contributing](README.md) > [Setup](setup.md)

---

## Quick Start

```bash
# Clone
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox

# Install dependencies
uv sync

# Configure
cp .env.example .env
# Edit .env

# Start services
meilisearch --master-key dev-key &

# Run
uv run python app.py
```

---

## Prerequisites

### Required

| Software | Version | Purpose |
|----------|---------|---------|
| **Python** | 3.10+ | Runtime |
| **uv** | Latest | Package manager |
| **Meilisearch** | 1.0+ | Search engine |

### Optional

| Software | Purpose |
|----------|---------|
| **Docker** | Containerized development |
| **Ollama** | AI summaries |
| **C++ toolchain** | Extractor development |

---

## Installation

### 1. Python

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install python3.10 python3.10-venv python3-pip build-essential
```

**macOS:**
```bash
brew install python@3.10
```

**Windows:**
Download from [python.org](https://python.org)

### 2. uv

```bash
# Linux/macOS
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
pip install uv
```

### 3. Meilisearch

**Linux:**
```bash
curl -L https://install.meilisearch.com | sh
sudo mv meilisearch /usr/local/bin/
```

**macOS:**
```bash
brew install meilisearch
```

**Windows:**
Download from [meilisearch.com](https://meilisearch.com)

### 4. C++ Toolchain (Optional)

For developing the extractor:

**Ubuntu/Debian:**
```bash
sudo apt install build-essential cmake \
    libmupdf-dev libmujs-dev libgumbo-dev \
    libzip-dev libpugixml-dev libzim-dev \
    librsvg2-dev libcairo2-dev
```

**macOS:**
```bash
brew install cmake mupdf gumbo-parser libzip pugixml libzim librsvg cairo
```

---

## Project Setup

### Clone Repository

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
```

### Install Dependencies

```bash
uv sync
```

This creates a virtual environment and installs all dependencies.

### Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit with your settings
nano .env
```

**.env file:**
```bash
# Flask
FLASK_SECRET_KEY=dev-secret-key-change-in-production
FLASK_DEBUG=true

# Meilisearch
MEILI_HOST=http://localhost
MEILI_PORT=7700
MEILI_MASTER_KEY=dev-master-key

# SearchBox
SEARCHBOX_HOST=127.0.0.1
SEARCHBOX_PORT=5000
SEARCHBOX_DB_DIR=./instance

# Ollama (optional)
OLLAMA_URL=http://localhost:11434
```

### Initialize Database

```bash
# Database is created automatically on first run
uv run python -c "from app import app, db; app.app_context().push(); db.create_all()"
```

---

## Running

### Development Server

```bash
# Start Meilisearch
meilisearch --master-key dev-master-key &

# Start SearchBox
uv run python app.py
```

Access at **http://localhost:5000**

### With Auto-Reload

```bash
# Using Flask dev server
uv run flask --app app run --debug --port 5000
```

### Docker Development

```bash
# Build and run
docker compose up --build

# Attach to container
docker compose exec searchbox bash
```

---

## IDE Setup

### VS Code

Install extensions:
- Python (Microsoft)
- Pylance
- Black Formatter
- Ruff

**settings.json:**
```json
{
  "python.defaultInterpreterPath": ".venv/bin/python",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "ms-python.black-formatter",
  "[python]": {
    "editor.codeActionsOnSave": {
      "source.fixAll": "explicit",
      "source.organizeImports": "explicit"
    }
  }
}
```

### PyCharm

1. Open project
2. Configure interpreter: `.venv/bin/python`
3. Enable Black: Settings → Tools → Black
4. Enable Ruff: Settings → Tools → External Tools

---

## Database

### SQLite

Default SQLite database in `instance/searchbox.db`:

```bash
# View database
sqlite3 instance/searchbox.db

# Tables
.tables

# Query
SELECT * FROM settings;
```

### Migrations

We use Flask-Migrate for schema changes:

```bash
# Initialize (first time only)
flask db init

# Create migration
flask db migrate -m "Add new column"

# Apply migration
flask db upgrade
```

---

## Testing

### Run Tests

```bash
# All tests
uv run pytest

# Specific file
uv run pytest tests/test_documents.py

# With coverage
uv run pytest --cov=routes --cov=services

# Verbose
uv run pytest -v
```

### Write Tests

```python
# tests/test_example.py
import pytest

def test_example(client):
    """Test example endpoint."""
    response = client.get('/api/example')
    assert response.status_code == 200

def test_example_with_data(client):
    """Test example with fixtures."""
    # Setup
    data = create_test_data()
    
    # Test
    response = client.get(f'/api/example/{data.id}')
    
    # Assert
    assert response.json['name'] == 'test'
```

---

## Debugging

### Enable Debug Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Flask Debug Mode

```bash
FLASK_DEBUG=true uv run python app.py
```

### Interactive Debugging

```python
# Add breakpoint
import pdb; pdb.set_trace()

# Or with ipdb (install first)
import ipdb; ipdb.set_trace()
```

### Meilisearch Logs

```bash
# Start with logs
meilisearch --master-key dev-key --log-level debug
```

---

## Hot Reload

### Python (Flask)

Flask auto-reloads on file changes in debug mode:

```bash
FLASK_DEBUG=true uv run flask --app app run
```

### Frontend (CSS/JS)

Use a file watcher or live reload extension.

### Tailwind (if using)

```bash
npx tailwindcss -i ./static/css/input.css -o ./static/css/output.css --watch
```

---

## Troubleshooting

### Import Errors

```bash
# Ensure virtual environment is active
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# Re-install dependencies
uv sync
```

### Database Locked

```bash
# Stop SearchBox
# Delete database lock
rm instance/searchbox.db-wal
rm instance/searchbox.db-shm
```

### Port in Use

```bash
# Find process on port
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Meilisearch Won't Start

```bash
# Check logs
meilisearch --master-key dev-key --log-level debug

# Clear data if corrupted
rm -rf meili_data/
```

---

## Next Steps

- **[Code Style](code-style.md)** — Formatting and linting
- **[Testing](testing.md)** — Writing tests
- **[PR Process](pr-process.md)** — Submitting changes

---

**Previous:** [Contributing](README.md)  
**Next:** [Code Style](code-style.md)
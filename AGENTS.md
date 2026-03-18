# AGENTS.md

Guidance for AI agents working on this codebase.

## Project Overview

SearchBox is a self-hosted document search engine. It indexes PDFs, Word docs, images, and archives, providing full-text search with AI-powered summaries. All processing happens locally — no external services.

**Tech Stack:**
- Backend: Python (Flask)
- Database: SQLite (SQLAlchemy)
- Search: Meilisearch
- Frontend: Jinja2 templates, vanilla JavaScript
- Document Extraction: C++ (MuPDF, libzim, etc.)

## Code Quality Commands

Run these before committing changes:

### Python Linting
```bash
# Format code
uv run black .

# Lint
uv run ruff check . --fix

# Type check
uv run mypy .
```

### Tests
```bash
# Run all tests
uv run pytest

# Run specific test file
uv run pytest tests/test_example.py

# Run with coverage
uv run pytest --cov=routes --cov=services
```

## Project Structure

```
SearchBox/
├── app.py              # Flask application entry point
├── config.py           # Configuration management
├── models.py           # SQLAlchemy database models
├── routes/             # HTTP route handlers
│   ├── documents.py    # Document API
│   ├── folders.py      # Folder indexing
│   ├── vault.py        # Vault management
│   ├── meilisearch_routes.py  # Search engine
│   ├── ollama.py       # AI integration
│   ├── qbittorrent.py  # Torrent integration
│   ├── zim.py          # ZIM archives
│   ├── settings.py     # Settings API
│   └── pages.py        # Web pages
├── services/           # Business logic
│   ├── document_service.py    # Document processing
│   ├── meilisearch_service.py # Search operations
│   ├── vault_service.py       # Encryption
│   ├── config_service.py      # Settings
│   ├── qbittorrent_service.py # qBittorrent API
│   └── zim_service.py         # ZIM handling
├── utils/              # Utility functions
│   ├── crypto.py       # Encryption helpers
│   ├── auth.py         # Authentication
│   └── ...
├── extractor/          # C++ document extractor
│   ├── CMakeLists.txt
│   └── src/
│       └── main.cpp
├── static/             # CSS, JS, images
├── templates/          # Jinja2 HTML templates
├── docs/               # Documentation
├── instance/           # SQLite database (gitignored)
└── vault/              # Encrypted files (gitignored)
```

## Key Patterns

### Dynamic Model Assignment

Models are created dynamically at runtime when the database is initialized:

```python
# In app.py
models = create_models(db)
app.Settings = models[0]
app.IndexedFolder = models[1]
# etc.
```

This is intentional — don't try to "fix" type errors related to this pattern.

### Database Sessions

Use Flask app context for database operations:

```python
with app.app_context():
    folder = app.IndexedFolder.get_by_path(path)
```

### Authentication

Most endpoints don't require authentication. Vault endpoints use session-based PIN authentication:

```python
@vault_bp.route("/api/vault/unlock", methods=['POST'])
def unlock_vault():
    pin = request.json.get('pin')
    if verify_pin(pin):
        session['vault_unlocked'] = True
```

### Encryption Flow

```
User PIN → PBKDF2 (100k iterations) → KEK
KEK wraps DEK (per-file encryption key)
DEK encrypts file content with AES-256-GCM
```

## Development Workflow

### Setup
```bash
# Clone and install
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
uv sync

# Copy environment
cp .env.example .env

# Start Meilisearch
meilisearch --master-key dev-key &

# Run app
uv run python app.py
```

### Docker
```bash
# Build and run
docker compose up --build

# View logs
docker compose logs -f

# Rebuild after C++ changes
docker compose build --no-cache
```

### Testing API Changes
```bash
# Health check
curl http://localhost:5000/health

# Search
curl "http://localhost:5000/api/search?q=test"
```

## Documentation Structure

```
docs/
├── README.md                    # Documentation hub
├── getting-started/             # Quick start, installation
├── features/                    # Search, vault, bookmarks, etc.
├── deployment/                   # Docker, production, cloud
├── architecture/                 # Database, extractor, security
├── api/                         # API reference
├── troubleshooting/              # FAQ, common issues
├── contributing/                 # How to contribute
├── community/                    # Code of conduct, support
└── license/                     # AGPL explanation
```

## License

AGPL-3.0-or-later. All source files have SPDX license headers. When adding new files, include:

```python
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC
#
# This file is part of SearchBox.
# SearchBox is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# SearchBox is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with SearchBox. If not, see <https://www.gnu.org/licenses/>.
```

For C++ files:

```cpp
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 SourceBox LLC
//
// This file is part of SearchBox.
// SearchBox is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// SearchBox is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with SearchBox. If not, see <https://www.gnu.org/licenses/>.
```

## Common Tasks

### Add a new API endpoint
1. Create route in appropriate `routes/*.py` file
2. Add business logic in `services/`
3. Document in `docs/api/endpoints.md`
4. Add examples in `docs/api/examples.md`

### Add a new database model
1. Add model class to `models.py` in `create_models()` function
2. Return model from `create_models()`
3. Assign to `app` in `app.py`
4. Document in `docs/architecture/database.md`

### Add a new documentation page
1. Create file in appropriate `docs/` subdirectory
2. Add navigation breadcrumb at top
3. Link from parent index/README.md
4. Update `docs/README.md` if high-level

## Notes

- LSP type errors in `models.py` and `app.py` about model attributes are expected — models are assigned dynamically at runtime
- LSP errors in C++ files about missing headers are expected in the development environment (libraries are only available in Docker)
- Static assets (CSS, JS, HTML) don't need license headers
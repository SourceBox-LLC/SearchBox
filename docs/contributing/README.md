# Contributing to SearchBox

Help make SearchBox better!

> **Navigation:** [Documentation](../README.md) > [Contributing](README.md)

---

## Ways to Contribute

There are many ways to help:

- 🐛 **Report bugs** — Found a bug? Open an issue
- 💡 **Suggest features** — Have an idea? Share it
- 📖 **Improve docs** — Docs can always be better
- 🔧 **Fix bugs** — Check the issue tracker
- ✨ **Add features** — Implement new capabilities
- 🌍 **Translations** — Help translate the UI

---

## Development Setup

### Prerequisites

- Python 3.10+
- uv package manager
- Meilisearch 1.0+
- C++ toolchain (for extractor)

### Local Development

```bash
# Clone the repository
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox

# Install dependencies
uv sync

# Copy environment file
cp .env.example .env

# Edit .env with your settings
nano .env

# Start Meilisearch
meilisearch --master-key your-key &

# Run SearchBox
uv run python app.py
```

### Development Mode

For development with auto-reload:

```bash
uv run flask --app app run --debug
```

---

## Code Style

### Python

We use:

- **Black** for formatting
- **Ruff** for linting
- **mypy** for type checking

```bash
# Format code
uv run black .

# Lint
uv run ruff check .

# Type check
uv run mypy .
```

### Conventions

- **Imports:** stdlib → third-party → local (sorted with isort)
- **Functions:** snake_case
- **Classes:** PascalCase
- **Constants:** UPPER_CASE
- **Max line length:** 88 characters

### Type Hints

Use type hints for all function signatures:

```python
def search_documents(query: str, page: int = 1) -> dict[str, Any]:
    """Search for documents matching query."""
    pass
```

---

## Project Structure

```
SearchBox/
├── app.py              # Flask application
├── config.py           # Configuration
├── models.py           # Database models
├── routes/
│   ├── documents.py    # Document API
│   ├── folders.py      # Folder indexing
│   ├── vault.py        # Vault management
│   ├── meilisearch_routes.py  # Search engine
│   ├── ollama.py       # AI integration
│   ├── qbittorrent.py  # Torrent integration
│   ├── zim.py          # ZIM archives
│   ├── settings.py     # Settings
│   └── pages.py        # Web pages
├── services/
│   ├── document_service.py    # Document processing
│   ├── meilisearch_service.py # Search engine
│   ├── vault_service.py       # Encryption
│   ├── config_service.py      # Configuration
│   └── ...
├── utils/
│   ├── crypto.py       # Cryptography
│   ├── auth.py         # Authentication
│   └── ...
├── extractor/
│   ├── CMakeLists.txt
│   └── src/
│       └── main.cpp    # C++ extractor
├── static/             # CSS, JS, images
├── templates/          # Jinja2 templates
└── docs/               # Documentation
```

---

## Adding a New Feature

### 1. Create a Branch

```bash
git checkout -b feature/my-new-feature
```

### 2. Write the Code

Follow the existing patterns:

**New route (routes/my_feature.py):**
```python
from flask import Blueprint, jsonify

my_feature_bp = Blueprint('my_feature', __name__)

@my_feature_bp.route('/api/my-feature', methods=['GET'])
def get_my_feature():
    """Get my feature data."""
    return jsonify({'status': 'ok', 'data': []})
```

**New service (services/my_feature_service.py):**
```python
"""My feature service."""

def do_something(param: str) -> dict:
    """Do something with param."""
    return {'result': param}
```

### 3. Add Tests

```python
# tests/test_my_feature.py
def test_my_feature():
    response = client.get('/api/my-feature')
    assert response.status_code == 200
    assert response.json['status'] == 'ok'
```

### 4. Update Documentation

- Add endpoint to `docs/api/endpoints.md`
- Update user docs if needed

### 5. Commit Changes

```bash
git add -A
git commit -m "Add my new feature"
```

---

## Pull Request Process

### Before Submitting

- [ ] Code passes linting (`ruff check .`)
- [ ] Code passes type checking (`mypy .`)
- [ ] Code is formatted (`black .`)
- [ ] Tests pass (`pytest`)
- [ ] Documentation updated

### Submit PR

1. Push to your fork
2. Open a Pull Request
3. Fill in the PR template
4. Wait for review

### Review Process

1. Maintainers will review your PR
2. Address any feedback
3. Once approved, maintainers will merge

---

## Testing

### Run Tests

```bash
# Run all tests
uv run pytest

# Run specific test
uv run pytest tests/test_documents.py

# Run with coverage
uv run pytest --cov=routes --cov=services
```

### Write Tests

Tests go in `tests/`:

```python
# tests/test_example.py
import pytest
from mymodule import my_function

def test_my_function():
    result = my_function('input')
    assert result == 'expected'
```

---

## Documentation

### Build Docs

Documentation is in Markdown:

```bash
# Preview locally (if using MkDocs)
mkdocs serve
```

### Update Docs

- User docs in `docs/`
- API docs in `docs/api/`
- Keep it clear and concise

---

## Issue Guidelines

### Bug Reports

Use the bug report template:

- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Environment (OS, Python version, etc.)

### Feature Requests

Use the feature request template:

- Description of the feature
- Use case / problem it solves
- Proposed solution (optional)
- Alternatives considered

---

## License

By contributing, you agree that your contributions will be licensed under the **AGPL-3.0-or-later** license.

See [LICENSE](../LICENSE) for details.

---

## Code of Conduct

Be respectful and inclusive. See [Code of Conduct](../community/code-of-conduct.md).

---

## Contact

- **Issues:** [GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues)
- **Discussions:** [GitHub Discussions](https://github.com/SourceBox-LLC/SearchBox/discussions)

---

**Next:** [Development Setup](setup.md)
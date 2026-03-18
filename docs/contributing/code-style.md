# Code Style Guide

Formatting and linting conventions.

> **Navigation:** [Documentation](../README.md) > [Contributing](README.md) > [Code Style](code-style.md)

---

## Overview

We use automated tools to maintain consistent code style:

- **Black** — Code formatter
- **Ruff** — Linter
- **isort** — Import sorting
- **mypy** — Type checking

---

## Python

### Formatting (Black)

Black auto-formats code to a consistent style:

```bash
# Format all files
uv run black .

# Check without modifying
uv run black --check .
```

**Black style:**
- Line length: 88 characters
- Double quotes for strings
- Trailing commas in multi-line

### Linting (Ruff)

Ruff checks for code issues:

```bash
# Check all files
uv run ruff check .

# Fix issues
uv run ruff check . --fix
```

**Ruff rules enabled:**
- pycodestyle (E, W)
- pyflakes (F)
- isort (I)
- pyupgrade (UP)
- flake8-bugbear (B)
- flake8-comprehensions (C4)
- And more...

### Import Sorting (isort via Ruff)

Imports are sorted automatically:

```python
# Standard library
import os
import sys
from pathlib import Path

# Third-party
from flask import Blueprint, jsonify
import meilisearch

# Local
from config import INDEX_NAME
from services.meilisearch_service import get_meili_client
```

### Type Hints (mypy)

Use type hints for all function signatures:

```python
from typing import Any

def search_documents(
    query: str,
    page: int = 1,
    page_size: int = 20
) -> dict[str, Any]:
    """Search for documents."""
    pass

class Document:
    def __init__(self, doc_id: str, title: str) -> None:
        self.doc_id = doc_id
        self.title = title
```

---

## Naming Conventions

### Functions and Variables

Use `snake_case`:

```python
def get_document_by_id(doc_id: str) -> Document:
    file_path = "/path/to/file"
    page_number = 1
```

### Classes

Use `PascalCase`:

```python
class IndexedFolder:
    pass

class VaultConfig:
    pass
```

### Constants

Use `UPPER_CASE`:

```python
MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 20
INDEX_NAME = "searchbox"
```

### Private Members

Prefix with underscore:

```python
def _internal_function():
    pass

class MyClass:
    def __init__(self):
        self._private_var = 0
```

---

## Documentation

### Docstrings

Use Google-style docstrings:

```python
def search(query: str, page: int = 1) -> dict[str, Any]:
    """Search for documents matching the query.
    
    Args:
        query: Search query string.
        page: Page number (1-indexed).
    
    Returns:
        Dictionary containing search results.
    
    Raises:
        ValueError: If query is empty.
    
    Example:
        >>> results = search("python")
        >>> len(results["hits"])
        10
    """
    pass
```

### Comments

Use comments sparingly, prefer self-documenting code:

```python
# Bad
# Check if user is authenticated
if user.is_authenticated:
    pass

# Good
if user.is_authenticated:
    pass
```

---

## Code Organization

### File Structure

```python
"""Module docstring."""

# Standard library imports
import os
import sys

# Third-party imports
from flask import Blueprint, jsonify

# Local imports
from config import INDEX_NAME
from services.meilisearch_service import get_meili_client

# Constants
MAX_RETRIES = 3

# Blueprint
bp = Blueprint("module", __name__)


# Helper functions
def _internal_helper():
    pass


# Route handlers
@bp.route("/api/example")
def example():
    pass


# Classes
class ExampleClass:
    pass
```

### Line Length

Maximum 88 characters (Black default):

```python
# Use parentheses for line continuation
result = some_function(
    arg1,
    arg2,
    arg3
)

# Or break after operators
if (condition1 and condition2 and
    condition3):
    pass
```

### Blank Lines

- Two blank lines between module-level functions/classes
- One blank line between methods
- No blank lines after docstrings

```python
def function_one():
    pass


def function_two():
    pass


class MyClass:
    def method_one(self):
        pass

    def method_two(self):
        pass
```

---

## Best Practices

### Error Handling

Use specific exceptions:

```python
# Bad
try:
    result = process()
except:
    pass

# Good
try:
    result = process()
except FileNotFoundError:
    logger.error("File not found")
    raise
except ValueError as e:
    logger.error(f"Invalid value: {e}")
    return None
```

### Context Managers

Use `with` for resource management:

```python
# Bad
f = open("file.txt", "r")
content = f.read()
f.close()

# Good
with open("file.txt", "r") as f:
    content = f.read()
```

### List Comprehensions

Use comprehensions for simple operations:

```python
# Bad
results = []
for item in items:
    results.append(item.id)

# Good
results = [item.id for item in items]

# With condition
results = [item.id for item in items if item.active]
```

### F-Strings

Use f-strings for string interpolation:

```python
# Bad
name = "World"
message = "Hello %s" % name

# Good
name = "World"
message = f"Hello {name}"
```

---

## Type Checking

### Run mypy

```bash
# Check all files
uv run mypy .

# Check specific file
uv run mypy routes/documents.py
```

### Ignore Specific Lines

Use `# type: ignore` sparingly:

```python
result = dynamic_function()  # type: ignore
```

### Type Stubs

For third-party libraries without type hints:

```python
# mypy.ini
[mypy]
plugins = sqlalchemy.mypy

[mypy-meilisearch.*]
ignore_missing_imports = True
```

---

## Pre-commit Hooks

Install pre-commit to run checks automatically:

```bash
# Install
uv pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

**.pre-commit-config.yaml:**
```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 23.12.1
    hooks:
      - id: black
  
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix]
  
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
```

---

## Editor Config

**.editorconfig:**
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.py]
indent_style = space
indent_size = 4

[*.{yml,yaml}]
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

---

## Check Command

Run all checks before committing:

```bash
# Format
uv run black .

# Lint
uv run ruff check . --fix

# Type check
uv run mypy .

# Tests
uv run pytest
```

---

## Next Steps

- **[Testing](testing.md)** — Writing tests
- **[PR Process](pr-process.md)** — Submitting changes

---

**Previous:** [Setup](setup.md)  
**Next:** [Testing](testing.md)
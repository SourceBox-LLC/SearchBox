# Testing Guide

How to write and run tests.

> **Navigation:** [Documentation](../README.md) > [Contributing](README.md) > [Testing](testing.md)

---

## Overview

SearchBox uses **pytest** for testing:

- Unit tests for functions and classes
- Integration tests for API endpoints
- Fixtures for common test data

---

## Running Tests

### All Tests

```bash
uv run pytest
```

### Specific File

```bash
uv run pytest tests/test_documents.py
```

### Specific Test

```bash
uv run pytest tests/test_documents.py::test_search
```

### With Coverage

```bash
uv run pytest --cov=routes --cov=services --cov-report=html
```

### Verbose Output

```bash
uv run pytest -v
```

### Debug Mode

```bash
uv run pytest -s --pdb
```

---

## Test Structure

```
tests/
├── conftest.py           # Shared fixtures
├── test_documents.py     # Document API tests
├── test_folders.py       # Folder indexing tests
├── test_vault.py         # Vault tests
├── test_search.py        # Search tests
└── ...
```

---

## Fixtures

### Shared Fixtures (conftest.py)

```python
import pytest
from app import app, db

@pytest.fixture
def client():
    """Create a test client."""
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    
    with app.app_context():
        db.create_all()
        yield app.test_client()
        db.session.remove()
        db.drop_all()

@pytest.fixture
def sample_document():
    """Create a sample document for testing."""
    return {
        'id': 'doc_123',
        'title': 'Test Document',
        'content': 'This is test content for searching.',
        'file_type': 'pdf',
        'file_path': '/test/document.pdf'
    }
```

### Using Fixtures

```python
def test_search(client, sample_document):
    """Test search functionality."""
    # Insert sample document
    client.post('/api/documents', json=sample_document)
    
    # Search
    response = client.get('/api/search?q=test')
    
    assert response.status_code == 200
    assert len(response.json['hits']) == 1
```

---

## Writing Tests

### Unit Tests

Test individual functions:

```python
# tests/test_utils.py
from utils.crypto import generate_dek, wrap_dek, unwrap_dek

def test_generate_dek():
    """Test DEK generation."""
    dek = generate_dek()
    assert len(dek) == 32  # 256 bits
    assert isinstance(dek, bytes)

def test_wrap_unwrap_dek():
    """Test DEK wrapping and unwrapping."""
    dek = generate_dek()
    kek = generate_dek()  # Using DEK as KEK for test
    
    wrapped = wrap_dek(kek, dek)
    unwrapped = unwrap_dek(kek, wrapped)
    
    assert dek == unwrapped
```

### Integration Tests

Test API endpoints:

```python
# tests/test_documents.py
def test_get_document(client):
    """Test getting a document by ID."""
    response = client.get('/api/documents/doc_123')
    
    assert response.status_code == 200
    assert response.json['id'] == 'doc_123'

def test_upload_document(client):
    """Test uploading a document."""
    data = {
        'file': (io.BytesIO(b'test content'), 'test.pdf')
    }
    
    response = client.post(
        '/api/documents/upload',
        content_type='multipart/form-data',
        data=data
    )
    
    assert response.status_code == 200
    assert 'doc_id' in response.json
```

### Parameterized Tests

Test multiple inputs:

```python
import pytest

@pytest.mark.parametrize("query,expected_count", [
    ("python", 10),
    ("javascript", 5),
    ("nonexistent", 0),
])
def test_search_queries(client, query, expected_count):
    """Test search with different queries."""
    response = client.get(f'/api/search?q={query}')
    assert len(response.json['hits']) == expected_count
```

### Async Tests

Test async functions:

```python
import pytest
import asyncio

@pytest.mark.asyncio
async def test_async_indexing():
    """Test async folder indexing."""
    from services.indexer import index_folder
    
    result = await index_folder('/test/folder')
    assert result['status'] == 'completed'
```

---

## Test Organization

### Arrange-Act-Assert Pattern

```python
def test_bookmark_creation(client):
    # Arrange
    doc_id = 'doc_123'
    bookmark_data = {
        'slot': 1,
        'doc_id': doc_id,
        'title': 'Important Doc',
        'file_type': 'pdf'
    }
    
    # Act
    response = client.post('/api/bookmarks', json=bookmark_data)
    
    # Assert
    assert response.status_code == 200
    assert response.json['status'] == 'ok'
```

### Test Classes

Group related tests:

```python
class TestVault:
    """Tests for vault functionality."""
    
    def test_setup(self, client):
        """Test vault setup."""
        response = client.post('/api/vault/setup', json={'pin': '1234'})
        assert response.status_code == 200
    
    def test_unlock(self, client):
        """Test vault unlock."""
        # Setup first
        client.post('/api/vault/setup', json={'pin': '1234'})
        
        # Test unlock
        response = client.post('/api/vault/unlock', json={'pin': '1234'})
        assert response.status_code == 200
    
    def test_wrong_pin(self, client):
        """Test wrong PIN."""
        client.post('/api/vault/setup', json={'pin': '1234'})
        
        response = client.post('/api/vault/unlock', json={'pin': '0000'})
        assert response.status_code == 401
```

---

## Mocking

### Mock External Services

```python
from unittest.mock import patch, MagicMock

def test_meilisearch_status(client):
    """Test Meilisearch status check."""
    with patch('services.meilisearch_service.get_meili_client') as mock:
        mock.return_value.get_stats.return_value = {
            'databaseSize': 1000000
        }
        
        response = client.get('/api/meilisearch/status')
        
        assert response.status_code == 200
        assert response.json['running'] is True
```

### Mock File Operations

```python
from unittest.mock import patch

def test_file_upload(client, tmp_path):
    """Test file upload with temporary file."""
    # Create temp file
    test_file = tmp_path / "test.pdf"
    test_file.write_bytes(b"test content")
    
    with open(test_file, 'rb') as f:
        response = client.post(
            '/api/documents/upload',
            data={'file': f}
        )
    
    assert response.status_code == 200
```

---

## Test Data

### Factory Pattern

Create test data programmatically:

```python
# tests/factories.py
class DocumentFactory:
    @staticmethod
    def create(**kwargs):
        defaults = {
            'id': 'doc_123',
            'title': 'Test Document',
            'content': 'Test content',
            'file_type': 'pdf',
            'file_path': '/test/test.pdf'
        }
        defaults.update(kwargs)
        return defaults

# Usage
doc = DocumentFactory.create(title='Custom Title')
```

### Test Files Directory

Store test files in `tests/fixtures/`:

```
tests/
├── fixtures/
│   ├── sample.pdf
│   ├── sample.docx
│   └── sample.txt
└── test_documents.py
```

```python
import os

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')

def test_pdf_upload(client):
    """Test PDF upload."""
    with open(os.path.join(FIXTURES_DIR, 'sample.pdf'), 'rb') as f:
        response = client.post('/api/documents/upload', data={'file': f})
    
    assert response.status_code == 200
```

---

## Coverage

### Generate Coverage Report

```bash
# Terminal report
uv run pytest --cov=.

# HTML report
uv run pytest --cov=. --cov-report=html
# Open htmlcov/index.html
```

### Coverage Goals

- Aim for **80%+ coverage** on new code
- Cover all critical paths
- Don't obsess over 100%

### Exclude from Coverage

```python
# tests/conftest.py
def pytest_configure(config):
    config.addiniv_line_line(
        "markers", "no_cover: mark test to exclude from coverage"
    )

# Run without coverage
# pytest -m "not no_cover"
```

---

## Best Practices

### 1. Test Behavior, Not Implementation

```python
# Bad
def test_internal_state():
    assert obj._internal_counter == 5

# Good
def test_output():
    result = obj.process()
    assert result == expected_output
```

### 2. One Assertion per Test

```python
# Bad
def test_everything():
    assert a == 1
    assert b == 2
    assert c == 3

# Good
def test_a():
    assert a == 1

def test_b():
    assert b == 2
```

### 3. Use Descriptive Names

```python
# Bad
def test_error():
    pass

# Good
def test_upload_returns_404_for_nonexistent_document():
    pass
```

### 4. Isolate Tests

```python
def test_1(client):
    """Independent test."""
    response = client.get('/api/documents')
    assert response.status_code == 200

def test_2(client):
    """Another independent test."""
    response = client.post('/api/documents', json={'title': 'New'})
    assert response.status_code == 200
```

---

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install uv
        uses: astral-sh/setup-uv@v3
      
      - name: Install dependencies
        run: uv sync
      
      - name: Run tests
        run: uv run pytest --cov=.
```

---

## Next Steps

- **[PR Process](pr-process.md)** — Submitting changes
- **[Architecture](../architecture/overview.md)** — System design

---

**Previous:** [Code Style](code-style.md)  
**Next:** [PR Process](pr-process.md)
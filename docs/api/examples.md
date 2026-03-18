# API Examples

Code examples for common tasks.

> **Navigation:** [Documentation](../README.md) > [API Reference](README.md) > [Examples](examples.md)

---

## Authentication

Most endpoints don't require authentication. Vault operations require a PIN.

```bash
# Unlock vault (stores session cookie)
curl -X POST http://localhost:5000/api/vault/unlock \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234"}'
```

---

## Search Examples

### Basic Search (cURL)

```bash
curl "http://localhost:5000/api/search?q=machine+learning"
```

### Filtered Search (Python)

```python
import requests

response = requests.get(
    "http://localhost:5000/api/search",
    params={
        "q": "python",
        "filters": "file_type=pdf",
        "page": 1,
        "page_size": 20
    }
)

results = response.json()
for hit in results["hits"]:
    print(f"{hit['title']} (score: {hit.get('score', 0):.2f})")
```

### Advanced Filters (JavaScript)

```javascript
const params = new URLSearchParams({
    q: "database",
    filters: "file_type IN [pdf, docx] AND created_at > 1672531200",
    page_size: 50
});

const response = await fetch(`/api/search?${params}`);
const results = await response.json();

results.hits.forEach(hit => {
    console.log(`${hit.title} - ${hit.file_type}`);
});
```

### Paginated Results (Python)

```python
def get_all_results(query, page_size=100):
    all_hits = []
    page = 1
    
    while True:
        response = requests.get(
            "http://localhost:5000/api/search",
            params={"q": query, "page": page, "page_size": page_size}
        )
        data = response.json()
        all_hits.extend(data["hits"])
        
        if len(data["hits"]) < page_size:
            break
        page += 1
    
    return all_hits

all_results = get_all_results("tutorial")
print(f"Found {len(all_results)} documents")
```

---

## Document Examples

### Upload Document (cURL)

```bash
curl -X POST http://localhost:5000/api/documents/upload \
  -F "file=@report.pdf"
```

### Upload Document (Python)

```python
import requests

with open("report.pdf", "rb") as f:
    response = requests.post(
        "http://localhost:5000/api/documents/upload",
        files={"file": f}
    )

doc_id = response.json()["doc_id"]
print(f"Uploaded: {doc_id}")
```

### Upload to Vault (Python)

```python
import requests

# First unlock vault
requests.post(
    "http://localhost:5000/api/vault/unlock",
    json={"pin": "1234"}
)

# Upload encrypted file
with open("secret.pdf", "rb") as f:
    response = requests.post(
        "http://localhost:5000/api/vault/upload",
        files={"file": f}
    )

print(response.json())
```

### Download Document (Python)

```python
import requests

response = requests.get(
    "http://localhost:5000/api/documents/doc_123/download",
    stream=True
)

with open("downloaded.pdf", "wb") as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)
```

### Download from Vault (Python)

```python
import requests

# Unlock vault first
requests.post(
    "http://localhost:5000/api/vault/unlock",
    json={"pin": "1234"}
)

# Download with session cookie
response = requests.get(
    "http://localhost:5000/api/documents/doc_456/download",
    stream=True
)

with open("decrypted.pdf", "wb") as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)
```

### Get Document Metadata (JavaScript)

```javascript
const docId = "doc_123";
const response = await fetch(`/api/documents/${docId}`);
const doc = await response.json();

console.log(`Title: ${doc.title}`);
console.log(`Type: ${doc.file_type}`);
console.log(`Size: ${(doc.size / 1024).toFixed(2)} KB`);
```

### Get Thumbnail (HTML)

```html
<img 
  src="/api/documents/doc_123/thumbnail" 
  alt="Document thumbnail"
  width="200"
/>
```

---

## Folder Indexing Examples

### Add and Index Folder (Python)

```python
import requests
import time

# Add folder
response = requests.post(
    "http://localhost:5000/api/folders/add",
    json={"folder_path": "/home/user/Documents"}
)

folder_id = response.json()["folder_id"]

# Start indexing
response = requests.post(
    "http://localhost:5000/api/folders/index",
    json={"folder_path": "/home/user/Documents"}
)
job_id = response.json()["job_id"]

# Poll for status
while True:
    status = requests.get(
        f"http://localhost:5000/api/folders/status/{job_id}"
    ).json()
    
    print(f"Progress: {status['processed']}/{status['total']}")
    
    if status["status"] in ["completed", "failed"]:
        break
    
    time.sleep(2)

print(f"Indexed {status['indexed']} documents")
```

### List All Folders (JavaScript)

```javascript
const response = await fetch('/api/folders');
const data = await response.json();

data.folders.forEach(folder => {
    console.log(`${folder.folder_name} - ${folder.folder_path}`);
    console.log(`  Last synced: ${folder.last_synced}`);
});
```

---

## Vault Examples

### Setup Vault (Python)

```python
import requests

# Check if vault is set up
status = requests.get("http://localhost:5000/api/vault/status").json()

if not status["pin_set"]:
    # Set up new PIN
    requests.post(
        "http://localhost:5000/api/vault/setup",
        json={"pin": "1234"}
    )
    print("Vault PIN set")
```

### Change PIN (Python)

```python
import requests

# Unlock first
requests.post(
    "http://localhost:5000/api/vault/unlock",
    json={"pin": "1234"}
)

# Change PIN
requests.post(
    "http://localhost:5000/api/vault/change",
    json={"old_pin": "1234", "new_pin": "5678"}
)
print("PIN changed successfully")
```

---

## Bookmark Examples

### Create Bookmark (Python)

```python
import requests

# Add to bookmark slot 1
requests.post(
    "http://localhost:5000/api/bookmarks",
    json={
        "slot": 1,
        "doc_id": "doc_123",
        "title": "Important Document",
        "file_type": "pdf"
    }
)
print("Bookmark added to slot 1")
```

### Get All Bookmarks (JavaScript)

```javascript
const response = await fetch('/api/bookmarks');
const data = await response.json();

const bookmarks = data.bookmarks.map(b => ({
    slot: b.slot,
    title: b.title,
    type: b.file_type
}));

console.table(bookmarks);
```

---

## Ollama (AI Summaries) Examples

### Generate Summary (Python)

```python
import requests

# Get summary for a document
response = requests.post(
    "http://localhost:5000/api/ollama/summarize",
    json={
        "doc_id": "doc_123",
        "model": "llama2"
    }
)

summary = response.json()["summary"]
print(f"Summary: {summary}")
```

### Check Ollama Status (JavaScript)

```javascript
async function checkOllama() {
    const response = await fetch('/api/ollama/status');
    const status = await response.json();
    
    if (status.running) {
        console.log('Ollama is running');
        console.log('Available models:', status.models);
    } else {
        console.log('Ollama is not running');
    }
}
```

---

## Settings Examples

### Get/Set Settings (Python)

```python
import requests

# Get all settings
settings = requests.get("http://localhost:5000/api/settings").json()
print(f"Current theme: {settings['theme']}")

# Update setting
requests.put(
    "http://localhost:5000/api/settings/theme",
    json={"value": "dark"}
)
print("Theme updated to dark")
```

---

## Error Handling Example

### Python with Error Handling

```python
import requests
from requests.exceptions import RequestException

def search_documents(query):
    try:
        response = requests.get(
            "http://localhost:5000/api/search",
            params={"q": query},
            timeout=10
        )
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("status") == "error":
            print(f"API Error: {data['error']}")
            return None
        
        return data["hits"]
    
    except RequestException as e:
        print(f"Request failed: {e}")
        return None
    except ValueError as e:
        print(f"Invalid JSON: {e}")
        return None

results = search_documents("python")
if results:
    print(f"Found {len(results)} results")
```

### JavaScript with Error Handling

```javascript
async function searchDocuments(query) {
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'error') {
            console.error('API Error:', data.error);
            return null;
        }
        
        return data.hits;
    } catch (error) {
        console.error('Request failed:', error);
        return null;
    }
}

const results = await searchDocuments('javascript');
console.log(`Found ${results?.length ?? 0} results`);
```

---

## Rate Limiting

Vault endpoints have rate limiting. Handle 429 responses:

```python
import requests
import time

def unlock_vault(pin, max_retries=3):
    for attempt in range(max_retries):
        response = requests.post(
            "http://localhost:5000/api/vault/unlock",
            json={"pin": pin}
        )
        
        if response.status_code == 200:
            return True
        
        if response.status_code == 429:
            # Rate limited
            retry_after = int(response.headers.get("Retry-After", 60))
            print(f"Rate limited. Retry in {retry_after} seconds.")
            time.sleep(retry_after)
            continue
        
        if response.status_code == 401:
            print("Incorrect PIN")
            return False
    
    return False
```

---

## Next Steps

- **[Architecture](../architecture/overview.md)** — System design
- **[Troubleshooting](../troubleshooting/README.md)** — Common issues
- **[Contributing](../contributing/README.md)** — Help improve SearchBox

---

**Previous:** [Endpoints](endpoints.md)
# Extractor Architecture

How SearchBox processes documents for indexing.

> **Navigation:** [Documentation](../README.md) > [Architecture](overview.md) > [Extractor](extractor.md)

---

## Overview

The extractor is a **C++ document processor** that extracts text from various file formats:

- 🚀 **Fast** — Native code, multi-threaded
- 📄 **Multi-format** — PDF, DOCX, EPUB, and more
- 🔍 **Accurate** — Preserves document structure
- 💾 **Memory-efficient** — Streams large files

**Location:** `extractor/src/main.cpp`

**Binary:** `doc_extractor` (compiled into Docker image)

---

## Supported Formats

| Format | Extension | Library |
|--------|-----------|---------|
| **PDF** | `.pdf` | MuPDF |
| **Word** | `.docx` | libzip + pugixml |
| **PowerPoint** | `.pptx` | libzip + pugixml |
| **Excel** | `.xlsx` | libzip + pugixml |
| **EPUB** | `.epub` | libzip + pugixml |
| **HTML** | `.html`, `.htm` | Gumbo |
| **Text** | `.txt`, `.md` | Native |
| **ZIM** | `.zim` | libzim |
| **SVG** | `.svg` | librsvg |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Python Application                       │
│  (services/indexer.py)                                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  File detected → Extract text → Send to Meilisearch     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                           │                                    │
│                           ▼                                    │
│               subprocess.run([doc_extractor, ...])             │
│                           │                                    │
└───────────────────────────┼────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    C++ Extractor                              │
│                    (doc_extractor)                            │
│                                                               │
│  Usage: doc_extractor <extract|extract_meta> <file_path>      │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  File Type      │  │  Format-Specific│  │  Text       │  │
│  │  Detection      │─▶│  Extraction     │─▶│  Output     │  │
│  │  (by extension) │  │  Libraries      │  │  (stdout)   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Extraction Process

### Step 1: File Detection

The extractor determines file type by extension:

```cpp
std::string ext = get_extension(filepath);
ext = to_lower(ext);

if (ext == ".pdf") {
    return extract_pdf(filepath);
} else if (ext == ".docx" || ext == ".pptx" || ext == ".xlsx") {
    return extract_office(filepath);
} else if (ext == ".epub") {
    return extract_epub(filepath);
}
// ... more formats
```

### Step 2: Extraction

Each format uses specialized libraries:

#### PDF (MuPDF)

```cpp
std::string extract_pdf(const std::string& path) {
    fz_context* ctx = fz_create_context();
    fz_document* doc = fz_open_document(ctx, path.c_str());
    
    // Get page count
    int pages = fz_count_pages(ctx, doc);
    
    std::string text;
    for (int i = 0; i < pages; i++) {
        fz_page* page = fz_load_page(ctx, doc, i);
        text += extract_page_text(ctx, page);
        fz_drop_page(ctx, page);
    }
    
    fz_drop_document(ctx, doc);
    fz_drop_context(ctx);
    return text;
}
```

#### Office Documents (libzip + pugixml)

```cpp
std::string extract_docx(const std::string& path) {
    // Open as ZIP
    zip_t* archive = zip_open(path.c_str(), ZIP_RDONLY, nullptr);
    
    // Extract word/document.xml
    zip_file_t* file = zip_fopen(archive, "word/document.xml");
    
    // Parse XML
    pugi::xml_document doc;
    doc.load(file);
    
    // Extract text from <w:t> elements
    std::string text;
    for (auto node : doc.select_nodes("//w:t")) {
        text += node.node().value();
    }
    
    return text;
}
```

#### ZIM Archives (libzim)

```cpp
std::string extract_zim(const std::string& path) {
    zim::Archive archive(path);
    
    std::string text;
    for (auto& entry : archive.iterByPath()) {
        if (entry.isArticle()) {
            auto item = entry.getItem();
            text += item.getData();
        }
    }
    
    return text;
}
```

### Step 3: Output

Extracted text is written to stdout as JSON:

```json
{
  "title": "Document Title",
  "text": "Full document text...",
  "pages": 25,
  "author": "Author Name",
  "created": "2024-01-15"
}
```

---

## Python Integration

### Calling the Extractor

From `services/indexer.py`:

```python
def extract_text(file_path: str) -> dict:
    """Extract text from document using C++ extractor."""
    try:
        result = subprocess.run(
            ["doc_extractor", "extract", file_path],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode != 0:
            logger.error(f"Extractor failed: {result.stderr}")
            return None
            
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        logger.error("Extractor timed out")
        return None
    except json.JSONDecodeError:
        logger.error("Invalid extractor output")
        return None
```

### Metadata Extraction

```python
def extract_metadata(file_path: str) -> dict:
    """Extract only metadata (faster)."""
    result = subprocess.run(
        ["doc_extractor", "extract_meta", file_path],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)
```

---

## Build Process

### Docker Multi-Stage Build

From `Dockerfile`:

```dockerfile
# Stage 1: Build C++ extractor
FROM debian:bookworm AS cpp-builder

RUN apt-get update && apt-get install -y \
    build-essential cmake \
    libmupdf-dev libmujs-dev libgumbo-dev \
    libjbig2dec-dev libharfbuzz-dev libfreetype-dev \
    libopenjp2-7-dev libjpeg-dev zlib1g-dev \
    libzip-dev libpugixml-dev libzim-dev \
    librsvg2-dev libcairo2-dev

WORKDIR /build
COPY extractor/CMakeLists.txt .
COPY extractor/src/ src/
RUN mkdir out && cd out && cmake .. && make -j$(nproc)

# Stage 2: Runtime
FROM ghcr.io/astral-sh/uv:python3.10-bookworm-slim

# Copy compiled binary
COPY --from=cpp-builder /build/out/doc_extractor /usr/local/bin/
```

### Local Build

```bash
cd extractor
mkdir build && cd build
cmake ..
make -j$(nproc)
```

**Dependencies (Ubuntu):**
```bash
sudo apt install build-essential cmake \
    libmupdf-dev libmujs-dev libgumbo-dev \
    libjbig2dec-dev libharfbuzz-dev libfreetype-dev \
    libopenjp2-7-dev libjpeg-dev zlib1g-dev \
    libzip-dev libpugixml-dev libzim-dev \
    librsvg2-dev libcairo2-dev
```

---

## Performance

### Benchmarks

| Format | File Size | Time | Memory |
|--------|-----------|------|--------|
| PDF | 10 MB | 500ms | 50 MB |
| DOCX | 5 MB | 100ms | 20 MB |
| EPUB | 20 MB | 200ms | 30 MB |
| ZIM | 1 GB | 30s | 200 MB |

### Optimization Techniques

1. **Streaming** — Process files in chunks, don't load entirely
2. **Thread Pool** — Multi-threaded extraction for batch processing
3. **Caching** — Metadata cached for fast lookups
4. **Timeout Limits** — Prevent hanging on corrupt files

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ENOENT` | File not found | Check path exists |
| `Corrupt PDF` | Damaged PDF | Skip file, log warning |
| `OOM` | File too large | Increase memory limit |
| `Timeout` | Processing stuck | Kill process, continue |

### Python Error Handling

```python
def safe_extract(file_path: str) -> dict:
    """Extract with error handling."""
    try:
        return extract_text(file_path)
    except subprocess.TimeoutExpired:
        logger.warning(f"Extractor timeout: {file_path}")
        return {"text": "", "error": "timeout"}
    except Exception as e:
        logger.error(f"Extractor error: {e}")
        return {"text": "", "error": str(e)}
```

---

## Extending the Extractor

### Adding a New Format

1. **Add library to Dockerfile:**
   ```dockerfile
   RUN apt-get install -y libnewformat-dev
   ```

2. **Add to CMakeLists.txt:**
   ```cmake
   target_link_libraries(doc_extractor newformat)
   ```

3. **Implement extraction function:**
   ```cpp
   std::string extract_newformat(const std::string& path) {
       // Load and parse file
       // Return extracted text
   }
   ```

4. **Register in main.cpp:**
   ```cpp
   } else if (ext == ".newformat") {
       return extract_newformat(filepath);
   }
   ```

---

## Testing

### Manual Testing

```bash
# Extract text
./doc_extractor extract /path/to/document.pdf

# Extract metadata
./doc_extractor extract_meta /path/to/document.pdf
```

### Integration Test

```python
def test_extraction():
    result = extract_text("test.pdf")
    assert result is not None
    assert "expected text" in result["text"]
    assert result["pages"] > 0
```

---

## Next Steps

- **[Database Architecture](database.md)** — Data storage
- **[Security Architecture](security.md)** — Security design
- **[Folder Indexing](../features/folder-indexing.md)** — How folders are indexed

---

**Previous:** [Database Architecture](database.md)  
**Next:** [Security Architecture](security.md)
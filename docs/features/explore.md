# Explore View

Visual masonry grid to browse all indexed documents.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [Explore View](explore.md)

---

## Overview

The **Explore page** (`/explore`) provides a **visual way to browse all indexed documents**:

- 🖼️ **Masonry grid** — Cards sized to natural image dimensions
- 📂 **Filter by type** — Narrow by file type (PDF, DOCX, etc.)
- 📊 **Sort options** — By recent, name, or file size
- ♾️ **Infinite scroll** — Loads 40 documents at a time
- 🏷️ **Source badges** — Show origin (folder, vault, torrent, ZIM)

---

## Access Explore

Navigate to **http://localhost:5000/explore**

Or click **Explore** in the navigation header.

---

## Interface

### Masonry Grid

Documents displayed as cards:
- **Thumbnail** — Representative image from document
- **File type badge** — PDF, DOCX, TXT, etc.
- **Document title** — Filename or extracted title
- **Source badge** — Origin (folder, vault, qBittorrent, ZIM)

### Filter Pills

Filter by file type:
- **All** — Show all documents
- **PDF** — PDFs only
- **DOCX** — Word documents
- **TXT** — Text files
- **MD** — Markdown files
- **Images** — Image files

### Sort Options

- **Recent** — Most recently indexed first
- **Name** — Alphabetical by filename
- **Size** — Largest files first

### Infinite Scroll

- Loads 40 documents initially
- Loads more on scroll
- Shows loading indicator
- Preserves scroll position

---

## How It Works

### Thumbnail Selection

Each document gets one thumbnail:
1. First extracted image from document
2. OR generated preview (PDFs)
3. OR file type icon

### Masonry Layout

Cards arranged in columns:
- Natural aspect ratio preserved
- 3-4 columns on desktop
- 2 columns on tablet
- 1 column on mobile

### Infinite Scroll

- Intersection Observer API
- Loads when user scrolls near bottom
- Shows spinner while loading
- Stops when all documents loaded

---

## Actions

### Click Document

Click any card to open document viewer:
- View document details
- Read extracted text
- Download original file
- Add to bookmarks

### Filtering

1. Click filter pill (PDF, DOCX, etc.)
2. Grid updates immediately
3. Scroll to see filtered results
4. Click "All" to clear filter

### Sorting

1. Click sort dropdown
2. Select sort option (Recent, Name, Size)
3. Grid reorders
4. Preserve scroll position

---

## Performance

### Optimization

- **Lazy loading** — Images load on scroll
- **Virtual scrolling** — Only render visible area
- **Thumbnail caching** — Cached in database
- **Batch loading** — 40 documents per request

### Memory Usage

| Documents | RAM Usage |
|-----------|-----------|
| 100 | ~50MB |
| 1,000 | ~150MB |
| 10,000 | ~300MB |
| 100,000 | ~500MB |

---

## Troubleshooting

### Grid not loading

**Cause:** No documents indexed

**Solution:**
- Index a folder first
- Check document count in Settings
- Verify Meilisearch is running

### Thumbnails missing

**Cause:** Thumbnail generation failed

**Solution:**
- Re-index folder
- Check C++ extractor logs
- Verify images are valid

### Infinite scroll not working

**Cause:** JavaScript error

**Solution:**
- Check browser console
- Disable browser extensions
- Clear cache and reload

---

## API Reference

### Get Explore Page

```bash
GET /explore
```

Returns HTML page.

### Get Explore Data

```bash
GET /api/explore
  ?offset=0
  &limit=40
  &type=pdf
  &sort=recent
```

**Response:**
```json
{
  "documents": [
    {
      "id": "doc_123",
      "title": "Quarterly Report.pdf",
      "file_type": "pdf",
      "thumbnail": "/api/thumbnail/doc_123",
      "source": "folder",
      "size": 2400000,
      "indexed_at": "2026-03-18T00:00:00Z"
    }
  ],
  "total": 500,
  "has_more": true
}
```

---

## Related Features

- **[Search](search.md)** — Search documents
- **[Bookmarks](bookmarks.md)** — Quick access
- **[Vault](vault.md)** — Encrypted storage

---

**Previous:** [Folder Indexing](folder-indexing.md)  
**Next:** [qBittorrent Integration](qbittorrent.md)
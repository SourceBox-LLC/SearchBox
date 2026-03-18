# Folder Indexing

Background folder processing with real-time progress tracking.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [Folder Indexing](folder-indexing.md)

---

## Overview

Folder indexing allows SearchBox to **automatically process and index documents** from selected folders:

- 📁 **Automatic monitoring** — Index entire folder hierarchies
- ⏱️ **Background processing** — Doesn't block the UI
- 📊 **Real-time progress** — See indexing status live
- 🔄 **Sync & re-index** — Update indexes when files change
- 🚀 **Adaptive batching** — Optimized for large folders

---

## How It Works

### Indexing Process

```
1. Select folder
   ↓
2. Scan directory
   ↓
3. Detect file types
   ↓
4. Extract text & images
   ↓
5. Generate thumbnails
   ↓
6. Index in Meilisearch
   ↓
7. Store metadata
```

### Background Processing

Indexing runs in a background thread:
- UI remains responsive
- Progress updates via WebSocket/polling
- Can cancel mid-indexing
- Resumes on restart if interrupted

### Adaptive Batching

Large folders are processed in adaptive batches:
- Batch size adjusts based on memory usage
- Smaller batches when memory is low
- Larger batches when memory is available
- Defers image processing under memory pressure

---

## Index a Folder

### Step 1: Navigate to Index Folder

1. Open **http://localhost:5000**
2. Click **Index Folder** tab

### Step 2: Enter Folder Path

Enter the path to the folder you want to index.

**Windows:**
```
C:/Users/YourName/Documents
D:/Projects
```

**Linux/macOS:**
```
/home/yourname/Documents
/Users/yourname/Projects
```

### Step 3: Click Index Folder

Click **Index Folder** button.

### Step 4: Watch Progress

A progress bar shows:
- **Files found** — Total files in folder
- **Processed** — Files indexed so far
- **ETA** — Estimated time remaining
- **Current file** — Currently processing

### Step 5: Wait for Completion

Indexing is complete when:
- Progress reaches 100%
- "Indexing complete" message appears
- Document count updates in UI

---

## Supported File Types

### Documents

| Type | Extensions | Extraction |
|------|------------|------------|
| PDF | `.pdf` | Full text + images |
| Word | `.docx`, `.doc` | Full text |
| Excel | `.xlsx`, `.xls` | Full text |
| PowerPoint | `.pptx`, `.ppt` | Full text |
| OpenDocument | `.odt`, `.ods` | Full text |

### Text

| Type | Extensions | Extraction |
|------|------------|------------|
| Plain text | `.txt` | Full text |
| Markdown | `.md` | Full text + formatting |
| RTF | `.rtf` | Full text |
| CSV | `.csv` | Full text |

### Web

| Type | Extensions | Extraction |
|------|------------|------------|
| HTML | `.html`, `.htm` | Full text |
| XML | `.xml` | Full text |

### Images

| Type | Extensions | Extraction |
|------|------------|------------|
| JPEG | `.jpg`, `.jpeg` | Metadata + OCR |
| PNG | `.png` | Metadata + OCR |
| GIF | `.gif` | Metadata |
| WebP | `.webp` | Metadata + OCR |
| SVG | `.svg` | Rasterized + OCR |
| BMP | `.bmp` | Metadata |

### Archives

| Type | Extensions | Extraction |
|------|------------|------------|
| ZIM | `.zim` | Wikipedia archives |
| ZIP | `.zip` | Extracts and indexes contents |

---

## Manage Indexed Folders

### View Indexed Folders

Navigate to **Settings** → **Indexed Folders**

Shows:
- Folder path
- Folder name
- Last sync time
- Status (active/inactive)

### Sync Folders

**Re-index when files change:**
1. Settings → Indexed Folders
2. Click **Sync Folders**
3. Wait for completion

**Auto-sync:** Not available (manual sync required)

### Remove Folder

1. Settings → Indexed Folders
2. Click **Remove** next to folder
3. Confirm removal
4. Documents removed from index

**Note:** Doesn't delete files, just removes from index.

---

## Progress Tracking

### Progress Bar

Shows during indexing:
```
Indexing: 125 / 500 files
Progress: ████████░░░░ 25%
ETA: 3 minutes
Current: document_25.pdf
```

### Status Messages

| Status | Meaning |
|--------|---------|
| **Starting** | Beginning indexing process |
| **Scanning** | Counting files in folder |
| **Extracting** | Processing document content |
| **Indexing** | Adding to Meilisearch |
| **Generating thumbnails** | Creating image previews |
| **Complete** | All files processed |
| **Error** | Processing failed |

### Cancel Indexing

Click **Cancel** button to stop mid-process.

**What happens:**
- Current file finishes
- Processed files remain indexed
- Can resume later

---

## Troubleshooting

### "Invalid folder path"

**Cause:** Folder not accessible

**Solution:**
- Verify path exists
- Check Docker volume mounts
- Ensure read permissions

**Docker users:** Add volume mount in `docker-compose.yml`:
```yaml
volumes:
  - /path/to/folder:/data:ro
```

### "Permission denied"

**Cause:** SearchBox can't read folder

**Solution:**
```bash
# Linux/macOS
chmod -R +r /path/to/folder

# Or run as user with permissions
```

### Indexing is slow

**Cause:** Large folder or slow storage

**Solution:**
- Index subfolders separately
- Use SSD storage
- Increase batch size (advanced)
- Close other applications

### Files not appearing in search

**Cause:**
- Indexing not complete
- Files not in indexable format
- Search query too specific

**Solution:**
- Wait for indexing to complete
- Check document count in Settings
- Try broader search query
- Check supported file types

### Out of memory during indexing

**Cause:** Folder too large

**Solution:**
- Index subfolders separately
- Increase Docker memory limit
- Use adaptive resource monitor (built-in)

---

## Performance

### Optimization Tips

1. **Index subfolders separately** — Better for progress tracking
2. **Use SSD storage** — Faster file reading
3. **Close other apps** — More RAM for indexing
4. **Batch indexing** — Let complete before new indexing

### Resource Usage

| Phase | CPU | RAM | Disk |
|-------|-----|-----|------|
| Scanning | Low | Low | Low |
| Extracting | High | Medium | Medium |
| Indexing | Medium | High | High |
| Thumbnails | Medium | Medium | High |

### Estimated Time

| Files | Type | Estimate |
|-------|------|----------|
| 100 | PDF | ~30 seconds |
| 1,000 | Mixed | ~5 minutes |
| 10,000 | Mixed | ~50 minutes |
| 100,000 | Mixed | ~8 hours |

**Note:** Times vary by file size and system specs.

---

## API Reference

### Index Folder

```bash
POST /api/folder/index
Content-Type: application/json

{
  "folder_path": "/home/user/Documents"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Indexing started",
  "job_id": "abc123"
}
```

### Get Index Status

```bash
GET /api/folder/index/status
```

**Response:**
```json
{
  "status": "indexing",
  "files_found": 1250,
  "files_processed": 340,
  "progress_percent": 27,
  "eta_seconds": 180,
  "current_file": "document_340.pdf"
}
```

### List Indexed Folders

```bash
GET /api/folders
```

**Response:**
```json
{
  "folders": [
    {
      "id": 1,
      "folder_path": "/home/user/Documents",
      "folder_name": "Documents",
      "last_synced": "2026-03-18T00:00:00Z",
      "is_active": true
    }
  ]
}
```

### Sync All Folders

```bash
POST /api/folders/sync
```

### Remove Folder

```bash
POST /api/folder/remove
Content-Type: application/json

{
  "folder_path": "/home/user/Documents"
}
```

---

## Best Practices

1. **Start small** — Index small folders first
2. **Monitor progress** — Watch for errors
3. **Sync regularly** — Keep index updated
4. **Remove unused** — Clean up old folders
5. **Separate concerns** — Don't index system folders

---

## Related Features

- **[Search](search.md)** — Search indexed documents
- **[Explore](explore.md)** — Visual browsing
- **[Bookmarks](bookmarks.md)** — Quick access

---

**Previous:** [AI Summaries](ai-summaries.md)  
**Next:** [qBittorrent Integration](qbittorrent.md)
# ZIM Archives

Index offline Wikipedia and other ZIM archives.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [ZIM Archives](zim.md)

---

## Overview

SearchBox can **index ZIM archives** — offline knowledge bases like Wikipedia:

- 📚 **Massive archives** — Index 16M+ articles from Wikipedia
- ⚡ **Parallel processing** — Multi-threaded extraction
- 🖼️ **Thumbnail generation** — Visual previews for articles
- 📏 **Adaptive batching** — Memory-efficient processing
- 🔍 **Full-text search** — Search all articles instantly

---

## What is ZIM?

**ZIM** is a compressed archive format for offline content:
- Wikipedia offline archives
- Stack Exchange dumps
- Gutenberg books
- TED talks
- Any Kiwix-compatible content

### Common ZIM Files

| Archive | Articles | Size | Content |
|---------|----------|------|---------|
| Wikipedia (English) | 16M+ | ~90GB | All English articles |
| Wikipedia (Simple) | 200K | ~200MB | Simplified English |
| Stack Overflow | 20M+ | ~50GB | Q&A |
| Gutenberg Books | 60K+ | ~30GB | E-books |

---

## Index a ZIM Archive

### Step 1: Download ZIM File

Download from [Kiwix](https://wiki.kiwix.org/wiki/Content)

**Recommended for testing:**
- Wikipedia Simple English (~200MB)
- Stack Overflow (~50GB, for large-scale testing)

### Step 2: Navigate to ZIM Indexing

1. Open **http://localhost:5000**
2. Click **Index ZIM/ZIP** tab

### Step 3: Select ZIM File

1. Click **Choose File**
2. Select `.zim` file
3. Click **Index Archive**

### Step 4: Watch Progress

Progress shows:
- **Articles found** — Total in archive
- **Processed** — Articles indexed so far
- **ETA** — Estimated time remaining
- **Current article** — Processing status

### Step 5: Wait for Completion

ZIM indexing can take **hours** for large archives:
- Wikipedia Simple: ~10 minutes
- Wikipedia English: ~8-12 hours
- Stack Overflow: ~12-16 hours

---

## Performance

### Multi-threaded Extraction

The C++ extractor uses parallel processing:

| CPU Cores | Worker Threads | Speedup |
|----------|----------------|---------|
| 4 cores | 2 workers | ~1.8x |
| 8 cores | 6 workers | ~4x |
| 12 cores | 10 workers | ~5.5x |
| 16 cores | 14 workers | ~6x |

### Adaptive Resource Monitor

Automatically adjusts batch size based on memory:

| Memory Usage | Batch Size | Image Processing |
|--------------|------------|------------------|
| < 50% | Scale up (→ 400) | Normal |
| 50-65% | Default (50) | Normal |
| 65-80% | Scale down | Normal |
| 80-90% | Minimum (10) | Deferred |
| > 90% | Minimum (10) | Deferred + cooldown |

### Optimization Features

- **SVG rasterization** — Converts SVG to JPEG thumbnails
- **Image deduplication** — Avoids duplicate banners/logos
- **Bounded work queue** — Prevents memory explosion
- **Backpressure sleep** — Throttles during high load

---

## Search ZIM Articles

### Normal Search

Search normally. ZIM articles appear in results with source badge "ZIM".

### Browse ZIM Articles

1. Navigate to `/explore`
2. Filter by file type (not available for ZIM specifically)
3. ZIM articles mixed with other documents

### View ZIM Article

1. Click search result
2. Document viewer shows article content
3. Click image thumbnails to view

---

## Manage Indexed Archives

### View Indexed Archives

Settings → **Indexed Archives**

Shows:
- Archive name
- Archive type (ZIM/ZIP)
- Articles indexed
- Date indexed

### Sync Archives

Re-index to update:

1. Settings → Indexed Archives
2. Click **Sync Archives**
3. Wait for completion

### Remove Archive

1. Settings → Indexed Archives
2. Click **Remove** next to archive
3. Confirm removal
4. Articles removed from index

---

## Troubleshooting

### ZIM File Not Found

**Cause:** File moved or deleted

**Solution:**
- Verify file exists
- Re-index from correct location

### Indexing Too Slow

**Cause:** Large archive, single-threaded

**Solution:**
- Use multi-core machine
- Monitor memory usage
- Close other applications

### Out of Memory

**Cause:** Archive too large for RAM

**Solution:**
- Increase Docker memory limit
- Use adaptive batching (enabled by default)
- Index smaller archives

### Articles Not Searchable

**Cause:**
- Indexing incomplete
- Meilisearch not running

**Solution:**
- Wait for indexing to complete
- Check Settings → Meilisearch status

---

## API Reference

### Index ZIM Archive

```bash
POST /api/zim/index
Content-Type: multipart/form-data

file: <zim_file>
```

**Response:**
```json
{
  "success": true,
  "message": "Indexing started",
  "archive_name": "wikipedia_en_simple"
}
```

### Get Index Status

```bash
GET /api/zim/index/status
```

**Response:**
```json
{
  "status": "indexing",
  "total_articles": 200000,
  "processed_articles": 45000,
  "progress_percent": 22,
  "eta_seconds": 600
}
```

### List Indexed Archives

```bash
GET /api/zim/indexed
```

**Response:**
```json
{
  "archives": [
    {
      "archive_path": "/data/wikipedia_en_simple.zim",
      "archive_name": "Wikipedia Simple English",
      "archive_type": "zim",
      "articles_indexed": 195000,
      "indexed_at": "2026-03-18T00:00:00Z"
    }
  ]
}
```

### Get ZIM Article

```bash
GET /api/zim/article?path=/path/to/archive.zim&url=A/Article
```

Returns HTML content of article.

### Get ZIM Image

```bash
GET /api/zim/image?path=/path/to/archive.zim&img=I/Image.png
```

Returns image from archive.

---

## Limits

### Maximum Archives

No hard limit, but:
- Each archive uses memory
- Large archives take hours
- Storage for thumbnails

### Article Limits

- Wikipedia English: 16M+ articles (supported)
- Tested up to 20M articles
- Performance degrades > 50M articles

---

## Best Practices

1. **Start small** — Test with Wikipedia Simple English (~200MB)
2. **Monitor memory** — Use `docker stats` to watch usage
3. **Index overnight** — Let large archives run overnight
4. **Use SSD** — Faster random access for thumbnails
5. **Close other apps** — Free up RAM during indexing

---

## Related Features

- **[Folder Indexing](folder-indexing.md)** — Index local folders
- **[Search](search.md)** — Find indexed articles
- **[Architecture](../architecture/extractor.md)** — C++ extractor details

---

**Previous:** [qBittorrent](qbittorrent.md)  
**Next:** [Docker Deployment](../deployment/docker.md)
# Search Capabilities

Learn how to use SearchBox's powerful search features.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [Search](search.md)

---

## Overview

SearchBox provides **blazing-fast full-text search** across your documents using Meilisearch as the search engine.

**Key features:**
- ⚡ **Sub-50ms search** — Instant results
- 🎯 **Typo tolerance** — Finds results even with misspellings
- 📁 **Multi-format support** — PDFs, Word, Excel, images, and more
- 🔍 **Advanced syntax** — Boolean operators, file type filters
- 📸 **Image search** — Find images embedded in documents

---

## Basic Search

### Simple Query

Type any word or phrase:

```
quarterly report
```

Results show:
- Documents containing "quarterly" or "report"
- Match count per document
- Thumbnail preview
- File type badge

### Exact Phrase

Use quotes for exact phrase matching:

```
"machine learning"
```

Finds documents with exactly "machine learning" (both words together).

---

## Search Syntax

### File Type Filter

Search specific file types:

| Query | Meaning |
|-------|---------|
| `budget::pdf` | "budget" in PDF files only |
| `notes::docx` | "notes" in Word documents |
| `plan::xlsx` | "plan" in Excel spreadsheets |
| `readme::md` | "readme" in Markdown files |
| `log::txt` | "log" in text files |

### Multiple File Types

Search across multiple file types:

```
research::pdf::docx::txt
```

Finds "research" in PDFs, Word docs, or text files.

### Browse All Files of Type

```
*::pdf
```

Shows all PDF files in the index.

### Boolean Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `::\|\|` | OR | `ml::pdf::\|\| ai::txt` — PDFs with "ml" OR text files with "ai" |
| `::&&` | AND | `ml::pdf::&& ai::txt` — PDFs with "ml" AND text files with "ai" |
| `::!` | NOT | `report::pdf::! draft::tmp` — Reports, excluding drafts |

### Complex Queries

Combine operators:

```
budget::pdf::&& "Q4 2024"::! draft
```

Finds:
- PDF files
- Containing "budget"
- AND "Q4 2024" (exact phrase)
- Excluding files with "draft"

### Image Search

Find images embedded in documents:

```
machine learning::image
```

Shows images containing "machine learning" from any document.

Click **Search Images** button on home page for visual image search.

---

## Search Validation

The search bar changes color as you type:

| Color | Meaning |
|-------|---------|
| 🟢 **Green** | Valid syntax, ready to search |
| 🟠 **Orange** | Incomplete (e.g., operator without second term) |
| 🔴 **Red** | Syntax error |

---

## Supported File Types

| Type | Extensions | Extraction |
|------|------------|------------|
| **Documents** | `.pdf`, `.docx`, `.doc`, `.xlsx` | C++ (MuPDF/libzip) |
| **Web** | `.html`, `.htm` | C++ (Gumbo) |
| **Text** | `.txt`, `.md` | Native Python |
| **Images** | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp` | Metadata indexing |
| **Archives** | `.zim`, `.zip` | Parallel processing |

**Note:** ZIM archives support indexing millions of articles (e.g., full Wikipedia offline).

---

## Search Results

### Result Display

Each result shows:

```
┌─────────────────────────────────────┐
│ 📄 Quarterly Report Q4.pdf          │
│ ┌─────────────────────────────┐    │
│ │    [Thumbnail Preview]       │    │
│ └─────────────────────────────┘    │
│ Type: PDF | Size: 2.4 MB            │
│ Path: /home/user/Documents/         │
│ Matches: 23 occurrences             │
│ [Open] [Bookmark] [Delete]          │
└─────────────────────────────────────┘
```

### Quick Actions

| Action | Button | Description |
|--------|--------|-------------|
| **Open** | 📄 | Open in default application |
| **Reveal** | 📁 | Show in file manager |
| **Bookmark** | 🔖 | Save for quick access |
| **Delete** | 🗑️ | Remove from index |

---

## Search Tips

### Improve Precision

1. **Use exact phrases** — `"quarterly report"` instead of `quarterly report`
2. **Filter by file type** — `budget::pdf` instead of `budget`
3. **Use NOT operator** — `report::! draft` to exclude drafts
4. **Combine AND/OR** — `ml::pdf::&& ai::txt` for complex queries

### Performance Tips

- Use file type filters for large indexes
- Start with simple queries, refine gradually
- Bookmark frequently accessed documents
- Use Explore page for browsing

### Common Mistakes

❌ **Wrong:** `budget pdf` (searches for both words, not filter)  
✅ **Right:** `budget::pdf` (searches for "budget" in PDF files only)

❌ **Wrong:** `"machine learning` (unclosed quote)  
✅ **Right:** `"machine learning"` (closed quote)

❌ **Wrong:** `budget::pdf::` (trailing colon)  
✅ **Right:** `budget::pdf` (no trailing colon)

---

## Advanced Features

### Typo Tolerance

Meilisearch automatically handles typos:

```
machne learning
```

Finds "machine learning" even with typo.

### Relevance Ranking

Results ranked by:
- **Word position** — Earlier appearances rank higher
- **Exact matches** — Exact words rank higher than typos
- **Field importance** — Title > Content > Path

### Pagination

Results paginate automatically:
- 20 results per page
- Load more on scroll
- Bookmark position preserved

---

## Image Search

### How It Works

Images embedded in documents are:
1. Extracted during indexing
2. Stored as thumbnails
3. Indexed with surrounding text
4. Searchable by content

### Search Images

```
neural network::image
```

Shows images related to "neural network" from all documents.

### Browse Images

Navigate to **/images** for visual image gallery:
- Filter by source document
- Sort by relevance/date
- Click to view in context

---

## API Integration

### Programmatic Search

Use the API for automation:

```bash
curl http://localhost:5000/api/search?q=budget::pdf
```

**Response:**
```json
{
  "hits": [
    {
      "id": "doc_123",
      "title": "Quarterly Report Q4.pdf",
      "content": "...",
      "file_type": "pdf",
      "file_path": "/path/to/file.pdf"
    }
  ],
  "processingTimeMs": 23,
  "query": "budget::pdf"
}
```

See **[API Reference](../api/endpoints.md)** for full documentation.

---

## Troubleshooting

### No Results Found

**Cause:** 
- Query too specific
- Index empty
- File type not in index

**Solution:**
- Try simpler query
- Verify folder is indexed (check document count)
- Use `*::pdf` to check if PDFs exist

### Too Many Results

**Cause:** 
- Query too broad
- Common word (e.g., "the")

**Solution:**
- Add file type filter: `report::pdf`
- Use exact phrase: `"quarterly report"`
- Use NOT operator: `report::! draft`

### Wrong File Type Results

**Cause:** 
- Missing file type filter

**Solution:** Add `::type` suffix

---

## Next Steps

- **[Explore Page](explore.md)** — Visual document browsing
- **[Bookmarks](bookmarks.md)** — Save frequently accessed documents
- **[Vault](vault.md)** — Secure sensitive documents
- **[API Reference](../api/endpoints.md)** — Programmatic search

---

**Previous:** [Features](README.md)  
**Next:** [Encrypted Vault](vault.md)
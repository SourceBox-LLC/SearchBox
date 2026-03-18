# Your First Search

Complete tutorial on using SearchBox for the first time.

> **Navigation:** [Documentation](../README.md) > [Getting Started](README.md) > [Your First Search](first-search.md)

---

## Overview

This tutorial walks you through:
1. Indexing your first folder
2. Performing a basic search
3. Using search filters
4. Viewing document results
5. Using bookmarks

**Time:** 15 minutes  
**Difficulty:** Beginner

---

## Step 1: Index Your First Folder

### Choose a Folder

Select a folder with documents to index:
- **Windows:** `C:/Users/YourName/Documents`
- **Linux:** `/home/yourname/Documents`
- **macOS:** `/Users/yourname/Documents`

**Tip:** Start with a small folder (10-50 files) for quick indexing.

### Index the Folder

1. Open **http://localhost:5000**
2. Click **Index Folder** tab
3. Enter folder path
4. Click **Index Folder** button

### Watch Progress

A progress bar shows indexing status:
- **Files found:** Total files in folder
- **Processed:** Files indexed so far
- **ETA:** Estimated time remaining

**Example:**
```
Indexing: 45 files
Progress: ████████░░░░ 65%
ETA: 2 minutes
```

### Wait for Completion

Indexing completes when:
- Progress bar reaches 100%
- "Indexing complete" message appears
- Document count updates in home page

---

## Step 2: Perform Your First Search

### Navigate to Home

Click **Home** tab or logo to return to search page.

### Enter Search Query

Type a word or phrase in the search bar.

**Example:** `quarterly report`

### Execute Search

Press **Enter** or click search icon (🔍).

### View Results

Results appear with:
- **Document title** (clickable)
- **File type badge** (PDF, DOCX, etc.)
- **Thumbnail preview**
- **File path**
- **Match count** (how many times query appears)

---

## Step 3: Use Search Filters

### Filter by File Type

Search only specific file types:

```
budget::pdf
```

This searches for "budget" only in PDF files.

### Search Multiple Types

```
notes::pdf::docx::txt
```

Searches across PDF, Word, and text files.

### Browse All Files of Type

```
*::pdf
```

Shows all PDFs in the index.

### Exact Phrase Search

```
"machine learning"::pdf
```

Finds exact phrase "machine learning" in PDFs.

---

## Step 4: View Document Details

### Click Result

Click any result to open **Document Viewer**.

### Document Viewer Shows

- **Full document title**
- **File type and size**
- **Thumbnail/large preview**
- **Text content** (if extracted)
- **File path**
- **Quick actions** (open, reveal, bookmark, delete)

### Quick Actions

| Action | Icon | Description |
|--------|------|-------------|
| **Open** | 📄 | Open in default application |
| **Reveal** | 📁 | Show in file manager |
| **Bookmark** | 🔖 | Save for quick access |
| **Delete** | 🗑️ | Remove from index |

---

## Step 5: Use Bookmarks

### Bookmark a Document

1. Open document viewer
2. Click **Bookmark** button (🔖)
3. Choose slot (1-5, auto-assigned left to right)
4. Bookmark saved

### Access Bookmarks

Return to **Home** page.

Bookmarks appear at top as shortcut buttons.

### Click Bookmark

Click bookmark to open document instantly.

### Manage Bookmarks

**Right-click** bookmark to:
- **Edit** (change slot)
- **Delete** (remove bookmark)

---

## Step 6: Explore More Features

### Search Images

Click **Search Images** button or use query:

```
machine learning::image
```

Shows images embedded in documents.

### Browse Explore Page

Navigate to **/explore** for visual masonry grid of all documents.

**Features:**
- Filter by file type (pills at top)
- Sort by recent/name/size
- Infinite scroll
- Click to open

### Set Up Vault

For sensitive documents:

1. Go to **Settings** → **Vault Security**
2. Click **Set Up PIN**
3. Enter 4-digit PIN
4. Upload files to vault

### Enable AI Summaries

If Ollama is installed:

1. Settings → AI Search → Enable
2. Choose model
3. Search with AI summary enabled

---

## Practice Exercises

### Exercise 1: Basic Search

1. Index a folder with 10+ documents
2. Search for a common word
3. Verify results appear

### Exercise 2: File Type Filter

1. Search for "report" in PDFs only
2. Verify only PDF results show

### Exercise 3: Exact Phrase

1. Search for exact phrase in quotes
2. Verify exact matches only

### Exercise 4: Bookmark

1. Open any document
2. Bookmark it
3. Return home
4. Click bookmark to reopen

### Exercise 5: Explore Page

1. Navigate to /explore
2. Filter by PDF
3. Scroll to see all PDFs
4. Click one to open

---

## Search Syntax Reference

| Syntax | Meaning | Example |
|--------|---------|---------|
| `term` | Basic search | `budget` |
| `"phrase"` | Exact phrase | `"quarterly report"` |
| `::type` | File type filter | `budget::pdf` |
| `*::type` | All files of type | `*::pdf` |
| `::type::||` | OR operator | `research::pdf::|| notes::docx` |
| `::type::&&` | AND operator | `ml::pdf::&& ai::txt` |
| `::type::!` | NOT operator | `report::pdf::! draft` |
| `::image` | Image search | `machine learning::image` |

---

## Tips & Tricks

### Search Tips

- Start with simple queries
- Add filters gradually
- Use quotes for exact phrases
- Try file type filters for precision

### Performance Tips

- Index smaller folders first
- Use specific queries for large indexes
- Filter by file type to reduce results
- Use bookmarks for frequently accessed docs

### Organization Tips

- Bookmark important documents (1-5 slots)
- Use descriptive folder names
- Index related folders together
- Set up vault for sensitive files

---

## Common Issues

### No Results Found

**Cause:** Query too specific or index empty

**Solution:**
- Try simpler query
- Verify folder is indexed
- Check document count

### Wrong File Type Results

**Cause:** Missing file type filter

**Solution:** Add `::pdf` or other type to query

### Slow Search

**Cause:** Large index or complex query

**Solution:**
- Use file type filters
- Be more specific
- Wait for indexing to complete

---

## Next Steps

### Learn More

- **[Search Syntax](../features/search.md)** — Advanced search operators
- **[Bookmarks](../features/bookmarks.md)** — Bookmark feature details
- **[Vault](../features/vault.md)** — Encrypted vault setup
- **[AI Summaries](../features/ai-summaries.md)** — AI integration

### Explore Features

- **[Folder Indexing](../features/folder-indexing.md)** — Background indexing
- **[qBittorrent](../features/qbittorrent.md)** — Torrent integration
- **[Explore Page](../features/explore.md)** — Visual browsing

### Get Help

- **[Troubleshooting](../troubleshooting/common-issues.md)** — Common issues
- **[FAQ](../troubleshooting/faq.md)** — Frequently asked questions

---

**Previous:** [Installation](installation.md)  
**Next:** [Search Syntax](../features/search.md)

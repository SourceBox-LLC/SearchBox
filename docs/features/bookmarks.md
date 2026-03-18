# Bookmarks

Save frequently accessed documents for quick access.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [Bookmarks](bookmarks.md)

---

## Overview

Bookmarks provide **quick access** to frequently used documents from the home page:

- 📌 **5 slots** — Save up to 5 documents
- 🎯 **One-click access** — Click to open instantly
- ✏️ **Easy management** — Right-click to edit/delete
- 🏷️ **File type badges** — Visual identification by type
- 💾 **Persistent** — Saved in database, not localStorage

---

## How It Works

### Slot System

Bookmarks use a **slot system** (1-5):

```
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│  Slot 1│ │  Slot 2│ │  Slot 3│ │  Slot 4│ │  Slot 5│
│   📄   │ │   📊   │ │   📝   │ │   📐   │ │   📁   │
│  PDF   │ │  XLSX  │ │   MD   │ │   SVG  │ │  DOCX  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

- Slots filled left-to-right (auto-assigned)
- One document per slot
- Click to open in new tab
- Right-click to edit/delete

### File Type Badges

Each bookmark shows a **color-coded badge**:

| File Type | Badge Color | Example |
|-----------|-------------|----------|
| PDF | Red | 📄 `report.pdf` |
| Word | Blue | 📝 `notes.docx` |
| Excel | Green | 📊 `budget.xlsx` |
| Markdown | Purple | 📝 `README.md` |
| Text | Gray | 📝 `log.txt` |
| Image | Orange | 🖼️ `diagram.png` |

---

## Add a Bookmark

### Step 1: Open Document

1. Search for document
2. Click result to open viewer

### Step 2: Click Bookmark

1. In document viewer, click **Bookmark** button (🔖)
2. Bookmark automatically assigned to next available slot
3. Confirmation message appears

### Step 3: Verify

1. Return to home page
2. Bookmark appears in row at top

---

## Access Bookmarks

### From Home Page

1. Navigate to home page (http://localhost:5000)
2. Bookmarks appear in row at top
3. Click any bookmark to open

### Bookmark Display

Each bookmark shows:
- **File type badge** (PDF, DOCX, etc.)
- **Document title** (truncated if long)
- **Slot number** (1-5)

---

## Manage Bookmarks

### Edit Bookmark

**Right-click** bookmark → **Edit**:
- Change slot number
- View document details

### Delete Bookmark

**Right-click** bookmark → **Delete**:
- Bookmark removed from slot
- Slot becomes available for new bookmark

### Replace Bookmark

Add bookmark to occupied slot:
1. Right-click existing bookmark
2. Delete
3. Add new bookmark (auto-fills slot)

---

## Tips & Tricks

### Quick Access

- Use slots 1-3 for most important documents
- Use slots 4-5 for frequently accessed docs
- Bookmark documents you need daily

### Organization

- Replace old bookmarks with new ones
- Delete bookmarks when no longer needed
- Use descriptive filenames for visibility

### Workflow

1. Set up bookmarks on first use
2. Update as needed
3. Keep slots 1-3 for critical documents
4. Use slots 4-5 for reference docs

---

## Settings

### Enable/Disable Bookmarks

Bookmarks are **enabled by default**.

To disable:
1. Go to **Settings**
2. Find **Bookmarks** section
3. Toggle **Enable Bookmarks** switch
4. Bookmarks hide from home page

**Note:** Disabling doesn't delete bookmarks, just hides them.

---

## Database Storage

Bookmarks are stored in SQLite database:

```sql
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY,
    slot INTEGER UNIQUE NOT NULL,  -- 1-5
    doc_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_path TEXT,
    created_at DATETIME,
    updated_at DATETIME
);
```

**Advantages:**
- Persistent across sessions
- Synced with document database
- Not cleared on browser refresh

---

## Troubleshooting

### Bookmarks Not Showing

**Cause:** Bookmarks disabled in settings

**Solution:**
1. Settings → Bookmarks
2. Toggle **Enable Bookmarks**

### All Slots Full

**Cause:** 5 bookmarks already exist

**Solution:**
1. Right-click existing bookmark
2. Delete one
3. Add new bookmark

### Bookmark Disappeared

**Cause:** 
- Document deleted from index
- Database reset

**Solution:**
1. Re-index folder
2. Re-add bookmark

### Wrong File Type Badge

**Cause:** File extension detection

**Solution:**
- Verify file extension is correct
- File type badge updated on re-add

---

## API Reference

### Get All Bookmarks

```bash
GET /api/bookmarks
```

**Response:**
```json
[
  {
    "slot": 1,
    "doc_id": "abc123",
    "title": "Quarterly Report.pdf",
    "file_type": "pdf",
    "file_path": "/home/user/Documents/report.pdf"
  }
]
```

### Add Bookmark

```bash
POST /api/bookmarks
Content-Type: application/json

{
  "doc_id": "abc123",
  "title": "Quarterly Report.pdf",
  "file_type": "pdf"
}
```

### Delete Bookmark

```bash
DELETE /api/bookmarks?slot=1
```

---

## Future Enhancements

Planned improvements:
- Drag-and-drop reordering
- Keyboard shortcuts (Alt+1 through Alt+5)
- Unlimited bookmarks (Cloud)
- Import/export bookmarks
- Bookmark folders/categories
- Auto-fetch document thumbnails

---

## Related Features

- **[Search](search.md)** — Find documents to bookmark
- **[Vault](vault.md)** — Secure sensitive documents
- **[Explore](explore.md)** — Visual browsing

---

**Previous:** [Vault](vault.md)  
**Next:** [AI Summaries](ai-summaries.md)
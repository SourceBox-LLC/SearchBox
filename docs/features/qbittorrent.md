# qBittorrent Integration

Auto-index completed downloads from your torrent client.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [qBittorrent](qbittorrent.md)

---

## Overview

SearchBox can **automatically index completed downloads** from qBittorrent:

- 🧲 **Auto-detect completions** — Monitors qBittorrent for finished downloads
- 📁 **Index files automatically** — Extracts and indexes downloaded files
- 🏷️ **Torrent badges** — Shows torrent source in search results
- 🔄 **Manual sync** — Click to sync when needed

---

## Prerequisites

### qBittorrent Setup

1. **Install qBittorrent** — [qbittorrent.org](https://www.qbittorrent.org/)
2. **Enable Web UI:**
   - Open qBittorrent
   - Tools → Options → Web UI
   - Check "Web User Interface"
   - Set port (default: 8080)
   - Set username and password

3. **Note your settings:**
   - Host: `localhost` or IP
   - Port: `8080` (default)
   - Username: (your username)
   - Password: (your password)

---

## Configure qBittorrent Integration

### Step 1: Open Settings

Navigate to **Settings** → **qBittorrent**

### Step 2: Enable Integration

Toggle **Enable qBittorrent integration**

### Step 3: Enter Credentials

- **Host:** `localhost` (or your qBittorrent host)
- **Port:** `8080` (default)
- **Username:** Your Web UI username
- **Password:** Your Web UI password

### Step 4: Test Connection

Click **Test Connection**

- **Success:** "Connection successful" message
- **Failure:** Check credentials and qBittorrent settings

### Step 5: Save

Click **Save Settings**

---

## Sync Downloads

### Manual Sync

1. Settings → qBittorrent
2. Click **Sync Downloads**
3. Wait for completion
4. View indexed torrents

### What Gets Indexed

- All **completed** torrents
- Files in download directory
- Magnet links (after download)
- Sequential downloads

### Torrent Status

After sync, you'll see:
- **Torrent name** — Name from qBittorrent
- **Files indexed** — Number of files
- **Date indexed** — When synced
- **Download path** — Where files are stored

---

## Search Torrent Documents

### Find Torrent Files

Search normally. Torrent-sourced documents show an **orange download badge** and "qBittorrent" label.

### Filter by Source

Currently, no direct filter by source. Torrent files are mixed with folder-indexed files.

### View Torrent List

Settings → qBittorrent → **Indexed torrents**

Shows all synced torrents.

---

## Status Indicators

### Connection Status

| Status | Meaning |
|--------|---------|
| 🟢 **Connected** | qBittorrent reachable and authenticated |
| 🔴 **Disconnected** | Connection failed |
| 🟡 **Error** | Authentication or network error |

### Stats Display

When connected, shows:
- **Download speed** — Current download speed
- **Upload speed** — Current upload speed
- **Active torrents** — Number downloading
- **Completed torrents** — Number completed

---

## Troubleshooting

### Connection Failed

**Cause:** qBittorrent Web UI not running

**Solution:**
```bash
# Check if qBittorrent is running
ps aux | grep qbittorrent

# Start qBittorrent
qbittorrent
```

### Authentication Failed

**Cause:** Wrong username/password

**Solution:**
- Verify credentials in qBittorrent
- Check Web UI settings
- Reset password if needed

### Port in Use

**Cause:** Port conflict

**Solution:**
- Change qBittorrent Web UI port
- Update SearchBox settings

### Files Not Indexed

**Cause:**
- Torrent not complete
- Files in different location
- File type not supported

**Solution:**
- Wait for torrent to complete
- Sync again after completion
- Check file paths

### Docker Issues

**Cause:** qBittorrent on host, SearchBox in container

**Solution:**
Use `host.docker.internal` instead of `localhost`:
- Host: `host.docker.internal`
- Port: `8080`

On Linux, use Docker network:
- Host: `172.17.0.1`
- Port: `8080`

---

## API Reference

### Get Status

```bash
GET /api/qbittorrent/status
```

**Response:**
```json
{
  "connected": true,
  "version": "4.6.0",
  "dl_speed": "2.5 MB/s",
  "up_speed": "1.2 MB/s",
  "downloading_count": 5,
  "completed_count": 45
}
```

### Sync Downloads

```bash
POST /api/qbittorrent/sync
```

**Response:**
```json
{
  "success": true,
  "indexed_count": 12,
  "total_files": 150
}
```

### Get Indexed Torrents

```bash
GET /api/qbittorrent/indexed
```

**Response:**
```json
{
  "torrents": [
    {
      "torrent_hash": "abc123...",
      "torrent_name": "Ubuntu 22.04 LTS",
      "save_path": "/downloads/ubuntu",
      "files_indexed": 5,
      "indexed_at": "2026-03-18T00:00:00Z"
    }
  ]
}
```

---

## Best Practices

1. **Sync after downloads complete** — Don't sync while downloading
2. **Configure auto-start** — Start qBittorrent with system
3. **Use consistent paths** — Keep downloads in one location
4. **Regular syncs** — Sync daily or weekly as needed
5. **Remove old torrents** — Clean up in qBittorrent to speed up sync

---

## Limitations

- **Manual sync only** — No automatic monitoring
- **Completed torrents only** — Can't index active downloads
- **Local only** — Can't connect to remote qBittorrent (yet)
- **Single instance** — One qBittorrent connection per SearchBox

---

## Related Features

- **[Folder Indexing](folder-indexing.md)** — Index local folders
- **[Search](search.md)** — Find indexed documents
- **[API Reference](../api/endpoints.md)** — Full API docs

---

**Previous:** [Explore View](explore.md)  
**Next:** [ZIM Archives](zim.md)
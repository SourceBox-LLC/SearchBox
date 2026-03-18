# Frequently Asked Questions

Answers to common questions.

> **Navigation:** [Documentation](../README.md) > [Troubleshooting](README.md) > [FAQ](faq.md)

---

## General

### What is SearchBox?

SearchBox is a **self-hosted document search engine**. It indexes your local files (PDFs, Word docs, etc.) and provides fast, full-text search with AI-powered summaries.

### What file types are supported?

| Type | Extensions |
|------|------------|
| Documents | `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt` |
| Web/E-books | `.html`, `.htm`, `.epub` |
| Archives | `.zim` (Wikipedia), `.zip` |
| Text | `.md`, `.txt`, `.rst` |
| Images | `.jpg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp` |

### Is SearchBox free?

**Yes!** SearchBox is open-source (AGPL-3.0-or-later) and free to use. You can:
- Run it locally for personal use
- Self-host it on your own server
- Contribute to the project

A **cloud version** is coming soon with managed hosting and team features.

### Can I use SearchBox offline?

**Yes!** SearchBox runs entirely on your machine. Only the AI summary feature (Ollama) requires internet if you want to use external models — but local models work offline too.

### What languages does SearchBox support?

SearchBox supports any language, thanks to Meilisearch's built-in language support. Document content, filenames, and search queries all support Unicode.

---

## Installation

### What are the system requirements?

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 2GB | 4GB+ |
| **Storage** | 10GB | SSD, 100GB+ |
| **OS** | Linux, macOS, Windows | Ubuntu 22.04+ |

### Do I need Docker?

**Recommended, but not required.** Docker provides the easiest setup. You can also install:
- Python 3.10+
- uv package manager
- Meilisearch

See [Self-Hosted Installation](../deployment/self-hosted.md).

### How do I update SearchBox?

```bash
# Docker
git pull
docker compose down
docker compose up -d --build

# Native
git pull
uv sync
```

### Can I run SearchBox in the background?

**Yes.** Use systemd (Linux) or Docker.

```bash
# Docker (detached)
docker compose up -d

# Systemd
sudo systemctl start searchbox
```

---

## Features

### How does search work?

SearchBox uses **Meilisearch** for full-text search:
1. Documents are extracted and text is indexed
2. Search queries are processed with typo tolerance
3. Results are ranked by relevance
4. Filters can narrow by file type, date, etc.

### What is the vault?

The **vault** is an encrypted storage area for sensitive documents:
- Files are encrypted with AES-256-GCM
- Protected by a 4-digit PIN
- Only you can access your files
- Even server admins can't read them

### How many documents can SearchBox handle?

Depends on your hardware:
- **Personal use (< 100K docs):** Runs smoothly on modest hardware
- **Large libraries (> 100K docs):** Consider more RAM, SSD
- **Very large (> 1M docs):** May need PostgreSQL (future)

### Can I search within PDFs?

**Yes!** SearchBox extracts text from PDFs (and other formats) for full-text search. You can search:
- Document content
- Filenames
- Metadata (author, title)

### What's the difference between self-hosted and cloud?

| Feature | Self-Hosted | Cloud |
|---------|-------------|-------|
| **Cost** | Free | Subscription |
| **Setup** | You manage | We manage |
| **Updates** | Manual | Automatic |
| **Backups** | You configure | Automatic |
| **Teams** | Single user | Team accounts |
| **Support** | Community | Priority email |

---

## Vault / Security

### Is the vault secure?

**Yes.** Files are encrypted with:
- **AES-256-GCM** encryption
- **PBKDF2** with 100,000 iterations for key derivation
- **4-digit PIN** that never leaves your device

Your files are encrypted before being saved and only decrypted when you provide the PIN.

### What happens if I forget my PIN?

**Your files are permanently encrypted and unreadable.**

There is no backdoor, no recovery, no "forgot PIN" option. This is a security feature — it means no one, not even us, can access your files without the PIN.

**Keep your PIN safe!**

### Can I change my vault PIN?

**Yes.** Go to Settings → Vault → Change PIN. You'll need to enter your current PIN first.

### Where is my data stored?

- **Self-hosted:** On your server in `instance/` and `vault/` directories
- **Cloud:** On our servers (US/EU available), encrypted at rest

Data never leaves your control (self-hosted) or your instance (cloud).

---

## Performance

### Why is indexing slow?

Indexing speed depends on:
- **File count:** More files = longer
- **File size:** Larger files = longer
- **Storage speed:** SSD faster than HDD
- **CPU:** More cores = faster extraction

**Tips:**
- Index folders incrementally
- Exclude binary files you don't need
- Use SSD for better performance

### How can I improve search speed?

- Use **filters** (file type, date range)
- Ensure enough **RAM** (4GB+)
- Use **SSD** for database
- Increase **Meilisearch heap** size

### Why is SearchBox using so much memory?

Memory usage depends on:
- Document count
- Index size
- Active indexing jobs

**Tips:**
- Limit concurrent indexing
- Restart periodically
- Set Docker memory limits

---

## qBittorrent Integration

### How does qBittorrent integration work?

1. Configure connection in Settings
2. Select completed torrents
3. SearchBox indexes all files in the torrent
4. Search across all torrent content

### Can I search while torrent is downloading?

Only **completed** torrents can be indexed. In-progress torrents won't appear until they finish.

### Can I delete indexed torrents?

Deleting the torrent from qBittorrent won't remove files from SearchBox. You need to manually remove from the index in Settings.

---

## ZIM Archives

### What are ZIM files?

ZIM files are compressed archives used for:
- **Wikipedia** offline dumps
- **Stack Overflow** archives
- **Gutenberg** ebooks
- Any Kiwix-compatible content

### How do I use ZIM files?

1. Download a ZIM file (e.g., from Wikipedia)
2. Go to Settings → ZIM Archives
3. Click "Add Archive"
4. Select the ZIM file
5. Wait for indexing to complete

### Can I search Wikipedia offline?

**Yes!** Download Wikipedia ZIM from [Kiwix](https://kiwix.org) and index it. Then you can search all of Wikipedia without internet.

---

## Troubleshooting

### SearchBox won't start

1. Check if ports 5000 and 7700 are free
2. Check Docker logs: `docker compose logs`
3. Verify `.env` file exists
4. Check file permissions

### Search returns no results

1. Make sure folders are indexed
2. Check Meilisearch is running
3. Verify document count > 0
4. Try a different search term

### Can't access from other devices

1. Change `SEARCHBOX_HOST=0.0.0.0` in `.env`
2. Open firewall port 5000
3. Use correct IP address

---

## Deployment

### How do I run SearchBox on a server?

Follow the [Production Deployment Guide](../deployment/production.md):
1. Set up reverse proxy (nginx/Caddy)
2. Configure HTTPS (Let's Encrypt)
3. Set up backups
4. Configure firewall

### Can I run multiple instances?

**Yes.** Use different:
- Ports for each instance
- Data directories
- Meilisearch ports

### How do I back up my data?

```bash
# Stop services
docker compose down

# Backup
tar czf searchbox-backup.tar.gz instance vault meili_data

# Restart
docker compose up -d
```

### How do I restore from backup?

```bash
# Stop services
docker compose down

# Restore
tar xzf searchbox-backup.tar.gz

# Restart
docker compose up -d
```

---

## License

### What license does SearchBox use?

**AGPL-3.0-or-later.** This means:
- You can use, modify, and distribute freely
- If you modify and distribute (including via network), you must share your changes
- Any derivative work must also be AGPL

### Can I use SearchBox commercially?

**Yes, with conditions:**
- If you offer SearchBox as a service (SaaS), you must provide source code
- Enterprise users can purchase a commercial license to avoid AGPL requirements

### Where can I find the full license?

See [LICENSE](../LICENSE) or visit [gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0).

---

## More Questions?

- **[Common Issues](common-issues.md)** — Detailed troubleshooting
- **[Debugging Guide](debugging.md)** — Advanced debugging
- **[Community Support](../community/README.md)** — Get help

---

**Previous:** [Common Issues](common-issues.md)  
**Next:** [Debugging](debugging.md)
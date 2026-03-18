# Troubleshooting

Solutions to common problems and frequently asked questions.

> **Navigation:** [Documentation](../README.md) > [Troubleshooting](README.md)

---

## Common Issues

| Issue | Quick Fix | Full Guide |
|-------|-----------|------------|
| Container won't start | Check Docker logs | [Guide](common-issues.md#container-wont-start) |
| No search results | Verify index has documents | [Guide](common-issues.md#no-search-results) |
| Invalid folder path | Add volume mount | [Guide](common-issues.md#invalid-folder-path) |
| Vault PIN not working | Verify 4-digit PIN | [Guide](common-issues.md#vault-pin-issues) |
| AI summaries not working | Start Ollama | [Guide](common-issues.md#ai-summaries-issues) |

---

## Quick Diagnostics

### Check Container Status

```bash
docker compose ps
```

Expected: `Up (healthy)`

### View Logs

```bash
docker compose logs -f
```

Look for errors or warnings.

### Check Port Availability

```bash
lsof -i :5000 -i :7700
```

Ports 5000 and 7700 must be free.

### Verify Meilisearch

```bash
curl http://localhost:7700/health
```

Expected: `{"status":"available"}`

---

## FAQ

### General

**Q: What file types are supported?**

A: PDFs, Word (DOCX, DOC), Excel (XLSX), HTML, Markdown (MD), Text (TXT), images (JPG, PNG, GIF, WebP, SVG, BMP), and ZIM archives.

**Q: Can I use SearchBox offline?**

A: Yes! SearchBox runs entirely locally. Only Ollama integration (optional) requires internet.

**Q: How do I back up my data?**

A: Back up these directories:
- `instance/` (database)
- `vault/` (encrypted files)
- `static/thumbnails/` (thumbnails)

**Q: Is my data private?**

A: Yes. All data stays on your infrastructure. No external services. No telemetry.

---

### Performance

**Q: Why is indexing slow?**

A: Indexing speed depends on:
- File count and size
- CPU cores (more = faster)
- Storage speed (SSD faster than HDD)
- Available RAM

**Q: How can I improve search speed?**

A:
- Use file type filters
- Limit total documents (< 100K)
- SSD for database
- Increase Meilisearch heap

---

### Security

**Q: Is the vault secure?**

A: Yes. AES-256-GCM encryption with PBKDF2 key derivation (600K iterations). Files never leave your computer unencrypted.

**Q: What if I forget my PIN?**

A: There's no recovery. Vault files are permanently encrypted. Keep your PIN safe.

**Q: Can multiple users use SearchBox?**

A: Self-hosted is single-user. Cloud version (coming soon) supports teams.

---

### Features

**Q: How many bookmarks can I save?**

A: 5 slots in self-hosted. Unlimited in Cloud (coming soon).

**Q: Can I index network drives?**

A: Yes, if mounted in Docker. Add volume mount in `docker-compose.yml`.

**Q: Does SearchBox index email?**

A: Not currently. Planned for future release.

---

## Advanced Troubleshooting

### Debug Mode

Enable debug logging:

```bash
docker compose down
# Edit docker-compose.yml, add:
environment:
  - FLASK_DEBUG=1
docker compose up -d
```

### Database Issues

**Database locked:**
```bash
# Check connections
lsof instance/searchbox.db

# Kill stale processes
pkill -f searchbox
```

**Corrupted database:**
```bash
# Backup first
cp instance/searchbox.db instance/searchbox.db.bak

# Restore from backup
sqlite3 instance/searchbox.db ".recover" > recover.sql
sqlite3 instance/searchbox_new.db < recover.sql
```

### Meilisearch Issues

**Meilisearch won't start:**
```bash
# Check master key
echo $MEILI_MASTER_KEY

# Check logs
docker compose logs meilisearch

# Reset (WARNING: deletes all data)
rm -rf meili_data/
```

**Index corrupted:**
```bash
# Clear index
curl -X DELETE "http://localhost:7700/indexes/documents" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY"
```

---

## Getting Help

### Community Support

- **[Discord](https://discord.gg/placeholder)** — Chat with other users
- **[GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues)** — Report bugs
- **[GitHub Discussions](https://github.com/SourceBox-LLC/SearchBox/discussions)** — Ask questions

### Reporting Bugs

When reporting bugs, include:

1. **SearchBox version** (`docker compose logs | grep version`)
2. **Docker version** (`docker --version`)
3. **OS** (`uname -a` or Windows version)
4. **Steps to reproduce**
5. **Expected vs actual behavior**
6. **Logs** (`docker compose logs > logs.txt`)

### Security Issues

For security vulnerabilities:

- **Do NOT** create public issue
- Email: **security@sourcebox.ai**
- Include: Description, steps to reproduce, potential impact

---

## Related Documentation

- **[Common Issues](common-issues.md)** — Detailed problem/solution guide
- **[FAQ](faq.md)** — Frequently asked questions
- **[Debugging](debugging.md)** — Debug guide

---

**Navigation:**
- [Common Issues](common-issues.md)
- [FAQ](faq.md)
- [Debugging](debugging.md)
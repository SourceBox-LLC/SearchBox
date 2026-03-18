<div align="center">

# SearchBox

**Your team's private document search engine.**

Index PDFs, docs, images, and archives. Search instantly with AI summaries. 
Everything runs on your infrastructure — nothing leaves your computer.

[![License: AGPL](https://img.shields.io/badge/License-AGPL%203.0-orange.svg)](LICENSE)

---

**Quick Links:** [📚 Documentation](docs/) | [🚀 Quick Start](docs/getting-started/quickstart.md) | [💬 Community](https://discord.gg/placeholder) | [☁️ Cloud Waitlist](#)

</div>

---

## Why SearchBox?

### The Problem
Most search engines require sending your documents to external servers. For legal, medical, and engineering teams handling sensitive documents, this creates compliance risks and privacy concerns.

### The Solution
SearchBox runs entirely on your infrastructure. Your documents never leave your control, yet you get enterprise-grade search capabilities.

### Key Benefits

| Benefit | What It Means |
|---------|---------------|
| 🔒 **100% Private** | No external APIs, no data collection, no telemetry |
| ⚡ **Blazing Fast** | Sub-50ms full-text search powered by Meilisearch |
| 🧠 **AI-Ready** | Optional Ollama integration for intelligent summaries |
| 🔐 **Military Encryption** | AES-256-GCM vault with PBKDF2 key derivation |
| 💰 **Free Forever** | Self-hosted version is free with no limitations |
| 👥 **Team-Ready** | Cloud version supports collaboration & shared indexes |

### Comparison

| Feature | SearchBox | Elastic Search | Algolia |
|---------|-----------|---------------|---------|
| Self-hosted | ✅ | ✅ | ❌ |
| Local-first | ✅ | ❌ | ❌ |
| Encrypted vault | ✅ | ❌ | ❌ |
| One-time setup | ✅ | ❌ | N/A |
| Free tier | ✅ Unlimited | ❌ Limited | ❌ Limited |
| Team collaboration | ✅ (Cloud) | ✅ (Enterprise) | ✅ (Business) |
| AI summaries | ✅ | ❌ | ❌ |

---

## Features

### 🔍 Search Capabilities
- **Full-text search** — PDFs, Word docs, Excel, HTML, text files, Markdown, and images
- **Search syntax** — Boolean operators, file type filters, exact phrase matching
- **Image search** — Find images embedded inside documents
- **Explore view** — Visual masonry grid to browse all indexed documents

### 🔒 Security & Privacy
- **Encrypted vault** — AES-256-GCM storage with PIN protection (PBKDF2, 600k iterations)
- **Session auth** — PIN verified once per session, 30-minute timeout
- **CSRF protection** — Flask-WTF tokens on all state-changing requests
- **Rate limiting** — 5 PIN attempts per IP, 5-minute lockout
- **No external requests** — Everything runs locally, nothing leaves your machine

### 📁 Indexing & Integration
- **Folder indexing** — Background processing with real-time progress
- **ZIM archives** — Index Wikipedia offline archives (16M+ articles)
- **qBittorrent integration** — Auto-index completed downloads
- **Archive support** — ZIP, ZIM file indexing with adaptive batching

### 👥 Team Features (Cloud)
- **Shared indexes** — Team members search the same document collection
- **Role-based access** — Admin, Member, Viewer permissions
- **Activity logs** — Audit trail of all user actions
- **Invite system** — Add team members via email

### 🎨 User Experience
- **Dark theme UI** — Responsive, modern interface
- **Visual explore** — Masonry grid to browse indexed documents
- **Bookmarks** — Save frequently accessed documents (1-5 slots)
- **Real-time feedback** — Search syntax validation as you type

📄 [See all features →](docs/features/README.md)

---

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Ollama](https://ollama.com) (optional, for AI summaries)

### Run with Docker

```bash
git clone https://github.com/SourceBox-LLC/SearchBox.git
cd SearchBox
docker compose up -d
```

Open **http://localhost:5000** in your browser.

The container bundles Meilisearch, the compiled C++ extractor, and all Python dependencies. Your home directory, `/mnt`, and `/media` are mounted read-only so SearchBox can index files from anywhere on your system.

### Platform-Specific Setup

**Linux/macOS:**
```bash
docker compose up -d
```

**Windows:**
1. Enable drive sharing in Docker Desktop (Settings → Resources → File sharing)
2. Run with Windows override:
```bash
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d
```

📄 [Complete installation guide →](docs/getting-started/installation.md)

---

## Deployment Options

| Option | Best For | Cost | Setup Time | Link |
|--------|----------|------|------------|------|
| **Self-Hosted** | Individuals, technical teams | Free | 5 min | [Guide](docs/deployment/self-hosted.md) |
| **Cloud** (Coming Soon) | Teams, non-technical users | From $19/mo | Instant | [Waitlist](#) |

> ☁️ **SearchBox Cloud** — Managed hosting with team features, automatic backups, and priority support.
> 
> - ✅ No setup required
> - ✅ Automatic backups & updates
> - ✅ Team collaboration tools
> - ✅ 99.9% uptime SLA
> - ✅ Priority email support
> 
> **Starting at $19/month** (includes 3 users, 100GB storage)
> 
> [Join the waitlist →](#)

---

## Documentation

### Getting Started
- [Quick Start](docs/getting-started/quickstart.md) — Get running in 5 minutes
- [Installation](docs/getting-started/installation.md) — Detailed setup instructions
- [Your First Search](docs/getting-started/first-search.md) — Complete tutorial

### Features
- [Search Capabilities](docs/features/search.md) — Advanced search syntax
- [Encrypted Vault](docs/features/vault.md) — Secure storage for sensitive docs
- [Bookmarks](docs/features/bookmarks.md) — Quick access to documents
- [AI Summaries](docs/features/ai-summaries.md) — Ollama integration

### Deployment
- [Self-Hosted Guide](docs/deployment/self-hosted.md) — Production deployment
- [Docker](docs/deployment/docker.md) — Container setup
- [Production Hardening](docs/deployment/production.md) — Security & optimization

### Reference
- [API Documentation](docs/api/README.md) — Complete API reference
- [Architecture](docs/architecture/overview.md) — System design
- [Security](docs/architecture/security.md) — Security architecture

### Other
- [Troubleshooting](docs/troubleshooting/README.md) — Common issues
- [Contributing](docs/contributing/README.md) — How to contribute
- [License](docs/license/README.md) — AGPL-3.0-or-later

---

## Architecture

SearchBox uses a multi-stage Docker build:

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP
┌──────▼──────┐
│  SearchBox  │
│   (Flask)   │
│             │
│ ┌─────────┐ │
│ │  Auth   │ │
│ │Middleware│ │
│ └─────────┘ │
└──────┬──────┘
       │
  ┌────┴────┐
  │         │
┌─▼────┐ ┌─▼──────┐
│Meili-│ │ SQLite  │
│search│ │ (Settings)│
│      │ │         │
│Index │ │Users    │
└──────┘ └─────────┘
    │         │
    │         │
┌───▼──────────▼───┐
│  File Storage    │
│  (Volumes/Vault) │
└──────────────────┘
```

### C++ Extraction Engine

SearchBox uses a custom C++ binary (`doc_extractor`) for fast document processing. Built with:

| Library | Purpose |
|---------|---------|
| MuPDF | PDF text and image extraction |
| libzip | DOCX/XLSX decompression |
| pugixml | XML parsing for DOCX/XLSX content |
| Gumbo | HTML parsing and text extraction |
| libzim | ZIM archive reading |
| librsvg + cairo | SVG rasterization to JPEG |

📄 [Architecture deep-dive →](docs/architecture/overview.md)

---

## Supported File Types

| Type | Extensions | Extraction Method |
|------|------------|-------------------|
| Documents | `.pdf`, `.docx`, `.doc`, `.xlsx` | C++ (MuPDF/libzip/pugixml) |
| Web | `.html`, `.htm` | C++ (Gumbo) |
| Text | `.txt`, `.md` | Native Python |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp` | Metadata indexing |
| Archives | `.zim`, `.zip` | Parallel processing |

---

## Security

| Feature | Implementation |
|---------|----------------|
| **Session auth** | PIN verified once per session, 30-minute timeout, server-side storage |
| **CSRF protection** | Flask-WTF CSRF tokens on all state-changing requests |
| **Rate limiting** | 5 PIN attempts per IP, 5-minute lockout |
| **Input validation** | `secure_filename()` on uploads, Meilisearch filter injection prevention |
| **SSRF guards** | Ollama URL validation |
| **No external requests** | Everything runs locally — nothing leaves your machine |

📄 [Security details →](docs/architecture/security.md)

---

## License

SearchBox is licensed under **AGPL-3.0-or-later**.

### What This Means

✅ **You can:**
- Use SearchBox for personal or commercial projects
- Modify the source code
- Distribute copies
- Run as a service for your organization

❌ **You must:**
- Open-source any modifications you distribute
- Provide source code to users if you run SearchBox as a public service
- Use the same AGPL license for derivative works

📄 [License explained →](docs/license/agpl-explained.md)

### Commercial Licensing

Need to use SearchBox without AGPL requirements? We offer commercial licenses for:
- Enterprise deployments
- SaaS integration
- White-label solutions
- Custom development

📄 [Commercial licensing →](docs/license/commercial.md)

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](docs/contributing/README.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test all pages (`/`, `/settings`, `/view`, `/images`, `/explore`)
5. Open a pull request

---

## Community

- 💬 [Discord](https://discord.gg/placeholder) — Chat with other users
- 🐛 [GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues) — Report bugs
- 💡 [GitHub Discussions](https://github.com/SourceBox-LLC/SearchBox/discussions) — Ask questions

---

## Acknowledgments

SearchBox is built on these amazing open-source projects:

- **[Meilisearch](https://www.meilisearch.com/)** — Lightning-fast search engine
- **[MuPDF](https://mupdf.com/)** — PDF parsing library
- **[Ollama](https://ollama.com/)** — Local AI model runner
- **[Flask](https://flask.palletsprojects.com/)** — Python web framework
- **[libzim](https://openzim.org/)** — ZIM archive library
- **[Cairo](https://www.cairographics.org/)** — Graphics library for SVG rendering

---

## Stargazers

If you find SearchBox useful, please consider giving it a star ⭐ — it helps others discover the project!

[![Star History Chart](https://api.star-history.com/svg?repos=SourceBox-LLC/SearchBox&type=Date)](https://star-history.com/#SourceBox-LLC/SearchBox&Date)

---

<div align="center">

**Made with ❤️ by [SourceBox LLC](https://sourcebox.ai)**

[Documentation](docs/) · [Quick Start](docs/getting-started/quickstart.md) · [License](LICENSE) · [Contributing](docs/contributing/README.md)

</div>
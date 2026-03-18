# SearchBox Documentation

Welcome to SearchBox's comprehensive documentation. This documentation hub provides guides for deployment, features, architecture, and contribution.

> **Navigation:** [Documentation Home](README.md)

---

## 🚀 Getting Started

New to SearchBox? Start here to get up and running quickly.

| Guide | Description | Time |
|-------|-------------|------|
| [Quick Start](getting-started/quickstart.md) | Get SearchBox running in 5 minutes | 5 min |
| [Installation](getting-started/installation.md) | Detailed installation instructions | 10 min |
| [Your First Search](getting-started/first-search.md) | Tutorial on using SearchBox | 15 min |

---

## 📦 Deployment

Deploy SearchBox in your environment.

| Guide | Best For | Difficulty |
|-------|----------|------------|
| [Self-Hosted Guide](deployment/self-hosted.md) | Individuals, technical teams | Easy |
| [Docker Deployment](deployment/docker.md) | Container deployment | Easy |
| [Production Hardening](deployment/production.md) | Production environments | Intermediate |
| [Cloud Hosting](deployment/cloud.md) | Teams, managed hosting | Easy |

---

## ⭐ Features

Learn about SearchBox capabilities and how to use them.

| Feature | Description | Link |
|---------|-------------|------|
| Full-Text Search | Search across PDFs, docs, images, and more | [Search](features/search.md) |
| Encrypted Vault | AES-256-GCM encrypted storage | [Vault](features/vault.md) |
| Bookmarks | Save frequently accessed documents | [Bookmarks](features/bookmarks.md) |
| AI Summaries | Optional Ollama integration | [AI](features/ai-summaries.md) |
| Folder Indexing | Background folder processing | [Folders](features/folder-indexing.md) |
| qBittorrent | Index completed downloads | [qBittorrent](features/qbittorrent.md) |

---

## 🏗️ Architecture

Technical deep-dive into SearchBox internals.

| Topic | Description | Audience |
|-------|-------------|----------|
| [System Overview](architecture/overview.md) | High-level architecture | All |
| [Database Schema](architecture/database.md) | SQLite database structure | Developers |
| [C++ Extractor](architecture/extractor.md) | Document extraction engine | Developers |
| [Security](architecture/security.md) | Security architecture & practices | All |

---

## 🔌 API Reference

Developer resources for the SearchBox API.

| Resource | Description | Link |
|----------|-------------|------|
| [API Overview](api/README.md) | Introduction to the API | [Guide](api/README.md) |
| [Endpoints](api/endpoints.md) | Complete API reference | [Reference](api/endpoints.md) |
| [Examples](api/examples.md) | Usage examples | [Examples](api/examples.md) |

---

## 🔧 Troubleshooting

Get help with common issues and questions.

| Resource | Description | Link |
|----------|-------------|------|
| [Common Issues](troubleshooting/common-issues.md) | Solutions to frequent problems | [Guide](troubleshooting/common-issues.md) |
| [FAQ](troubleshooting/faq.md) | Frequently asked questions | [FAQ](troubleshooting/faq.md) |
| [Debugging](troubleshooting/debugging.md) | Debug guide | [Guide](troubleshooting/debugging.md) |

---

## 🤝 Contributing

Contribute to SearchBox development.

| Guide | Description | Link |
|-------|-------------|------|
| [Overview](contributing/README.md) | How to contribute | [Guide](contributing/README.md) |
| [Development Setup](contributing/setup.md) | Set up dev environment | [Guide](contributing/setup.md) |
| [Code Style](contributing/code-style.md) | Coding guidelines | [Guide](contributing/code-style.md) |
| [Testing](contributing/testing.md) | Testing guidelines | [Guide](contributing/testing.md) |
| [PR Process](contributing/pr-process.md) | Pull request workflow | [Guide](contributing/pr-process.md) |

---

## ⚖️ License

Legal information about SearchBox licensing.

| Document | Description | Link |
|----------|-------------|------|
| [Overview](license/README.md) | License information | [Guide](license/README.md) |
| [AGPL Explained](license/agpl-explained.md) | AGPL requirements simplified | [Guide](license/agpl-explained.md) |
| [Commercial License](license/commercial.md) | Commercial licensing options | [Guide](license/commercial.md) |

---

## 💬 Community

Join the SearchBox community.

| Resource | Description | Link |
|----------|-------------|------|
| [Community Hub](community/README.md) | Community overview | [Guide](community/README.md) |
| [Code of Conduct](community/code-of-conduct.md) | Community guidelines | [Guide](community/code-of-conduct.md) |
| [Getting Support](community/support.md) | How to get help | [Guide](community/support.md) |

---

## Quick Reference

| Need | Go To |
|------|-------|
| Install SearchBox | [Quick Start](getting-started/quickstart.md) |
| Report a bug | [GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues) |
| Ask a question | [Discussions](https://github.com/SourceBox-LLC/SearchBox/discussions) |
| Commercial license | [Commercial License](license/commercial.md) |
| Security issue | [Security Policy](architecture/security.md#vulnerability-reporting) |
| API documentation | [API Reference](api/README.md) |
| Deployment guide | [Self-Hosted](deployment/self-hosted.md) |

---

## Documentation Structure

```
docs/
├── README.md                    # This file (documentation hub)
├── getting-started/             # Quickstart guides
├── deployment/                  # Deployment guides
├── features/                    # Feature documentation
├── architecture/                # Technical architecture
├── api/                         # API documentation
├── troubleshooting/             # Troubleshooting guides
├── contributing/                # Contribution guides
├── license/                     # License documentation
└── community/                   # Community resources
```

---

## Search Documentation

Use GitHub search or browse the categories above. All documentation is in Markdown and can be read directly in the repository.

---

**Last updated:** March 2026  
**License:** [AGPL-3.0-or-later](../LICENSE)

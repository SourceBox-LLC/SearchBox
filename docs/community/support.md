# Support

Getting help with SearchBox.

> **Navigation:** [Documentation](../README.md) > [Community](README.md) > [Support](support.md)

---

## Quick Links

| Need | Resource |
|------|----------|
| **Bug Report** | [GitHub Issues](https://github.com/SourceBox-LLC/SearchBox/issues) |
| **Question** | [GitHub Discussions](https://github.com/SourceBox-LLC/SearchBox/discussions) |
| **Security Issue** | security@sourcebox.dev |
| **Documentation** | [docs/](../README.md) |

---

## Free Support

### GitHub Discussions

Best for:
- How-to questions
- Configuration help
- Best practices
- General discussion

**Response time:** Community-driven, typically 1-3 days.

**How to use:**
1. Search existing discussions
2. Create a new discussion with details
3. Tag appropriately (Q&A, Ideas, etc.)

### GitHub Issues

Best for:
- Bug reports
- Feature requests
- Documentation issues

**Response time:** 1-5 business days.

**Before opening an issue:**
1. Search existing issues
2. Check documentation
3. Try the latest version
4. Gather information:
   - Version numbers
   - Operating system
   - Steps to reproduce
   - Error messages
   - Logs

---

## Enterprise Support

For organizations using SearchBox in production:

### Available Plans

| Plan | Response Time | Channels |
|------|---------------|----------|
| **Basic** (free) | Community | GitHub |
| **Professional** | 24 hours | Email, GitHub |
| **Enterprise** | 4 hours | Priority email, dedicated contact |

### Professional Features

- Priority issue handling
- Direct email support
- Security advisories
- Implementation guidance

### Enterprise Features

All of Professional plus:
- Dedicated support contact
- Phone support
- Custom SLAs
- On-site consulting (optional)

**Contact:** enterprise@sourcebox.dev

---

## Security Support

Found a security vulnerability?

**Do NOT:**
- Open a public issue
- Discuss in public forums
- Share details publicly

**DO:**
- Email security@sourcebox.dev
- Include:
  - Description of the vulnerability
  - Steps to reproduce
  - Potential impact
  - Your contact information

We follow responsible disclosure:
1. We acknowledge within 48 hours
2. We investigate and validate
3. We develop a fix
4. We notify you of the timeline
5. We release the fix
6. We coordinate public disclosure

See [Security Policy](../architecture/security.md) for details.

---

## Common Issues

### Installation Problems

**"uv sync fails"**
```bash
# Try clean install
rm -rf .venv
uv sync
```

**"Meilisearch won't start"**
```bash
# Check if port is in use
lsof -i :7700

# Check logs
meilisearch --master-key dev-key --log-level debug
```

### Configuration Issues

**"Settings not saving"**
- Check file permissions on `instance/`
- Ensure database is writable

**"Search not returning results"**
- Index may be empty — try indexing a folder
- Check Meilisearch connection

### Vault Issues

**"Can't unlock vault"**
- PIN must be exactly 4 digits
- Check rate limiting (5 attempts, then 5-minute lockout)

**"Files won't decrypt"**
- Ensure vault is unlocked
- Check if file exists in `vault/`

### Performance Issues

**"Slow search"**
- Check Meilisearch memory
- Limit search filters
- Consider index optimization

**"High memory usage"**
- Reduce concurrent operations
- Check for memory leaks
- Restart services

---

## Getting Help Guidelines

### Provide Context

**Bad:**
> "It doesn't work"

**Good:**
> "SearchBox 1.2.0 on Ubuntu 22.04. When I try to upload a PDF via the web UI, I get '413 Payload Too Large'. I've checked nginx config and client_max_body_size is set to 100M."

### Show Your Work

Include what you've tried:
1. What did you expect?
2. What actually happened?
3. What have you tried so far?
4. What does the documentation say?

### Share Logs

```bash
# Check SearchBox logs
docker compose logs searchbox

# Check Meilisearch logs
docker compose logs meilisearch

# Check system logs
journalctl -u searchbox -f
```

---

## Feature Requests

Have an idea? We'd love to hear it!

### Before Requesting

1. Check existing discussions
2. Check the roadmap
3. Consider scope

### Template

```markdown
**Problem:**
What problem does this solve?

**Solution:**
Describe your proposed solution.

**Alternatives:**
What alternatives have you considered?

**Impact:**
How would this benefit users?
```

### Process

1. Submit to GitHub Discussions
2. Community feedback
3. Maintainer review
4. Added to roadmap (if accepted)

---

## Stay Updated

- **GitHub Releases:** Watch the repository
- **Discussions:** Participate in announcements
- **Twitter/X:** Follow for updates (coming soon)

---

**Previous:** [Code of Conduct](code-of-conduct.md)
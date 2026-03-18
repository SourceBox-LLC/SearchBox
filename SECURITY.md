# Security Policy

## Supported Versions

| Version | Supported | Notes |
| ------- | --------- | ----- |
| 2.3.x   | ✅ | Current release |
| 2.2.x   | ✅ | Security fixes only |
| < 2.2   | ❌ | End of life |

## Security Architecture

SearchBox is designed with security as a core principle:

### Data Privacy
- **Local-first** — All processing happens on your infrastructure
- **No telemetry** — No data sent to external servers
- **No analytics** — No usage tracking
- **No phone-home** — No background connections

### Encryption
- **Vault** — AES-256-GCM encryption for sensitive files
- **Key derivation** — PBKDF2 with 100,000 iterations
- **Per-file keys** — Unique encryption key per file
- **No key storage** — PIN is never stored; only verification hash

### Authentication
- **Session-based** — PIN verified once per session
- **Rate limiting** — 5 attempts per IP, 5-minute lockout
- **CSRF protection** — Flask-WTF tokens on state-changing requests
- **Session timeout** — 30-minute default

### Input Validation
- **Path traversal prevention** — All file paths validated
- **SQL injection prevention** — SQLAlchemy parameterized queries
- **Filter injection prevention** — Meilisearch filters sanitized
- **File type validation** — Only allowed extensions processed

## Reporting a Vulnerability

### How to Report

**Do NOT create a public GitHub issue.** Instead:

1. **Email:** security@sourcebox.dev
2. **Subject:** `[SECURITY] Brief description`
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your contact information

### What to Expect

| Timeline | Response |
|----------|----------|
| 48 hours | Acknowledgment |
| 7 days | Initial assessment |
| 30 days | Target fix timeline |
| 90 days | Maximum disclosure timeline |

### Disclosure Process

1. Report received and acknowledged
2. Vulnerability validated and severity assessed
3. Fix developed and tested
4. Fix released (patch version)
5. CVE requested (if applicable)
6. Public disclosure after 90 days or fix release

### Safe Harbor

We support responsible disclosure. If you act in good faith:
- We will not pursue legal action
- We will credit you in the disclosure (if desired)
- We will work with you to resolve the issue

### Out of Scope

The following are explicitly out of scope:
- Denial of service attacks
- Social engineering
- Physical attacks on infrastructure
- Vulnerabilities in third-party dependencies (report to upstream)
- Vulnerabilities requiring physical access

## Third-Party Security

### Dependencies

SearchBox uses these third-party components:
- **Flask** — Web framework
- **SQLAlchemy** — ORM
- **Meilisearch** — Search engine
- **MuPDF** — PDF processing
- **libzim** — ZIM archive handling
- **Cryptography** — Encryption library

Report vulnerabilities in these dependencies to their respective maintainers.

### Security Updates

We monitor:
- GitHub Dependabot alerts
- PyPI security advisories
- CVE databases for dependencies

## Security Best Practices

### Self-Hosted Deployment

For production deployments:

1. **Change default secrets**
   ```bash
   # Generate secure keys
   FLASK_SECRET_KEY=$(openssl rand -hex 32)
   MEILI_MASTER_KEY=$(openssl rand -hex 16)
   ```

2. **Enable HTTPS**
   - Use Let's Encrypt with nginx/Caddy
   - Never expose HTTP to the internet

3. **Restrict file access**
   - Only mount directories that need indexing
   - Use read-only mounts where possible

4. **Keep updated**
   - Monitor releases for security fixes
   - Update Meilisearch regularly

5. **Configure firewall**
   ```bash
   # Only expose web port
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

### Vault Security

For encrypted files:

1. **Choose a strong PIN**
   - 4-digit PIN is required
   - Avoid obvious patterns (1234, 0000)
   - There is no recovery mechanism

2. **Back up vault key**
   - Store PIN securely
   - Lost PIN = irrecoverable data

3. **Limit file upload size**
   - Configure in reverse proxy
   - Prevent resource exhaustion

## Security Contact

- **Email:** security@sourcebox.dev
- **PGP Key:** Coming soon
- **Response Time:** 48 hours for acknowledgment

## Security Hall of Fame

We thank the following researchers for responsible disclosure:

*No vulnerabilities reported yet. Be the first!*

---

**Last Updated:** March 2026
**Policy Version:** 1.0
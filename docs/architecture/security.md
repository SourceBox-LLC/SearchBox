# Security Architecture

Security design and best practices for SearchBox.

> **Navigation:** [Documentation](../README.md) > [Architecture](overview.md) > [Security](security.md)

---

## Overview

SearchBox is designed with security in mind:

- 🔐 **Encrypted vault** — AES-256-GCM for sensitive files
- 🗝️ **PIN-based access** — Only you can decrypt
- 🛡️ **Local processing** — No cloud, no external services
- 🔒 **Secure defaults** — Protected out of the box

---

## Threat Model

### What We Protect Against

| Threat | Mitigation |
|--------|-------------|
| **Disk theft** | Vault encryption with PIN |
| **Malicious files** | Safe extraction, no execution |
| **Network interception** | HTTPS, local-first |
| **Unauthorized access** | Session-based authentication |
| **Data leakage** | No telemetry, no cloud sync |

### What We Don't Protect Against

| Threat | Reason |
|--------|--------|
| **Malware on host** | Outside our control |
| **Physical keylogger** | Hardware attack |
| **System admin** | They have root access |
| **Memory dump** | Requires physical access |

---

## Encryption

### Vault Encryption

SearchBox uses **AES-256-GCM** for vault files:

```
┌─────────────────────────────────────────────────────────────┐
│                    Encryption Flow                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User enters PIN                                          │
│         │                                                    │
│         ▼                                                    │
│  2. PBKDF2(PIN + salt, 100,000 iterations)                   │
│         │                                                    │
│         ▼                                                    │
│  3. Key Encryption Key (KEK)                                  │
│         │                                                    │
│         ▼                                                    │
│  4. Unwrap Data Encryption Key (DEK)                         │
│         │                                                    │
│         ▼                                                    │
│  5. AES-256-GCM encrypt/decrypt                               │
│         │                                                    │
│         ▼                                                    │
│  6. File content                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Hierarchy

```
PIN (user input)
 │
 │ PBKDF2-SHA256, 100k iterations
 │
 ▼
KEK (Key Encryption Key)
 │
 │ AES-256-KW (Key Wrap)
 │
 ▼
DEK (Data Encryption Key)
 │
 │ AES-256-GCM
 │
 ▼
File Content (encrypted)
```

### Key Storage

```python
# VaultConfig table
class VaultConfig(db.Model):
    pin_hash = db.Column(db.LargeBinary)  # KEK verification hash
    salt = db.Column(db.LargeBinary)       # PBKDF2 salt

# EncryptedFile table
class EncryptedFile(db.Model):
    doc_id = db.Column(db.String)
    wrapped_dek = db.Column(db.LargeBinary)  # DEK wrapped by KEK
    encrypted_filename = db.Column(db.String)
    original_filename = db.Column(db.String)
```

### Why Not Store the PIN?

We use **PBKDF2 verification** instead of storing the PIN:

```python
def verify_pin(pin: str) -> bool:
    config = VaultConfig.get()
    derived_key = pbkdf2_sha256(pin, config.salt, 100000)
    return constant_time_compare(derived_key, config.pin_hash)
```

This prevents:
- Plaintext PIN storage
- Rainbow table attacks (unique salt)
- Brute-force attacks (100k iterations)

---

## Authentication

### Session Management

SearchBox uses Flask sessions:

```python
from flask import session

# Login
session['authenticated'] = True
session['vault_unlocked'] = False

# Check
if not session.get('authenticated'):
    return redirect('/login')

# Logout
session.clear()
```

### PIN Entry

PIN is required only for vault operations:

```python
@app.route('/vault/unlock', methods=['POST'])
def unlock_vault():
    pin = request.form.get('pin')
    
    if verify_pin(pin):
        # Derive KEK and cache in session
        session['kek'] = derive_kek(pin)
        session['vault_unlocked'] = True
        return {'status': 'ok'}
    
    return {'error': 'Invalid PIN'}, 401
```

### Security Considerations

| Aspect | Implementation |
|--------|----------------|
| **PIN in memory** | Only during unlock, then cleared |
| **KEK caching** | Stored in session (server-side) |
| **Session timeout** | Configurable, default 1 hour |
| **Failed attempts** | Rate limiting per IP |

---

## Data Flow

### Adding File to Vault

```
┌─────────────────────────────────────────────────────────────┐
│                  Add to Vault Flow                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User uploads file, enters PIN                            │
│         │                                                    │
│         ▼                                                    │
│  2. Generate random DEK (32 bytes)                           │
│         │                                                    │
│         ▼                                                    │
│  3. Encrypt file with DEK using AES-256-GCM                  │
│         │                                                    │
│         ▼                                                    │
│  4. Wrap DEK with KEK (derived from PIN)                     │
│         │                                                    │
│         ▼                                                    │
│  5. Store:                                                   │
│     - Encrypted file (vault/<uuid>.enc)                      │
│     - Wrapped DEK (database)                                 │
│     - Original filename (database)                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Retrieving File from Vault

```
┌─────────────────────────────────────────────────────────────┐
│                Retrieve from Vault Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User requests file, vault must be unlocked               │
│         │                                                    │
│         ▼                                                    │
│  2. Get wrapped DEK from database                            │
│         │                                                    │
│         ▼                                                    │
│  3. Unwrap DEK with KEK (from session)                       │
│         │                                                    │
│         ▼                                                    │
│  4. Decrypt file with DEK                                    │
│         │                                                    │
│         ▼                                                    │
│  5. Return decrypted file to user                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Safety

### Document Extraction Safety

The extractor runs in **isolation**:

```python
def safe_extract(file_path: str) -> dict:
    """Extract text with security constraints."""
    return subprocess.run(
        ["doc_extractor", "extract", file_path],
        timeout=60,          # Prevent hanging
        capture_output=True,
        check=False
    )
```

**Security features:**
- No code execution from documents
- Memory limits prevent OOM
- Timeout prevents infinite loops
- Sandbox potential (future)

### File Type Validation

```python
ALLOWED_EXTENSIONS = {
    'pdf', 'docx', 'pptx', 'xlsx',
    'epub', 'html', 'txt', 'md',
    'zim', 'zip'
}

def is_safe_file(filename: str) -> bool:
    ext = filename.rsplit('.', 1)[-1].lower()
    return ext in ALLOWED_EXTENSIONS
```

### Path Traversal Prevention

```python
def safe_path(base_dir: str, user_path: str) -> str:
    """Resolve path and ensure it's under base_dir."""
    full_path = os.path.realpath(os.path.join(base_dir, user_path))
    base_real = os.path.realpath(base_dir)
    
    if not full_path.startswith(base_real):
        raise SecurityError("Path traversal detected")
    
    return full_path
```

---

## Network Security

### HTTPS (Production)

Always use HTTPS in production:

```nginx
server {
    listen 443 ssl http2;
    
    ssl_certificate /etc/letsencrypt/live/domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domain/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
}
```

### Security Headers

```python
# Flask-Talisman or manual headers
@app.after_request
def add_security_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Content-Security-Policy'] = "default-src 'self'"
    return response
```

### CORS

For self-hosted instances, CORS is disabled by default:

```python
# Only enable if needed
CORS(app, origins=['https://your-domain.com'])
```

---

## Secrets Management

### Environment Variables

Never commit secrets to git:

```bash
# .env (DO NOT COMMIT)
FLASK_SECRET_KEY=your-64-char-hex-key
MEILI_MASTER_KEY=your-32-char-hex-key
```

### Generating Secrets

```bash
# Flask secret key (64 hex chars = 32 bytes)
openssl rand -hex 32

# Meilisearch master key (32 hex chars = 16 bytes)
openssl rand -hex 16
```

### Docker Secrets

For production Docker deployments:

```yaml
services:
  searchbox:
    secrets:
      - flask_secret_key
      - meili_master_key
    environment:
      - FLASK_SECRET_KEY_FILE=/run/secrets/flask_secret_key
      - MEILI_MASTER_KEY_FILE=/run/secrets/meili_master_key

secrets:
  flask_secret_key:
    external: true
  meili_master_key:
    external: true
```

---

## Database Security

### SQLite File Permissions

```bash
# Restrict database access
chmod 600 instance/searchbox.db
chmod 700 instance/
```

### SQL Injection Prevention

SearchBox uses SQLAlchemy ORM — all queries are parameterized:

```python
# Safe
folder = IndexedFolder.query.filter_by(folder_path=path).first()

# Never do this
# cursor.execute(f"SELECT * FROM folders WHERE path = '{path}'")
```

### Backup Security

```bash
# Encrypt backups
gpg --symmetric --cipher-algo AES256 \
    --output searchbox.db.gpg \
    searchbox.db
```

---

## Monitoring & Logging

### Audit Logging

```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Log security events
def log_security_event(event_type: str, details: dict):
    logging.warning(f"SECURITY: {event_type} - {details}")
```

**Log events:**
- Failed login attempts
- Vault unlock attempts
- File uploads
- Setting changes

### No Telemetry

SearchBox does **not** collect any telemetry:
- No usage analytics
- No error reporting to external services
- No phone-home functionality
- Complete privacy

---

## Security Checklist

### Self-Hosted

- [ ] Change `FLASK_SECRET_KEY` from default
- [ ] Change `MEILI_MASTER_KEY` from default
- [ ] Enable HTTPS (Let's Encrypt)
- [ ] Set file permissions (`chmod 600 instance/searchbox.db`)
- [ ] Configure firewall (block ports 5000, 7700)
- [ ] Set strong vault PIN
- [ ] Disable debug mode (`FLASK_DEBUG=0`)
- [ ] Enable rate limiting (nginx)

### Cloud

All of the above plus:
- [ ] Automatic security updates enabled
- [ ] Intrusion detection configured
- [ ] Backup encryption enabled
- [ ] 2FA enabled (when available)

---

## Security Contact

Found a security vulnerability? Email **security@sourcebox.dev**

We follow responsible disclosure:
1. Report privately via email
2. We acknowledge within 48 hours
3. We investigate and fix
4. We coordinate public disclosure

---

## Next Steps

- **[Vault Feature](../features/vault.md)** — How to use encrypted storage
- **[Production Deployment](../deployment/production.md)** — Harden your instance
- **[License](../license/agpl-explained.md)** — AGPL implications

---

**Previous:** [Extractor Architecture](extractor.md)  
**Next:** [API Reference](../api/README.md)
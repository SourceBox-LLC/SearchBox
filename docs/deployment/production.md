# Production Deployment

Hardening SearchBox for production environments.

> **Navigation:** [Documentation](../README.md) > [Deployment](README.md) > [Production](production.md)

---

## Overview

Production deployment requires:

- 🔐 **Security hardening** — Authentication, HTTPS, secrets
- ⚡ **Performance tuning** — Caching, resource limits
- 📊 **Monitoring** — Logging, health checks, alerts
- 💾 **Backups** — Automated data protection

---

## Security Checklist

### Critical

- [ ] **Change all default secrets**
  - `FLASK_SECRET_KEY` (64+ characters)
  - `MEILI_MASTER_KEY` (32+ characters)
- [ ] **Enable HTTPS**
  - Reverse proxy with Let's Encrypt
  - Auto-renewal configured
- [ ] **Firewall configuration**
  - Block internal ports (5000, 7700)
  - Only expose reverse proxy (80, 443)
- [ ] **Secure database**
  - File permissions: `chmod 600 instance/searchbox.db`
  - Directory permissions: `chmod 700 instance/`

### Recommended

- [ ] **Disable debug mode**
- [ ] **Set secure cookie flags**
- [ ] **Configure CSRF protection**
- [ ] **Enable rate limiting**
- [ ] **Set up fail2ban**

---

## Reverse Proxy Setup

### nginx

```nginx
# /etc/nginx/sites-available/searchbox
server {
    listen 80;
    server_name searchbox.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name searchbox.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/searchbox.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/searchbox.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Client body size for file uploads
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/searchbox /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy

Simpler alternative with automatic HTTPS:

```caddyfile
# Caddyfile
searchbox.yourdomain.com {
    reverse_proxy localhost:5000
    
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
    }
}
```

---

## SSL/TLS Certificates

### Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d searchbox.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test renewal
sudo certbot renew --dry-run
```

### Self-Signed (Development Only)

```bash
# Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Use in nginx
ssl_certificate /path/to/cert.pem;
ssl_certificate_key /path/to/key.pem;
```

---

## Environment Secrets

### Generate Secure Secrets

```bash
# Flask secret key (64 hex characters = 32 bytes)
openssl rand -hex 32

# Meilisearch master key (32 hex characters = 16 bytes)
openssl rand -hex 16
```

### Store Secrets Securely

**Option 1: Environment file (.env)**
```bash
# .env (DO NOT commit to git)
FLASK_SECRET_KEY=your-64-char-hex-key
MEILI_MASTER_KEY=your-32-char-hex-key
```

**Option 2: Docker secrets (swarm)**
```yaml
services:
  searchbox:
    secrets:
      - flask_secret_key
      - meili_master_key

secrets:
  flask_secret_key:
    external: true
  meili_master_key:
    external: true
```

---

## Firewall Configuration

### UFW (Ubuntu)

```bash
# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### iptables

```bash
# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTP/HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Drop all other input
iptables -A INPUT -j DROP
```

---

## Performance Tuning

### Systemd Service

```ini
# /etc/systemd/system/searchbox.service
[Unit]
Description=SearchBox Document Search Engine
After=network.target meilisearch.service

[Service]
Type=simple
User=searchbox
Group=searchbox
WorkingDirectory=/opt/SearchBox
Environment="FLASK_SECRET_KEY=your-secret"
Environment="MEILI_MASTER_KEY=your-key"
ExecStart=/usr/bin/uv run gunicorn --bind 127.0.0.1:5000 --workers 4 --threads 2 app:app
Restart=always
RestartSec=10

# Resource limits
LimitNOFILE=65536
MemoryMax=4G
CPUQuota=200%

[Install]
WantedBy=multi-user.target
```

### Gunicorn Configuration

```bash
# Recommended for production
gunicorn \
  --bind 127.0.0.1:5000 \
  --workers 4 \
  --threads 2 \
  --worker-class gthread \
  --timeout 120 \
  --keep-alive 5 \
  --access-logfile /var/log/searchbox/access.log \
  --error-logfile /var/log/searchbox/error.log \
  app:app
```

### Meilisearch Tuning

```bash
# Increase heap size (default is unbounded)
meilisearch --master-key $KEY --db-path /var/lib/meilisearch &

# Environment variables
export MEILI_HTTP_PAYLOAD_SIZE_LIMIT=104857600  # 100MB
export MEILI_MAX_INDEXING_MEMORY=4294967296      # 4GB
```

---

## Monitoring & Logging

### Health Check Endpoint

SearchBox provides `/health` endpoint:

```bash
curl http://localhost:5000/health
# Returns: {"status": "healthy"}
```

### Log Rotation

```bash
# /etc/logrotate.d/searchbox
/var/log/searchbox/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 searchbox searchbox
    sharedscripts
    postrotate
        systemctl reload searchbox > /dev/null
    endscript
}
```

### Monitoring Setup

**Prometheus + Grafana:**

```yaml
# docker-compose.yml addition
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
```

---

## Backup Strategy

### Automated Backups

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/var/backups/searchbox"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
mkdir -p $BACKUP_DIR
tar czf $BACKUP_DIR/searchbox_$DATE.tar.gz \
    instance/ \
    vault/ \
    static/thumbnails/ \
    meili_data/

# Keep last 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

# Optional: Upload to S3
# aws s3 cp $BACKUP_DIR/searchbox_$DATE.tar.gz s3://your-bucket/backups/
```

**Cron job:**
```bash
# Daily backup at 2 AM
0 2 * * * /opt/SearchBox/backup.sh
```

### Restore Procedure

```bash
# Stop services
sudo systemctl stop searchbox meilisearch

# Restore
tar xzf searchbox_20240115_020000.tar.gz -C /

# Start services
sudo systemctl start meilisearch searchbox
```

---

## Scaling

### Vertical Scaling

Increase resources on single server:

```yaml
# docker-compose.yml
services:
  searchbox:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

### Horizontal Scaling (Future)

For high-availability setups:

- Use PostgreSQL instead of SQLite
- Deploy multiple SearchBox instances
- Use load balancer (nginx, HAProxy)
- Shared Meilisearch instance
- Redis for session storage

---

## Next Steps

- **[Cloud Deployment](cloud.md)** — Managed cloud version
- **[Troubleshooting](../troubleshooting/common-issues.md)** — Common issues
- **[Architecture](../architecture/overview.md)** — System design

---

**Previous:** [Docker Deployment](docker.md)  
**Next:** [Cloud Deployment](cloud.md)
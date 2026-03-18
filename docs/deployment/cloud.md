# Cloud Deployment (SourceBox Cloud)

Managed cloud version of SearchBox.

> **Navigation:** [Documentation](../README.md) > [Deployment](README.md) > [Cloud](cloud.md)

---

## Overview

SourceBox Cloud is the **managed cloud version** of SearchBox:

- ☁️ **No infrastructure management** — We handle servers, updates, backups
- 🚀 **Instant deployment** — Up and running in minutes
- 🔒 **Enterprise security** — Encrypted at rest and in transit
- 💰 **Simple pricing** — Pay for what you use
- 👥 **Team collaboration** — Invite team members to share your instance

---

## Why Cloud?

| Feature | Self-Hosted | Cloud |
|---------|-------------|-------|
| **Setup time** | 30-60 minutes | < 5 minutes |
| **Server management** | You manage | We manage |
| **Backups** | Manual setup | Automatic daily |
| **Updates** | Manual | Automatic |
| **SSL certificate** | Setup yourself | Included |
| **Team management** | Single user | Invite team |
| **Support** | Community | Priority email |
| **Cost** | Free | Paid subscription |

---

## Getting Started

### Sign Up

1. Visit **[cloud.sourcebox.dev](https://cloud.sourcebox.dev)** (coming soon)
2. Create an account
3. Choose a plan

### Create Instance

1. Click **"New Instance"**
2. Choose a name (e.g., "personal", "work")
3. Select your region
4. Click **"Create"**

### First-Time Setup

Your instance is ready! The admin user you created during signup will be the instance administrator.

### Invite Team Members

As the admin, you can invite others:
1. Go to **Settings → Team**
2. Enter email addresses
3. They'll receive an invitation link

**Team Model:**
- All team members share the same database
- The admin manages the team and controls who has access
- Everyone sees the same documents, bookmarks, and settings

---

## Features

### Included

- ✅ **Unlimited documents** — Index as many as you need
- ✅ **Team collaboration** — Invite team members
- ✅ **Automatic backups** — Daily backups with 30-day retention
- ✅ **SSL certificate** — HTTPS by default
- ✅ **99.9% uptime SLA** — For business plans
- ✅ **Email support** — Priority support queue

### Upcoming

- 🔜 **API access** — Programmatic control
- 🔜 **SSO/SAML** — Enterprise authentication
- 🔜 **Audit logs** — Security compliance
- 🔜 **Custom branding** — White-label option

---

## Pricing

> **Note:** Pricing is subject to change. Visit [cloud.sourcebox.dev](https://cloud.sourcebox.dev) for current pricing.

### Personal

For individual users:

- Single user
- 1 instance
- Basic support
- Standard backup retention

### Team

For small teams:

- Up to 10 users
- 1 instance
- Priority support
- Extended backup retention

### Business

For organizations:

- Unlimited users
- Multiple instances
- 99.9% SLA
- Premium support
- Advanced security features

---

## Security

### Data Protection

- **Encryption at rest** — AES-256
- **Encryption in transit** — TLS 1.3
- **Automatic backups** — Daily, 30-day retention
- **Geo-redundant storage** — Backups in multiple regions

### Access Control

- **Admin-only team management** — Only admins can invite/remove users
- **Session management** — Monitor active sessions
- **2FA** — Available on all accounts (coming soon)

### Infrastructure

- **Hosted on Fly.io** — Enterprise-grade infrastructure
- **Automatic updates** — Security patches applied automatically
- **Monitoring** — 24/7 uptime monitoring
- **Incident response** — Dedicated team for security issues

### Compliance

- **SOC 2 Type II** — Coming soon
- **GDPR** — Data processing agreement available
- **Data residency** — Choose your region

---

## Data Import/Export

### Import from Self-Hosted

1. Export your self-hosted data
2. Download backup from Settings → Backup
3. Upload to cloud instance
4. Documents are indexed automatically

### Export Data

1. Go to **Settings → Backup**
2. Click **"Export All Data"**
3. Download the backup file

---

## Frequently Asked Questions

### Is my data private?

Yes. Your documents are encrypted and only accessible by you and your team members. SourceBox LLC employees cannot access your data.

### Can I migrate from self-hosted to cloud?

Yes. You can export your self-hosted database and import it into the cloud version.

### Can I migrate from cloud to self-hosted?

Yes. Export your data from the cloud and import into a self-hosted instance.

### Where is my data stored?

Choose from multiple regions: US, EU, or Asia.

### What happens if I cancel?

Your data is retained for 30 days after cancellation. You can export your data before canceling or during the 30-day grace period.

### Is there a free trial?

Yes! All plans start with a 14-day free trial. No credit card required.

---

## Support

### Contact

- **Email:** support@sourcebox.dev
- **Response time:** 24-48 hours (personal), 12 hours (team), 4 hours (business)

### Resources

- **Documentation:** This site
- **Status:** status.sourcebox.dev
- **Changelog:** changelog.sourcebox.dev

---

## Next Steps

- **Sign up** at [cloud.sourcebox.dev](https://cloud.sourcebox.dev) (coming soon)
- **Compare** with [Self-Hosted](self-hosted.md)
- **Learn** about [Features](../features/README.md)

---

**Previous:** [Production Hardening](production.md)
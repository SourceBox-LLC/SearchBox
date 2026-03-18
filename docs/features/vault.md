# Encrypted Vault

Secure storage for sensitive documents with AES-256-GCM encryption.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [Vault](vault.md)

---

## Overview

The **Encrypted Vault** provides military-grade encryption for sensitive documents:

- 🔒 **AES-256-GCM encryption** — Industry-standard encryption
- 🔐 **4-digit PIN protection** — Secure access
- 🛡️ **PBKDF2 key derivation** — 600,000 iterations
- 💾 **Local storage** — Files never leave your computer
- ⏱️ **Session timeout** — Auto-lock after inactivity

---

## How It Works

### Encryption Layers

| Layer | Algorithm | Details |
|-------|-----------|---------|
| **PIN → KEK** | PBKDF2-HMAC-SHA256 | 600,000 iterations, 16-byte random salt |
| **KEK → DEK** | AES-256-GCM | Per-file random 32-byte Data Encryption Key |
| **DEK → File** | AES-256-GCM | 12-byte nonce + ciphertext + 16-byte auth tag |

### Key Hierarchy

```
User PIN
    │
    ├── PBKDF2 (600k iterations)
    │
    └── Key Encryption Key (KEK)
          │
          ├── Decrypt DEK
          │
          └── Data Encryption Key (DEK)
                │
                └── Decrypt File
```

---

## Set Up Vault

### Step 1: Access Settings

1. Open **http://localhost:5000**
2. Click **Settings** (gear icon)
3. Navigate to **Vault Security** section

### Step 2: Create PIN

1. Click **Set Up PIN**
2. Enter a 4-digit PIN
3. Confirm PIN

**PIN Requirements:**
- Exactly 4 digits
- Numbers only (0-9)
- Cannot be trivial (e.g., 1234, 0000)

**Important:** Memorize your PIN. There's no recovery option.

### Step 3: Verify Setup

After setting PIN, you'll see:
```
✓ PIN configured
Last changed: [timestamp]
```

---

## Upload to Vault

### Method 1: Upload Dialog

1. Click **Upload** button on home page
2. Select **Vault** tab
3. Click **Choose File**
4. Enter PIN to unlock
5. File uploads encrypted

### Method 2: Drag & Drop

1. Drag file onto vault upload area
2. Enter PIN when prompted
3. File uploads encrypted

### Supported File Types

Any file type can be uploaded to vault:
- Documents: PDF, DOCX, TXT, MD
- Images: JPG, PNG, GIF
- Archives: ZIP, RAR
- Any other file type

**Note:** File type doesn't matter; all files are encrypted.

---

## Access Vault Files

### Step 1: Unlock Vault

1. Click file in vault list
2. Enter PIN in unlock dialog
3. Vault unlocks for 30 minutes

### Step 2: View File

After unlocking:
- File displays in viewer
- Can open in default application
- Can reveal in file manager

### Step 3: Auto-Lock

Vault auto-locks after:
- **30 minutes** of inactivity
- Manual lock (Settings → Vault → Lock)

---

## Manage Vault Files

### View Vault Files

In Settings → Vault:
- List of all vault files
- Original filename
- Upload date
- File size

### Delete Vault File

1. Settings → Vault
2. Click delete icon next to file
3. Confirm deletion
4. File permanently removed

**Warning:** Deletion is permanent. Encrypted file is unrecoverable.

### Change PIN

1. Settings → Vault Security
2. Click **Change PIN**
3. Enter current PIN
4. Enter new PIN
5. Confirm new PIN

**Note:** All vault files are re-encrypted with new PIN.

---

## Security Details

### Storage

Files stored as:
```
vault/{doc_id}_{filename}.enc
```

- `doc_id`: Unique identifier
- `filename`: Original filename (encrypted)
- `.enc`: Encrypted file

### Temp Files

When viewing a vault file:
1. File decrypted to temp directory
2. Opened in viewer/application
3. Temp file deleted after **30 seconds**

### PIN Storage

PIN is **never** stored:
- Hash stored (PBKDF2)
- Hash cannot be reversed
- No recovery possible

### Session Storage

- PIN cached in session (encrypted)
- Session expires after 30 minutes
- PIN cleared from memory on logout

---

## Best Practices

### PIN Security

✅ **Do:**
- Use a memorable PIN
- Change PIN if compromised
- Keep PIN private

❌ **Don't:**
- Use 1234, 0000, 1111
- Write PIN down
- Share PIN with others

### File Management

✅ **Do:**
- Back up important vault files (unencrypted)
- Test PIN after setting
- Lock vault when done

❌ **Don't:**
- Store only copy in vault
- Forget PIN
- Upload huge files (>100MB)

---

## Troubleshooting

### PIN Not Working

**Symptom:** PIN not accepted

**Cause:**
- Wrong PIN entered
- PIN changed
- PIN not set

**Solution:**
- Verify PIN is correct
- Check if PIN was changed
- Reset PIN (requires current PIN)

### Forgot PIN

**Symptom:** Cannot remember PIN

**Cause:** No recovery mechanism

**Solution:** 
- **No recovery** — PIN cannot be retrieved
- Factory reset (Settings → Factory Reset) clears everything

**Prevention:**
- Memorize PIN
- Store backup in password manager
- Don't lose PIN

### File Won't Decrypt

**Symptom:** Error decrypting file

**Cause:**
- Wrong PIN
- Corrupted file
- Encrypted file missing

**Solution:**
- Verify PIN is correct
- Check vault directory exists
- Ensure `vault/` directory has read access

### Session Timeout Too Short

**Symptom:** Vault locks frequently

**Cause:** Session timeout setting

**Solution:**
- Re-enter PIN
- Session timeout is fixed (30 min)

---

## API Reference

### Check Vault Status

```bash
GET /api/vault/status
```

**Response:**
```json
{
  "has_pin": true,
  "is_unlocked": false,
  "files_count": 5
}
```

### Set Up PIN

```bash
POST /api/vault/setup
Content-Type: application/json

{
  "pin": "1234"
}
```

### Verify PIN

```bash
POST /api/vault/verify
Content-Type: application/json

{
  "pin": "1234"
}
```

### Upload to Vault

```bash
POST /api/upload
Content-Type: multipart/form-data

file: <file>
vault: true
```

---

## Related Features

- **[Bookmarks](bookmarks.md)** — Save frequently accessed documents
- **[Security Architecture](../architecture/security.md)** — Technical security details

---

## Next Steps

- **[Bookmarks](bookmarks.md)** — Quick access to documents
- **[AI Summaries](ai-summaries.md)** — Intelligent search summaries
- **[Security](../architecture/security.md)** — Learn more about encryption

---

**Previous:** [Search](search.md)  
**Next:** [Bookmarks](bookmarks.md)
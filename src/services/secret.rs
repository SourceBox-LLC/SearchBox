//! At-rest protection for small persisted secrets (currently the qBittorrent
//! Web-UI password).
//!
//! The value is AES-256-GCM-encrypted under a per-install key kept in a separate
//! file (`<base_dir>/secret.key`, owner-only on Unix), so the secret no longer
//! sits in plaintext inside `searchbox.db`: a leaked, backed-up, or cloud-synced
//! copy of the database alone can't reveal it. An attacker who copies the entire
//! data directory also gets the key file — that exposure is the same as for the
//! vault dir itself and is bounded by the directory's filesystem permissions.
//!
//! Stored values are tagged `enc:v1:<hex>`. A value without that tag is treated
//! as legacy plaintext and returned as-is, so existing installs keep working
//! until the secret is next saved (which re-encrypts it).

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};

use crate::vault::crypto;

const PREFIX: &str = "enc:v1:";

fn key_path(base_dir: &Path) -> PathBuf {
    base_dir.join("secret.key")
}

/// Load the per-install key, creating it (32 random bytes) on first use.
fn load_or_create_key(base_dir: &Path) -> Result<[u8; 32]> {
    let path = key_path(base_dir);
    if let Ok(bytes) = std::fs::read(&path) {
        if bytes.len() == 32 {
            let mut k = [0u8; 32];
            k.copy_from_slice(&bytes);
            return Ok(k);
        }
    }
    let key = crypto::generate_dek(); // 32 cryptographically-random bytes
    std::fs::create_dir_all(base_dir).ok();
    write_owner_only(&path, &key).context("write secret.key")?;
    Ok(key)
}

#[cfg(unix)]
fn write_owner_only(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    f.write_all(bytes)
}

#[cfg(not(unix))]
fn write_owner_only(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    // On Windows the file inherits the per-user ACL of %LOCALAPPDATA%\SearchBox,
    // which already denies read access to other standard users.
    std::fs::write(path, bytes)
}

/// Encrypt a secret for storage. Returns a tagged `enc:v1:<hex>` string.
pub fn protect(base_dir: &Path, plaintext: &str) -> Result<String> {
    let key = load_or_create_key(base_dir)?;
    let blob = crypto::encrypt_bytes(&key, plaintext.as_bytes())?;
    Ok(format!("{PREFIX}{}", hex::encode(blob)))
}

/// Decrypt a stored secret. An untagged value is returned unchanged (legacy
/// plaintext), so old installs keep working until the value is re-saved.
pub fn reveal(base_dir: &Path, stored: &str) -> Result<String> {
    let Some(hexed) = stored.strip_prefix(PREFIX) else {
        return Ok(stored.to_string());
    };
    let key = load_or_create_key(base_dir)?;
    let blob = hex::decode(hexed).map_err(|e| anyhow!("decode secret: {e}"))?;
    let pt = crypto::decrypt_bytes(&key, &blob)?;
    String::from_utf8(pt).map_err(|e| anyhow!("secret not valid utf-8: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protect_then_reveal_round_trips() {
        let dir = std::env::temp_dir().join(format!("sb-secret-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let enc = protect(&dir, "hunter2").unwrap();
        assert!(enc.starts_with(PREFIX), "stored value is tagged");
        assert!(!enc.contains("hunter2"), "plaintext is not present");
        assert_eq!(reveal(&dir, &enc).unwrap(), "hunter2");

        // Legacy untagged plaintext passes through unchanged.
        assert_eq!(
            reveal(&dir, "plain-old-password").unwrap(),
            "plain-old-password"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}

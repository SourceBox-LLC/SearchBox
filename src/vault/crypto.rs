//! Vault crypto — mirrors `utils/crypto.py`.
//!
//! Layout:
//! - KEK (Key-Encryption Key): 32 bytes derived from the admin password
//!   via PBKDF2-HMAC-SHA256, 600_000 iterations, per-install salt.
//! - DEK (Data-Encryption Key): 32 random bytes per file.
//! - File payload: AES-256-GCM, 12-byte random nonce prefix, ciphertext, tag.
//! - Wrapped DEK: AES-256-GCM under the KEK, nonce prefix + ciphertext + tag.

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, Nonce};
use anyhow::{anyhow, Context, Result};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

pub const KEK_ITERATIONS: u32 = 600_000;
pub const KEK_LEN: usize = 32;
pub const DEK_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;

/// Generate a random salt for PBKDF2. Store once per install in
/// `vault_config.salt`.
pub fn generate_salt() -> [u8; 16] {
    use rand::RngCore;
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

/// Derive the 32-byte KEK from an admin password.
pub fn derive_kek(password: &str, salt: &[u8]) -> [u8; KEK_LEN] {
    let mut out = [0u8; KEK_LEN];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, KEK_ITERATIONS, &mut out);
    out
}

/// Generate a fresh random DEK.
pub fn generate_dek() -> [u8; DEK_LEN] {
    use rand::RngCore;
    let mut dek = [0u8; DEK_LEN];
    rand::thread_rng().fill_bytes(&mut dek);
    dek
}

/// Wrap (encrypt) a DEK under the KEK. Returns `nonce || ciphertext+tag`.
pub fn wrap_dek(kek: &[u8; KEK_LEN], dek: &[u8; DEK_LEN]) -> Result<Vec<u8>> {
    aead_encrypt(kek, dek)
}

/// Unwrap (decrypt) a wrapped DEK using the KEK.
pub fn unwrap_dek(kek: &[u8; KEK_LEN], wrapped: &[u8]) -> Result<[u8; DEK_LEN]> {
    let plain = aead_decrypt(kek, wrapped)?;
    plain
        .as_slice()
        .try_into()
        .map_err(|_| anyhow!("unwrapped DEK has wrong length"))
}

/// Encrypt a plaintext buffer under the DEK. Output is `nonce || ct+tag`.
pub fn encrypt_bytes(dek: &[u8; DEK_LEN], plaintext: &[u8]) -> Result<Vec<u8>> {
    aead_encrypt(dek, plaintext)
}

pub fn decrypt_bytes(dek: &[u8; DEK_LEN], ciphertext: &[u8]) -> Result<Vec<u8>> {
    aead_decrypt(dek, ciphertext)
}

fn aead_encrypt(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| anyhow!("aes-gcm encrypt: {e}"))?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ct);
    Ok(out)
}

fn aead_decrypt(key: &[u8], blob: &[u8]) -> Result<Vec<u8>> {
    if blob.len() < NONCE_LEN {
        return Err(anyhow!("ciphertext shorter than nonce"));
    }
    let (nonce_bytes, ct) = blob.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ct)
        .map_err(|e| anyhow!("aes-gcm decrypt: {e}"))
        .context("vault decrypt")
}

/// A fresh random 32-byte key for sealing vault KEKs in memory for this process.
/// Regenerated every start, so anything it sealed becomes undecryptable across a
/// restart (the vault then re-locks until the user unlocks it).
pub fn generate_seal_key() -> [u8; KEK_LEN] {
    generate_dek()
}

/// Seal a KEK under the process-ephemeral seal key, so the value we persist into
/// the (on-disk) session store is useless to anyone who copies the data dir.
/// Returns hex of `nonce || ciphertext+tag`.
pub fn seal_kek(seal_key: &[u8; KEK_LEN], kek: &[u8; KEK_LEN]) -> Result<String> {
    Ok(hex::encode(aead_encrypt(seal_key, kek)?))
}

/// Unseal a KEK previously produced by [`seal_kek`]. Returns `Err` if the seal
/// key differs (e.g. the process restarted) — callers treat that as "locked".
pub fn unseal_kek(seal_key: &[u8; KEK_LEN], sealed_hex: &str) -> Result<[u8; KEK_LEN]> {
    let blob = hex::decode(sealed_hex).map_err(|e| anyhow!("decode sealed kek: {e}"))?;
    let pt = aead_decrypt(seal_key, &blob)?;
    pt.as_slice()
        .try_into()
        .map_err(|_| anyhow!("sealed KEK wrong length"))
}

/// Generate a fresh random recovery key (32 bytes).
/// This is the plaintext recovery key that the user saves.
pub fn generate_recovery_key() -> [u8; DEK_LEN] {
    generate_dek()
}

/// Encode a recovery key as hex for display/download.
pub fn recovery_key_to_hex(key: &[u8; DEK_LEN]) -> String {
    hex::encode(key)
}

/// Decode a hex-encoded recovery key.
pub fn recovery_key_from_hex(hex_str: &str) -> Result<[u8; DEK_LEN]> {
    let bytes = hex::decode(hex_str).map_err(|e| anyhow!("decode recovery key hex: {e}"))?;
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| anyhow!("recovery key wrong length"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_kek_deterministic() {
        let salt = [0u8; 16];
        let a = derive_kek("password", &salt);
        let b = derive_kek("password", &salt);
        assert_eq!(a, b, "same password+salt must produce same KEK");
    }

    #[test]
    fn derive_kek_different_password() {
        let salt = [0u8; 16];
        let a = derive_kek("password1", &salt);
        let b = derive_kek("password2", &salt);
        assert_ne!(a, b, "different passwords must produce different KEKs");
    }

    #[test]
    fn wrap_unwrap_dek() {
        let kek = derive_kek("admin", &[1u8; 16]);
        let dek = generate_dek();
        let wrapped = wrap_dek(&kek, &dek).unwrap();
        let unwrapped = unwrap_dek(&kek, &wrapped).unwrap();
        assert_eq!(dek, unwrapped, "unwrapped DEK must match original");
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let dek = generate_dek();
        let plaintext = b"Hello, SearchBox vault!";
        let ct = encrypt_bytes(&dek, plaintext).unwrap();
        let pt = decrypt_bytes(&dek, &ct).unwrap();
        assert_eq!(plaintext.as_slice(), pt.as_slice());
    }

    #[test]
    fn decrypt_tampered_fails() {
        let dek = generate_dek();
        let ct = encrypt_bytes(&dek, b"secret").unwrap();
        let mut tampered = ct.clone();
        tampered[13] ^= 0xff;
        assert!(decrypt_bytes(&dek, &tampered).is_err());
    }

    #[test]
    fn seal_unseal_round_trip() {
        let seal = generate_seal_key();
        let kek = derive_kek("admin-pw", &[3u8; 16]);
        let sealed = seal_kek(&seal, &kek).unwrap();
        assert_ne!(sealed, hex::encode(kek), "sealed value is not the raw KEK");
        assert_eq!(unseal_kek(&seal, &sealed).unwrap(), kek);

        // A different seal key (i.e. after a process restart) can't unseal it.
        let other = generate_seal_key();
        assert!(
            unseal_kek(&other, &sealed).is_err(),
            "a restart's new seal key must not unseal the old value"
        );
    }
}

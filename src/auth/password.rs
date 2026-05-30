use anyhow::{anyhow, Result};
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow!("hash password: {e}"))?
        .to_string();
    Ok(hash)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed = PasswordHash::new(hash).map_err(|e| anyhow!("parse password hash: {e}"))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify() {
        let hash = hash_password("secretpassword").unwrap();
        assert!(verify_password("secretpassword", &hash).unwrap());
        assert!(!verify_password("wrongpassword", &hash).unwrap());
    }

    #[test]
    fn different_passwords_different_hashes() {
        let h1 = hash_password("password1").unwrap();
        let h2 = hash_password("password2").unwrap();
        assert_ne!(h1, h2);
    }

    #[test]
    fn same_password_different_hashes() {
        let h1 = hash_password("samepassword").unwrap();
        let h2 = hash_password("samepassword").unwrap();
        assert_ne!(h1, h2, "argon2 uses random salts");
    }
}

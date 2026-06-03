pub mod crypto;

/// The vault KEK for the current session, or `None` when the vault is locked —
/// either no KEK is sealed into the session, or it was sealed by a previous
/// process (we restarted, regenerating the in-memory seal key). The sealed blob
/// lives in the on-disk session store; the seal key lives only in memory, so a
/// copied data directory never yields a usable KEK.
pub fn current_kek(seal_key: &[u8; 32], user: &crate::auth::SessionUser) -> Option<[u8; 32]> {
    let sealed = user.vault_kek_sealed.as_ref()?;
    crypto::unseal_kek(seal_key, sealed).ok()
}

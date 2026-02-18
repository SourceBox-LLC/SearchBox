"""
Vault PIN management service for SearchBox.
Handles PIN verification, key derivation, and vault lifecycle.
"""

import logging

from utils.crypto import (
    generate_salt, derive_kek, compute_pin_hash,
    generate_dek, wrap_dek, unwrap_dek
)

logger = logging.getLogger(__name__)


def get_vault_config(VaultConfig):
    """Get vault configuration from database."""
    vault_config = VaultConfig.get()
    if vault_config:
        return {
            'pin_hash': vault_config.pin_hash,  # bytes
            'salt': vault_config.salt            # bytes
        }
    return {}


def save_vault_config(VaultConfig, config):
    """Save vault configuration to database."""
    VaultConfig.set(config['pin_hash'], config['salt'])


def setup_vault(VaultConfig, pin):
    """
    Set up a new vault with the given PIN.
    Generates a salt, derives the PIN hash, and stores both.

    Args:
        VaultConfig: The VaultConfig model class.
        pin (str): The user's 4-digit PIN.

    Returns:
        dict: {'salt': bytes, 'pin_hash': bytes}
    """
    salt = generate_salt()
    pin_hash = compute_pin_hash(pin, salt)
    VaultConfig.set(pin_hash, salt)
    logger.info("Vault PIN set up successfully")
    return {'salt': salt, 'pin_hash': pin_hash}


def verify_pin(VaultConfig, pin):
    """
    Verify a PIN against the stored hash.

    Args:
        VaultConfig: The VaultConfig model class.
        pin (str): PIN to verify.

    Returns:
        bool: True if PIN is correct.
    """
    config = get_vault_config(VaultConfig)
    if 'pin_hash' not in config:
        return False

    expected_hash = config['pin_hash']
    salt = config['salt']
    actual_hash = compute_pin_hash(pin, salt)
    return actual_hash == expected_hash


def derive_kek_from_pin(VaultConfig, pin):
    """
    Derive the Key Encryption Key (KEK) from the PIN.
    Must verify PIN first before calling this.

    Args:
        VaultConfig: The VaultConfig model class.
        pin (str): Verified PIN.

    Returns:
        bytes: 32-byte KEK, or None if vault not set up.
    """
    config = get_vault_config(VaultConfig)
    if 'salt' not in config:
        return None
    return derive_kek(pin, config['salt'])


def change_pin(VaultConfig, EncryptedFile, old_pin, new_pin):
    """
    Change the vault PIN and re-wrap all file DEKs.

    Args:
        VaultConfig: The VaultConfig model class.
        EncryptedFile: The EncryptedFile model class.
        old_pin (str): Current PIN (already verified).
        new_pin (str): New PIN.

    Returns:
        dict: {'success': bool, 'files_rewrapped': int}
    """
    config = get_vault_config(VaultConfig)
    old_salt = config['salt']

    # Derive old KEK
    old_kek = derive_kek(old_pin, old_salt)

    # Generate new salt and derive new KEK + hash
    new_salt = generate_salt()
    new_kek = derive_kek(new_pin, new_salt)
    new_pin_hash = compute_pin_hash(new_pin, new_salt)

    # Re-wrap all file DEKs
    encrypted_files = EncryptedFile.get_all()
    rewrapped = 0
    for ef in encrypted_files:
        try:
            dek = unwrap_dek(old_kek, ef.wrapped_dek)
            new_wrapped = wrap_dek(new_kek, dek)
            EncryptedFile.update_wrapped_dek(ef.doc_id, new_wrapped)
            rewrapped += 1
        except Exception as e:
            logger.error(f"Failed to re-wrap DEK for {ef.doc_id}: {e}")
            raise RuntimeError(f"Failed to re-wrap key for file {ef.doc_id}") from e

    # Update vault config with new salt and hash
    VaultConfig.set(new_pin_hash, new_salt)

    logger.info(f"PIN changed successfully, re-wrapped {rewrapped} file keys")
    return {'success': True, 'files_rewrapped': rewrapped}

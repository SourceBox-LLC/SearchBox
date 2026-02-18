"""
Vault file encryption utilities for SearchBox.
Uses AES-256-GCM with envelope encryption (per-file DEKs wrapped by a PIN-derived KEK).
"""

import os
import tempfile
import logging

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger(__name__)

# Constants
PBKDF2_ITERATIONS = 600_000
SALT_LENGTH = 16       # 16-byte random salt
DEK_LENGTH = 32        # AES-256
NONCE_LENGTH = 12      # 96-bit nonce for AES-GCM
TAG_LENGTH = 16        # GCM auth tag (included automatically by AESGCM)


def generate_salt():
    """Generate a random 16-byte salt for PBKDF2."""
    return os.urandom(SALT_LENGTH)


def derive_kek(pin, salt):
    """
    Derive a Key Encryption Key (KEK) from the user's PIN using PBKDF2.

    Args:
        pin (str): User's PIN (plaintext).
        salt (bytes): Random salt (16 bytes).

    Returns:
        bytes: 32-byte KEK suitable for AES-256.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=DEK_LENGTH,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(pin.encode('utf-8'))


def generate_dek():
    """Generate a random 32-byte Data Encryption Key (DEK) for a single file."""
    return os.urandom(DEK_LENGTH)


def wrap_dek(kek, dek):
    """
    Wrap (encrypt) a DEK using the KEK via AES-256-GCM.

    Args:
        kek (bytes): 32-byte Key Encryption Key.
        dek (bytes): 32-byte Data Encryption Key to wrap.

    Returns:
        bytes: nonce (12 bytes) + ciphertext + tag. Total ~60 bytes.
    """
    aesgcm = AESGCM(kek)
    nonce = os.urandom(NONCE_LENGTH)
    ct = aesgcm.encrypt(nonce, dek, None)  # ct includes the 16-byte GCM tag
    return nonce + ct


def unwrap_dek(kek, wrapped_dek):
    """
    Unwrap (decrypt) a DEK using the KEK.

    Args:
        kek (bytes): 32-byte Key Encryption Key.
        wrapped_dek (bytes): Output of wrap_dek().

    Returns:
        bytes: 32-byte plaintext DEK.

    Raises:
        cryptography.exceptions.InvalidTag: If KEK is wrong (wrong PIN).
    """
    aesgcm = AESGCM(kek)
    nonce = wrapped_dek[:NONCE_LENGTH]
    ct = wrapped_dek[NONCE_LENGTH:]
    return aesgcm.decrypt(nonce, ct, None)


def encrypt_file(dek, plaintext_path, encrypted_path):
    """
    Encrypt a file on disk using AES-256-GCM.

    Writes: [12-byte nonce][ciphertext + 16-byte GCM tag]

    Args:
        dek (bytes): 32-byte Data Encryption Key.
        plaintext_path (str): Path to the plaintext file.
        encrypted_path (str): Path to write the encrypted file.
    """
    aesgcm = AESGCM(dek)
    nonce = os.urandom(NONCE_LENGTH)

    with open(plaintext_path, 'rb') as f:
        plaintext = f.read()

    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    with open(encrypted_path, 'wb') as f:
        f.write(nonce)
        f.write(ciphertext)

    logger.debug(f"Encrypted {plaintext_path} -> {encrypted_path} ({len(plaintext)} bytes)")


def decrypt_file(dek, encrypted_path):
    """
    Decrypt a file from disk and return plaintext bytes.

    Args:
        dek (bytes): 32-byte Data Encryption Key.
        encrypted_path (str): Path to the encrypted file.

    Returns:
        bytes: Decrypted file contents.

    Raises:
        cryptography.exceptions.InvalidTag: If DEK is wrong or file is tampered.
        FileNotFoundError: If encrypted file doesn't exist.
    """
    aesgcm = AESGCM(dek)

    with open(encrypted_path, 'rb') as f:
        data = f.read()

    nonce = data[:NONCE_LENGTH]
    ciphertext = data[NONCE_LENGTH:]
    return aesgcm.decrypt(nonce, ciphertext, None)


def decrypt_file_to_temp(dek, encrypted_path, suffix=''):
    """
    Decrypt a file to a temporary file on disk.

    Args:
        dek (bytes): 32-byte Data Encryption Key.
        encrypted_path (str): Path to the encrypted file.
        suffix (str): File extension for the temp file (e.g. '.pdf').

    Returns:
        str: Path to the temporary decrypted file. Caller must clean up.
    """
    plaintext = decrypt_file(dek, encrypted_path)

    fd, temp_path = tempfile.mkstemp(suffix=suffix)
    try:
        os.write(fd, plaintext)
    finally:
        os.close(fd)

    logger.debug(f"Decrypted {encrypted_path} -> {temp_path}")
    return temp_path


def compute_pin_hash(pin, salt):
    """
    Compute a verifiable hash of the PIN using PBKDF2 with a separate derivation.
    This is stored in the DB to verify the PIN without needing to try decryption.

    Uses a different purpose string appended to the salt to ensure the hash
    derivation is independent from the KEK derivation.

    Args:
        pin (str): User's PIN.
        salt (bytes): Same salt used for KEK derivation.

    Returns:
        bytes: 32-byte hash for PIN verification.
    """
    # Use salt + b'_verify' so this derivation is independent from KEK
    verify_salt = salt + b'_verify'
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=verify_salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(pin.encode('utf-8'))

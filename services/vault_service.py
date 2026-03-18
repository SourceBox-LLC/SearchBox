# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC
#
# This file is part of SearchBox.
# SearchBox is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# SearchBox is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with SearchBox. If not, see <https://www.gnu.org/licenses/>.

"""
Vault encryption service for SearchBox.
Handles key derivation and vault lifecycle using admin password.
"""

import logging

from utils.crypto import generate_salt, derive_kek, generate_dek, wrap_dek, unwrap_dek

logger = logging.getLogger(__name__)


def get_vault_config(VaultConfig):
    """Get vault configuration from database."""
    vault_config = VaultConfig.get()
    if vault_config:
        return {"salt": vault_config.salt}
    return {}


def save_vault_config(VaultConfig, config):
    """Save vault configuration to database."""
    VaultConfig.set(config["salt"])


def init_vault_encryption(VaultConfig, password):
    """
    Initialize vault encryption with admin password.
    Generates a salt for key derivation.

    Args:
        VaultConfig: The VaultConfig model class.
        password (str): Admin password for key derivation.

    Returns:
        dict: {'salt': bytes}
    """
    salt = generate_salt()
    VaultConfig.set(salt)
    logger.info("Vault encryption initialized successfully")
    return {"salt": salt}


def derive_kek_from_password(VaultConfig, password):
    """
    Derive the Key Encryption Key (KEK) from admin password.

    Args:
        VaultConfig: The VaultConfig model class.
        password (str): Admin password.

    Returns:
        bytes: 32-byte KEK, or None if vault not initialized.
    """
    config = get_vault_config(VaultConfig)
    if "salt" not in config:
        return None
    return derive_kek(password, config["salt"])


def setup_vault(VaultConfig, password):
    """
    Set up vault encryption with a password.

    Note: This is kept for backward compatibility.
    Use init_vault_encryption for new code.
    """
    return init_vault_encryption(VaultConfig, password)


def rotate_encryption_key(VaultConfig, EncryptedFile, old_password, new_password):
    """
    Rotate the encryption key by re-wrapping all file DEKs.

    Args:
        VaultConfig: The VaultConfig model class.
        EncryptedFile: The EncryptedFile model class.
        old_password (str): Current admin password.
        new_password (str): New admin password.

    Returns:
        dict: {'success': bool, 'files_rewrapped': int}
    """
    config = get_vault_config(VaultConfig)
    old_salt = config["salt"]

    old_kek = derive_kek(old_password, old_salt)

    new_salt = generate_salt()
    new_kek = derive_kek(new_password, new_salt)

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

    VaultConfig.set(new_salt)

    logger.info(f"Encryption key rotated, re-wrapped {rewrapped} file keys")
    return {"success": True, "files_rewrapped": rewrapped}

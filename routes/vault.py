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
Vault management API routes for SearchBox.
Handles vault encryption status and reset operations.
Vault encryption uses the admin password for key derivation (no separate PIN).
"""

import os
import glob
import logging

from flask import Blueprint, jsonify, request, current_app

from config import VAULT_FOLDER
from services.vault_service import get_vault_config
from utils.decorators import api_login_required, get_current_organization_id

vault_bp = Blueprint("vault", __name__)
logger = logging.getLogger(__name__)


@vault_bp.route("/api/vault/status", methods=["GET"])
@api_login_required
def vault_status():
    """Check if vault encryption is set up."""
    org_id = get_current_organization_id()
    config = get_vault_config(current_app.VaultConfig, organization_id=org_id)
    encrypted_count = 0
    if hasattr(current_app, "EncryptedFile"):
        encrypted_count = len(current_app.EncryptedFile.get_all(organization_id=org_id))
    return jsonify(
        {
            "encryption_enabled": "salt" in config,
            "files_encrypted": encrypted_count,
        }
    )


@vault_bp.route("/api/vault/reset", methods=["POST"])
@api_login_required
def vault_reset():
    """Reset vault: delete all encrypted files and clear encryption metadata."""
    data = request.get_json() or {}
    confirm = data.get("confirm", False)

    if not confirm:
        return jsonify(
            {"error": "Confirmation required. Set 'confirm': true in request body."}
        ), 400

    org_id = get_current_organization_id()
    deleted_files = 0

    for f in glob.glob(os.path.join(VAULT_FOLDER, "*.enc")):
        try:
            os.remove(f)
            deleted_files += 1
        except OSError as e:
            logger.error(f"Failed to delete {f}: {e}")

    for f in os.listdir(VAULT_FOLDER):
        fpath = os.path.join(VAULT_FOLDER, f)
        if os.path.isfile(fpath):
            try:
                os.remove(fpath)
                deleted_files += 1
            except OSError as e:
                logger.error(f"Failed to delete {fpath}: {e}")

    if hasattr(current_app, "EncryptedFile"):
        current_app.EncryptedFile.clear_all(organization_id=org_id)

    if hasattr(current_app, "VaultConfig"):
        current_app.VaultConfig.clear(organization_id=org_id)

    logger.info(f"Vault reset: deleted {deleted_files} files")
    return jsonify({"success": True, "deleted_files": deleted_files})

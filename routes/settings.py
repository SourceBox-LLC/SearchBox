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
Settings API routes — search history, preferences, and sync metadata.
All settings stored in the database via the Settings model.
"""

import json
import os
import shutil
import logging

from flask import Blueprint, request, jsonify, current_app, session
from utils.decorators import api_login_required
from config import BASE_DIR, VAULT_FOLDER

logger = logging.getLogger(__name__)

settings_bp = Blueprint("settings", __name__)

MAX_HISTORY_SIZE = 5


def _settings():
    return current_app.Settings


def _bookmark():
    return current_app.Bookmark


# ── Search History ──────────────────────────────────────────────────────────


@settings_bp.route("/api/settings/search-history", methods=["GET"])
@api_login_required
def get_search_history():
    """Return the stored search history list."""
    history = _settings().get_json("search_history", [])
    return jsonify({"history": history})


@settings_bp.route("/api/settings/search-history", methods=["POST"])
@api_login_required
def add_search_history():
    """Add a query to search history (deduped, capped at MAX_HISTORY_SIZE)."""
    data = request.get_json()
    query = (data.get("query") or "").strip() if data else ""
    if not query:
        return jsonify({"error": "query is required"}), 400

    history = _settings().get_json("search_history", [])

    # Remove duplicates (case-insensitive)
    history = [h for h in history if h.lower() != query.lower()]

    # Prepend and cap
    history.insert(0, query)
    history = history[:MAX_HISTORY_SIZE]

    _settings().set_json("search_history", history, "Recent search queries")
    return jsonify({"success": True, "history": history})


@settings_bp.route("/api/settings/search-history", methods=["DELETE"])
@api_login_required
def clear_search_history():
    """Clear all search history."""
    _settings().set_json("search_history", [], "Recent search queries")
    return jsonify({"success": True})


# ── AI Enhancement Preference ──────────────────────────────────────────────


@settings_bp.route("/api/settings/ai-enhancement", methods=["GET"])
@api_login_required
def get_ai_enhancement():
    """Return the AI history enhancement preference (default: true)."""
    val = _settings().get("ai_history_enhancement", "true")
    enabled = val.lower() in ("true", "1", "yes") if isinstance(val, str) else bool(val)
    return jsonify({"enabled": enabled})


@settings_bp.route("/api/settings/ai-enhancement", methods=["PUT"])
@api_login_required
def set_ai_enhancement():
    """Set the AI history enhancement preference."""
    data = request.get_json()
    if data is None or "enabled" not in data:
        return jsonify({"error": "enabled is required"}), 400
    enabled = bool(data["enabled"])
    _settings().set(
        "ai_history_enhancement",
        str(enabled).lower(),
        "Use search history for AI recommendations",
    )
    return jsonify({"success": True, "enabled": enabled})


# ── Last Sync Time ─────────────────────────────────────────────────────────


@settings_bp.route("/api/settings/last-sync-time", methods=["GET"])
@api_login_required
def get_last_sync_time():
    """Return the last folder sync timestamp."""
    ts = _settings().get("last_sync_time")
    return jsonify({"last_sync_time": ts})


@settings_bp.route("/api/settings/last-sync-time", methods=["PUT"])
@api_login_required
def set_last_sync_time():
    """Store the last folder sync timestamp."""
    data = request.get_json()
    ts = data.get("timestamp") if data else None
    if not ts:
        return jsonify({"error": "timestamp is required"}), 400
    _settings().set("last_sync_time", ts, "Last folder sync time")
    return jsonify({"success": True, "last_sync_time": ts})


# ── Last Archive Sync Time ─────────────────────────────────────────────────


@settings_bp.route("/api/settings/last-archive-sync-time", methods=["GET"])
@api_login_required
def get_last_archive_sync_time():
    """Return the last archive sync timestamp."""
    ts = _settings().get("last_archive_sync_time")
    return jsonify({"last_archive_sync_time": ts})


@settings_bp.route("/api/settings/last-archive-sync-time", methods=["PUT"])
@api_login_required
def set_last_archive_sync_time():
    """Store the last archive sync timestamp."""
    data = request.get_json()
    ts = data.get("timestamp") if data else None
    if not ts:
        return jsonify({"error": "timestamp is required"}), 400
    _settings().set("last_archive_sync_time", ts, "Last archive sync time")
    return jsonify({"success": True, "last_archive_sync_time": ts})


# ── Factory Reset ─────────────────────────────────────────────────────────


@settings_bp.route("/api/settings/factory-reset", methods=["POST"])
@api_login_required
def factory_reset():
    """Wipe ALL application data and restore to default state."""
    errors = []
    db = current_app.db

    # 1. Clear Meilisearch index
    try:
        from routes.helpers import get_index
        from services.meilisearch_service import get_meili_client

        index = get_index()
        task = index.delete_all_documents()
        get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=30000)
        logger.info("Factory reset: Meilisearch documents cleared")
    except Exception as e:
        errors.append(f"Meilisearch: {e}")
        logger.error(f"Factory reset — Meilisearch error: {e}")

    # 2. Drop and recreate all database tables
    try:
        with current_app.app_context():
            db.drop_all()
            db.create_all()
        logger.info("Factory reset: Database tables recreated")
    except Exception as e:
        errors.append(f"Database: {e}")
        logger.error(f"Factory reset — Database error: {e}")

    # 3. Delete vault encrypted files
    try:
        if os.path.isdir(VAULT_FOLDER):
            shutil.rmtree(VAULT_FOLDER)
            os.makedirs(VAULT_FOLDER, exist_ok=True)
        logger.info("Factory reset: Vault cleared")
    except Exception as e:
        errors.append(f"Vault: {e}")
        logger.error(f"Factory reset — Vault error: {e}")

    # 4. Delete all thumbnails
    try:
        thumb_dir = os.path.join(BASE_DIR, "static", "thumbnails")
        if os.path.isdir(thumb_dir):
            shutil.rmtree(thumb_dir)
            os.makedirs(thumb_dir, exist_ok=True)
        logger.info("Factory reset: Thumbnails cleared")
    except Exception as e:
        errors.append(f"Thumbnails: {e}")
        logger.error(f"Factory reset — Thumbnails error: {e}")

    # 5. Clear session
    try:
        session.clear()
    except Exception:
        pass

    success = len(errors) == 0
    return jsonify(
        {
            "success": success,
            "message": "Factory reset complete"
            if success
            else "Factory reset completed with errors",
            "errors": errors,
        }
    )


# ── Bookmarks Enabled Setting ───────────────────────────────────────────────


@settings_bp.route("/api/settings/bookmarks-enabled", methods=["GET"])
@api_login_required
def get_bookmarks_enabled():
    """Get bookmarks enabled state (default: true)."""
    val = _settings().get("bookmarks_enabled", "true")
    enabled = val.lower() in ("true", "1", "yes") if isinstance(val, str) else bool(val)
    return jsonify({"enabled": enabled})


@settings_bp.route("/api/settings/bookmarks-enabled", methods=["PUT"])
@api_login_required
def set_bookmarks_enabled():
    """Set bookmarks enabled state."""
    data = request.get_json()
    if data is None or "enabled" not in data:
        return jsonify({"error": "enabled is required"}), 400
    enabled = bool(data["enabled"])
    _settings().set(
        "bookmarks_enabled", str(enabled).lower(), "Enable/disable bookmarks feature"
    )
    return jsonify({"success": True, "enabled": enabled})


# ── Bookmarks ───────────────────────────────────────────────────────────────


@settings_bp.route("/api/bookmarks", methods=["GET"])
@api_login_required
def get_bookmarks():
    """Get all bookmarks."""
    bookmarks = _bookmark().get_all()
    return jsonify(
        {
            "bookmarks": [
                {
                    "slot": b.slot,
                    "doc_id": b.doc_id,
                    "title": b.title,
                    "file_type": b.file_type,
                    "file_path": b.file_path,
                    "created_at": b.created_at.isoformat(),
                }
                for b in bookmarks
            ]
        }
    )


@settings_bp.route("/api/bookmarks", methods=["POST"])
@api_login_required
def add_bookmark():
    """Add or update a bookmark."""
    data = request.get_json()
    slot = data.get("slot")
    doc_id = data.get("doc_id")
    title = data.get("title")
    file_type = data.get("file_type")
    file_path = data.get("file_path")

    if not all([slot, doc_id, title, file_type]):
        return jsonify({"error": "Missing required fields"}), 400

    # Validate slot is 1-5
    if not (1 <= slot <= 5):
        return jsonify({"error": "Slot must be 1-5"}), 400

    bookmark = _bookmark().upsert(slot, doc_id, title, file_type, file_path)
    return jsonify(
        {
            "success": True,
            "bookmark": {
                "slot": bookmark.slot,
                "doc_id": bookmark.doc_id,
                "title": bookmark.title,
                "file_type": bookmark.file_type,
            },
        }
    )


@settings_bp.route("/api/bookmarks/<int:slot>", methods=["DELETE"])
@api_login_required
def delete_bookmark(slot):
    """Delete a bookmark by slot."""
    _bookmark().delete_by_slot(slot)
    return jsonify({"success": True})


@settings_bp.route("/api/bookmarks/document/<doc_id>", methods=["GET"])
@api_login_required
def get_bookmark_by_doc(doc_id):
    """Check if a document is bookmarked."""
    bookmark = _bookmark().get_by_doc_id(doc_id)
    if bookmark:
        return jsonify({"bookmarked": True, "slot": bookmark.slot})
    return jsonify({"bookmarked": False})

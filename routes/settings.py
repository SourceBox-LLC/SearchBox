"""
Settings API routes — search history, preferences, and sync metadata.
All settings stored in the database via the Settings model.
"""

import json
import os
import shutil
import logging

from flask import Blueprint, request, jsonify, current_app, session
from utils.auth import require_pin
from config import BASE_DIR, VAULT_FOLDER

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__)

MAX_HISTORY_SIZE = 5


def _settings():
    return current_app.Settings


# ── Search History ──────────────────────────────────────────────────────────

@settings_bp.route("/api/settings/search-history", methods=['GET'])
def get_search_history():
    """Return the stored search history list."""
    history = _settings().get_json('search_history', [])
    return jsonify({'history': history})


@settings_bp.route("/api/settings/search-history", methods=['POST'])
@require_pin
def add_search_history():
    """Add a query to search history (deduped, capped at MAX_HISTORY_SIZE)."""
    data = request.get_json()
    query = (data.get('query') or '').strip() if data else ''
    if not query:
        return jsonify({'error': 'query is required'}), 400

    history = _settings().get_json('search_history', [])

    # Remove duplicates (case-insensitive)
    history = [h for h in history if h.lower() != query.lower()]

    # Prepend and cap
    history.insert(0, query)
    history = history[:MAX_HISTORY_SIZE]

    _settings().set_json('search_history', history, 'Recent search queries')
    return jsonify({'success': True, 'history': history})


@settings_bp.route("/api/settings/search-history", methods=['DELETE'])
@require_pin
def clear_search_history():
    """Clear all search history."""
    _settings().set_json('search_history', [], 'Recent search queries')
    return jsonify({'success': True})


# ── AI Enhancement Preference ──────────────────────────────────────────────

@settings_bp.route("/api/settings/ai-enhancement", methods=['GET'])
def get_ai_enhancement():
    """Return the AI history enhancement preference (default: true)."""
    val = _settings().get('ai_history_enhancement', 'true')
    enabled = val.lower() in ('true', '1', 'yes') if isinstance(val, str) else bool(val)
    return jsonify({'enabled': enabled})


@settings_bp.route("/api/settings/ai-enhancement", methods=['PUT'])
@require_pin
def set_ai_enhancement():
    """Set the AI history enhancement preference."""
    data = request.get_json()
    if data is None or 'enabled' not in data:
        return jsonify({'error': 'enabled is required'}), 400
    enabled = bool(data['enabled'])
    _settings().set('ai_history_enhancement', str(enabled).lower(),
                    'Use search history for AI recommendations')
    return jsonify({'success': True, 'enabled': enabled})


# ── Last Sync Time ─────────────────────────────────────────────────────────

@settings_bp.route("/api/settings/last-sync-time", methods=['GET'])
def get_last_sync_time():
    """Return the last folder sync timestamp."""
    ts = _settings().get('last_sync_time')
    return jsonify({'last_sync_time': ts})


@settings_bp.route("/api/settings/last-sync-time", methods=['PUT'])
@require_pin
def set_last_sync_time():
    """Store the last folder sync timestamp."""
    data = request.get_json()
    ts = data.get('timestamp') if data else None
    if not ts:
        return jsonify({'error': 'timestamp is required'}), 400
    _settings().set('last_sync_time', ts, 'Last folder sync time')
    return jsonify({'success': True, 'last_sync_time': ts})


# ── Last Archive Sync Time ─────────────────────────────────────────────────

@settings_bp.route("/api/settings/last-archive-sync-time", methods=['GET'])
def get_last_archive_sync_time():
    """Return the last archive sync timestamp."""
    ts = _settings().get('last_archive_sync_time')
    return jsonify({'last_archive_sync_time': ts})


@settings_bp.route("/api/settings/last-archive-sync-time", methods=['PUT'])
@require_pin
def set_last_archive_sync_time():
    """Store the last archive sync timestamp."""
    data = request.get_json()
    ts = data.get('timestamp') if data else None
    if not ts:
        return jsonify({'error': 'timestamp is required'}), 400
    _settings().set('last_archive_sync_time', ts, 'Last archive sync time')
    return jsonify({'success': True, 'last_archive_sync_time': ts})


# ── Factory Reset ─────────────────────────────────────────────────────────

@settings_bp.route("/api/settings/factory-reset", methods=['POST'])
@require_pin
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
        thumb_dir = os.path.join(BASE_DIR, 'static', 'thumbnails')
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
    return jsonify({
        'success': success,
        'message': 'Factory reset complete' if success else 'Factory reset completed with errors',
        'errors': errors
    })

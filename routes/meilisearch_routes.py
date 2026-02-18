"""
Meilisearch management API routes for SearchBox.
"""

import meilisearch
from flask import Blueprint, jsonify, request, current_app

from config import INDEX_NAME
from services.config_service import save_searchbox_config
from services.meilisearch_service import (
    is_meilisearch_running, start_meilisearch, stop_meilisearch,
    get_documents_index, get_meili_client
)
from utils.auth import require_pin
from routes.helpers import get_config as _get_config

meilisearch_bp = Blueprint('meilisearch', __name__)



@meilisearch_bp.route("/api/meilisearch/status")
def meilisearch_status():
    """Get Meilisearch status and stats."""
    config = _get_config()
    running = is_meilisearch_running(_get_config)
    
    response = {
        'running': running,
        'host': config['meilisearch_host'],
        'port': config['meilisearch_port'],
        'auto_start': config['auto_start'],
        'binary_path': config['meilisearch_path'],
        'data_path': config['data_path']
    }
    
    if running:
        try:
            client = meilisearch.Client(
                f"{config['meilisearch_host']}:{config['meilisearch_port']}", 
                config['master_key']
            )
            stats = client.get_stats()
            version = client.get_version()
            response['version'] = version.get('pkgVersion', 'unknown')
            response['stats'] = {
                'database_size': stats.get('databaseSize', 0),
                'indexes': stats.get('indexes', {})
            }
            if INDEX_NAME in stats.get('indexes', {}):
                response['document_count'] = stats['indexes'][INDEX_NAME].get('numberOfDocuments', 0)
            else:
                response['document_count'] = 0
        except Exception as e:
            response['error'] = str(e)
    
    return jsonify(response)


@meilisearch_bp.route("/api/meilisearch/start", methods=['POST'])
@require_pin
def meilisearch_start():
    """Start Meilisearch server."""
    if is_meilisearch_running(_get_config):
        return jsonify({'success': False, 'already_running': True, 'message': 'Meilisearch is already running'})
    
    success = start_meilisearch(_get_config)
    if success:
        return jsonify({'success': True, 'message': 'Meilisearch started'})
    else:
        config = _get_config()
        return jsonify({
            'success': False, 
            'error': f"Failed to start. Check binary path: {config['meilisearch_path']}"
        }), 500


@meilisearch_bp.route("/api/meilisearch/stop", methods=['POST'])
@require_pin
def meilisearch_stop():
    """Stop Meilisearch server."""
    if not is_meilisearch_running(_get_config):
        return jsonify({'success': True, 'message': 'Already stopped'})
    
    success = stop_meilisearch(_get_config)
    if success:
        return jsonify({'success': True, 'message': 'Meilisearch stopped'})
    else:
        return jsonify({'success': False, 'error': 'Failed to stop Meilisearch'}), 500


@meilisearch_bp.route("/api/meilisearch/config", methods=['GET'])
def get_meilisearch_config():
    """Get Meilisearch configuration."""
    config = _get_config()
    safe_config = {
        'meilisearch_path': config['meilisearch_path'],
        'meilisearch_host': config['meilisearch_host'],
        'meilisearch_port': config['meilisearch_port'],
        'auto_start': config['auto_start'],
        'data_path': config['data_path'],
        'master_key_set': bool(config.get('master_key')),
        'ai_search_enabled': config.get('ai_search_enabled', False),
        'ollama_url': config.get('ollama_url', 'http://localhost:11434'),
        'ollama_model': config.get('ollama_model', 'llama2'),
        'ollama_timeout': config.get('ollama_timeout', 30),
        'ollama_autoconnect': config.get('ollama_autoconnect', False)
    }
    return jsonify(safe_config)


@meilisearch_bp.route("/api/meilisearch/config", methods=['POST'])
@require_pin
def update_meilisearch_config():
    """Update Meilisearch configuration."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    config = _get_config()
    
    if 'meilisearch_path' in data:
        meili_path = data['meilisearch_path']
        # Validate: must be an existing executable file with 'meilisearch' in the basename
        import os
        basename = os.path.basename(meili_path)
        if not basename or 'meilisearch' not in basename.lower():
            return jsonify({'error': 'Invalid Meilisearch binary path'}), 400
        if meili_path and os.path.isfile(meili_path) and os.access(meili_path, os.X_OK):
            config['meilisearch_path'] = os.path.realpath(meili_path)
        elif not meili_path:
            config['meilisearch_path'] = ''
        else:
            return jsonify({'error': 'Meilisearch binary not found or not executable'}), 400
    if 'meilisearch_port' in data:
        config['meilisearch_port'] = int(data['meilisearch_port'])
    if 'auto_start' in data:
        config['auto_start'] = bool(data['auto_start'])
    if 'ai_search_enabled' in data:
        config['ai_search_enabled'] = bool(data['ai_search_enabled'])
    if 'ollama_url' in data:
        ollama_url = data['ollama_url']
        # SSRF guard: only allow http/https URLs
        if ollama_url and not ollama_url.startswith(('http://', 'https://')):
            return jsonify({'error': 'Ollama URL must use http:// or https://'}), 400
        config['ollama_url'] = ollama_url
    if 'ollama_model' in data:
        config['ollama_model'] = data['ollama_model']
    if 'ollama_timeout' in data:
        config['ollama_timeout'] = int(data['ollama_timeout'])
    if 'ollama_autoconnect' in data:
        config['ollama_autoconnect'] = bool(data['ollama_autoconnect'])
    if 'master_key' in data and data['master_key']:
        config['master_key'] = data['master_key']
    if 'data_path' in data:
        config['data_path'] = data['data_path']
    
    save_searchbox_config(current_app._get_current_object(), current_app.Settings, config)
    return jsonify({'success': True, 'message': 'Configuration saved'})


@meilisearch_bp.route("/api/meilisearch/clear", methods=['POST'])
@require_pin
def clear_meilisearch_index():
    """Clear all documents from the index."""
    try:
        task = get_documents_index(_get_config).delete_all_documents()
        get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=30000)
        return jsonify({'success': True, 'message': 'Index cleared'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

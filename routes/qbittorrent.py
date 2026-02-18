"""
qBittorrent integration API routes for SearchBox.
"""

import os
import uuid
import logging
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request, current_app

from config import ALLOWED_EXTENSIONS
from services.config_service import save_searchbox_config
from services.document_service import normalize_file_type, extract_text, extract_image_metadata
from services.meilisearch_service import get_meili_client
from services.qbittorrent_service import create_client
from utils.auth import require_pin
from routes.helpers import get_config as _get_config, get_index as _get_index

qbittorrent_bp = Blueprint('qbittorrent', __name__)
logger = logging.getLogger(__name__)

# Max file size for text extraction (50 MB) — larger files are skipped to avoid timeouts
MAX_INDEX_FILE_SIZE = 50 * 1024 * 1024



@qbittorrent_bp.route("/api/qbittorrent/status", methods=['GET'])
def qbt_status():
    """Check qBittorrent connection and return basic stats."""
    config = _get_config()
    if not config.get('qbt_enabled'):
        return jsonify({'enabled': False})

    client = create_client(config)
    status = client.get_status()
    status['enabled'] = True
    return jsonify(status)


@qbittorrent_bp.route("/api/qbittorrent/config", methods=['GET'])
def qbt_get_config():
    """Get current qBittorrent settings."""
    config = _get_config()
    return jsonify({
        'qbt_enabled': config.get('qbt_enabled', False),
        'qbt_host': config.get('qbt_host', 'http://localhost'),
        'qbt_port': config.get('qbt_port', 8080),
        'qbt_username': config.get('qbt_username', 'admin'),
        'qbt_password': config.get('qbt_password', ''),
    })


@qbittorrent_bp.route("/api/qbittorrent/config", methods=['POST'])
@require_pin
def qbt_save_config():
    """Save qBittorrent settings."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    allowed_keys = {'qbt_enabled', 'qbt_host', 'qbt_port', 'qbt_username', 'qbt_password'}
    updates = {k: v for k, v in data.items() if k in allowed_keys}

    if not updates:
        return jsonify({'error': 'No valid settings provided'}), 400

    save_searchbox_config(
        current_app._get_current_object(),
        current_app.Settings,
        updates
    )
    return jsonify({'success': True})


@qbittorrent_bp.route("/api/qbittorrent/test", methods=['POST'])
@require_pin
def qbt_test_connection():
    """Test connection with provided credentials."""
    data = request.get_json() or {}
    client = create_client({
        'qbt_host': data.get('host', 'http://localhost'),
        'qbt_port': data.get('port', 8080),
        'qbt_username': data.get('username', 'admin'),
        'qbt_password': data.get('password', ''),
    })
    status = client.get_status()
    return jsonify(status)


@qbittorrent_bp.route("/api/qbittorrent/torrents", methods=['GET'])
def qbt_list_torrents():
    """List recent completed and active torrents from qBittorrent."""
    config = _get_config()
    if not config.get('qbt_enabled'):
        return jsonify({'enabled': False, 'torrents': []})

    try:
        client = create_client(config)
        completed = client.get_completed_torrents()
        active = client.get_active_torrents()

        QBTorrent = current_app.QBTorrent
        indexed_hashes = QBTorrent.get_indexed_hashes()

        def _torrent_summary(t, is_active=False):
            return {
                'hash': t.get('hash', ''),
                'name': t.get('name', ''),
                'size': t.get('total_size', 0),
                'progress': t.get('progress', 0),
                'state': t.get('state', ''),
                'save_path': t.get('save_path', ''),
                'content_path': t.get('content_path', ''),
                'added_on': t.get('added_on', 0),
                'completion_on': t.get('completion_on', 0),
                'indexed': t.get('hash', '') in indexed_hashes,
                'active': is_active,
            }

        torrents = []
        for t in completed[:50]:
            torrents.append(_torrent_summary(t, is_active=False))
        for t in active[:20]:
            if t.get('hash') not in {tt['hash'] for tt in torrents}:
                torrents.append(_torrent_summary(t, is_active=True))

        return jsonify({'enabled': True, 'torrents': torrents})

    except Exception as e:
        logger.error(f'Error listing torrents: {e}')
        return jsonify({'error': str(e)}), 500


@qbittorrent_bp.route("/api/qbittorrent/sync", methods=['POST'])
@require_pin
def qbt_sync():
    """Scan completed torrents and index new files into Meilisearch."""
    config = _get_config()
    if not config.get('qbt_enabled'):
        return jsonify({'error': 'qBittorrent integration is not enabled'}), 400

    QBTorrent = current_app.QBTorrent

    try:
        client = create_client(config)
        completed = client.get_completed_torrents()
    except Exception as e:
        logger.error(f'qBittorrent sync connection error: {e}')
        return jsonify({'error': f'Could not connect to qBittorrent: {e}'}), 500

    indexed_hashes = QBTorrent.get_indexed_hashes()

    results = {
        'torrents_processed': 0,
        'files_indexed': 0,
        'files_skipped': 0,
        'files_failed': 0,
        'errors': [],
        'torrents': [],
    }

    for torrent in completed:
        t_hash = torrent.get('hash', '')
        t_name = torrent.get('name', '')
        content_path = torrent.get('content_path', '')
        save_path = torrent.get('save_path', '')

        if t_hash in indexed_hashes:
            continue

        if not content_path or not os.path.exists(content_path):
            results['errors'].append(f'Path not found for "{t_name}": {content_path}')
            continue

        results['torrents_processed'] += 1
        files_count = 0

        # content_path could be a single file or a directory
        if os.path.isfile(content_path):
            file_paths = [content_path]
        else:
            file_paths = []
            for root, dirs, files in os.walk(content_path):
                for f in files:
                    file_paths.append(os.path.join(root, f))

        logger.info(f'Syncing torrent: "{t_name}" ({len(file_paths)} files found)')

        for file_path in file_paths:
            file_ext = os.path.splitext(file_path)[1].lstrip('.').lower()

            if file_ext not in ALLOWED_EXTENSIONS:
                results['files_skipped'] += 1
                continue

            try:
                file_stat = os.stat(file_path)

                # Skip files that are too large for text extraction
                if file_stat.st_size > MAX_INDEX_FILE_SIZE:
                    size_mb = file_stat.st_size / (1024 * 1024)
                    logger.warning(f'Skipping oversized file ({size_mb:.0f} MB): {file_path}')
                    results['files_skipped'] += 1
                    results['errors'].append(f'File too large ({size_mb:.0f} MB, max {MAX_INDEX_FILE_SIZE // (1024*1024)} MB): {os.path.basename(file_path)}')
                    continue

                doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, file_path))[:8]
                logger.info(f'  Extracting text: {os.path.basename(file_path)} ({file_stat.st_size / 1024:.0f} KB)')

                content = extract_text(file_path, file_ext)
                if not content:
                    results['files_failed'] += 1
                    results['errors'].append(f'No text extracted: {file_path}')
                    continue

                image_metadata = extract_image_metadata(file_path, doc_id, file_ext)

                document = {
                    'id': doc_id,
                    'filename': os.path.basename(file_path),
                    'content': content,
                    'file_type': normalize_file_type(file_ext),
                    'file_size': file_stat.st_size,
                    'uploaded_at': datetime.now().isoformat(),
                    'file_path': file_path,
                    'source': 'qbittorrent',
                    'folder_root': content_path if os.path.isdir(content_path) else save_path,
                    'torrent_hash': t_hash,
                    'torrent_name': t_name,
                    **image_metadata
                }

                task = _get_index().add_documents([document])
                get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=30000)

                files_count += 1
                results['files_indexed'] += 1
                logger.info(f'  Indexed: {os.path.basename(file_path)}')

            except Exception as e:
                logger.error(f'  Failed: {os.path.basename(file_path)}: {e}')
                results['files_failed'] += 1
                results['errors'].append(f'Error indexing {os.path.basename(file_path)}: {e}')

        # Record this torrent as indexed
        QBTorrent.add(
            torrent_hash=t_hash,
            torrent_name=t_name,
            save_path=save_path,
            files_indexed=files_count
        )
        results['torrents'].append({
            'name': t_name,
            'hash': t_hash,
            'files_indexed': files_count,
        })

    return jsonify({'success': True, 'results': results})


@qbittorrent_bp.route("/api/qbittorrent/indexed", methods=['GET'])
def qbt_indexed():
    """List all torrents that have been indexed."""
    QBTorrent = current_app.QBTorrent
    torrents = QBTorrent.get_all()
    return jsonify({
        'torrents': [{
            'hash': t.torrent_hash,
            'name': t.torrent_name,
            'save_path': t.save_path,
            'files_indexed': t.files_indexed,
            'indexed_at': t.indexed_at.isoformat() if t.indexed_at else None,
        } for t in torrents]
    })


@qbittorrent_bp.route("/api/qbittorrent/remove", methods=['POST'])
@require_pin
def qbt_remove():
    """Remove an indexed torrent and its documents from Meilisearch."""
    data = request.get_json()
    torrent_hash = data.get('hash') if data else None

    if not torrent_hash:
        return jsonify({'error': 'Torrent hash required'}), 400

    QBTorrent = current_app.QBTorrent
    torrent = QBTorrent.get_by_hash(torrent_hash)
    if not torrent:
        return jsonify({'error': 'Torrent not found in index'}), 404

    # Remove documents from Meilisearch (batch delete with loop for >1000 docs)
    removed_count = 0
    try:
        safe_hash = torrent_hash.replace('\\', '\\\\').replace('"', '\\"')
        index = _get_index()
        while True:
            results = index.search('', {
                'filter': f'torrent_hash = "{safe_hash}"',
                'limit': 1000
            })
            hits = results.get('hits', [])
            if not hits:
                break
            doc_ids = [hit['id'] for hit in hits]
            task = index.delete_documents(doc_ids)
            index.wait_for_task(task.task_uid, timeout_in_ms=30000)
            removed_count += len(doc_ids)
    except Exception as e:
        logger.error(f'Error removing torrent documents: {e}')

    # Remove from DB
    QBTorrent.remove(torrent_hash)

    return jsonify({
        'success': True,
        'torrent_name': torrent.torrent_name,
        'documents_removed': removed_count
    })

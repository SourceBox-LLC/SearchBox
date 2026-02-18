"""
ZIM/ZIP archive indexing API routes for SearchBox.
"""

import os
import uuid
import logging
import threading

from flask import Blueprint, jsonify, request, current_app, Response

from services.zim_service import index_zim, index_zip, serve_zim_article, serve_zim_image
from services.meilisearch_service import get_meili_client
from config import INDEX_NAME
from utils.auth import require_pin
from routes.helpers import get_config as _get_config, get_index as _get_index

zim_bp = Blueprint('zim', __name__)
logger = logging.getLogger(__name__)

# Background job tracker for archive indexing
_archive_jobs = {}
_jobs_lock = threading.Lock()


def _run_archive_index_job(app, job_id, archive_path, archive_type):
    """Background worker: index a ZIM or ZIP archive."""
    with app.app_context():
        job = _archive_jobs[job_id]
        try:
            if archive_type == 'zim':
                config = _get_config()
                meili_url = f"{config['meilisearch_host']}:{config['meilisearch_port']}"
                meili_key = config['master_key']
                results = index_zim(archive_path, meili_url, meili_key, INDEX_NAME,
                                    progress=job)
            elif archive_type == 'zip':
                results = index_zip(archive_path, _get_index, get_meili_client)
            else:
                job['status'] = 'failed'
                job['error'] = 'Unsupported file type'
                return

            indexed_count = results.get('success', 0)
            job['indexed'] = indexed_count
            job['failed'] = results.get('failed', 0)
            job['total'] = results.get('total', 0)
            job['images'] = results.get('images', 0)
            job['errors'] = results.get('errors', [])[:10]

            # Record in database
            archive_name = os.path.basename(archive_path)
            app.IndexedArchive.add(archive_path, archive_name, archive_type, indexed_count)

            job['status'] = 'completed'
            logger.info(f"Archive job {job_id}: completed — {indexed_count} indexed")

        except Exception as e:
            job['status'] = 'failed'
            job['error'] = str(e)[:500]
            logger.error(f"Archive job {job_id}: failed — {e}")


@zim_bp.route("/api/zim/index", methods=['POST'])
@require_pin
def index_archive():
    """Start background indexing for a ZIM or ZIP file. Returns job_id for progress polling."""
    data = request.get_json()
    archive_path = data.get('path') if data else None

    if not archive_path:
        return jsonify({'error': 'Archive path required'}), 400

    archive_path = os.path.abspath(archive_path)

    if not os.path.isfile(archive_path):
        return jsonify({'error': 'File not found'}), 400

    ext = os.path.splitext(archive_path)[1].lower()
    if ext not in ('.zim', '.zip'):
        return jsonify({'error': 'Unsupported file type. Use .zim or .zip'}), 400

    archive_type = ext.lstrip('.')

    # Check if already indexing this archive
    with _jobs_lock:
        for jid, j in _archive_jobs.items():
            if j.get('archive') == archive_path and j['status'] == 'running':
                return jsonify({'job_id': jid, 'status': 'already_running'})

    job_id = str(uuid.uuid4())[:8]
    _archive_jobs[job_id] = {
        'status': 'running',
        'archive': archive_path,
        'archive_type': archive_type,
        'total': 0,
        'indexed': 0,
        'failed': 0,
        'images': 0,
        'deferred': 0,
        'errors': [],
    }

    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_archive_index_job,
        args=(app, job_id, archive_path, archive_type),
        daemon=True
    )
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'started', 'archive': archive_path})


@zim_bp.route("/api/zim/index/status", methods=['GET'])
def archive_index_status():
    """Get progress of an archive indexing job."""
    job_id = request.args.get('job_id')
    if job_id:
        job = _archive_jobs.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        return jsonify({'job_id': job_id, **job})

    # Return all recent jobs
    return jsonify({'jobs': {jid: j for jid, j in _archive_jobs.items()}})


@zim_bp.route("/api/zim/indexed", methods=['GET'])
def get_indexed_archives():
    """List all indexed ZIM/ZIP archives."""
    IndexedArchive = current_app.IndexedArchive
    archives = IndexedArchive.get_all()
    return jsonify({'archives': [{
        'path': a.archive_path,
        'name': a.archive_name,
        'type': a.archive_type,
        'articles_indexed': a.articles_indexed,
        'indexed_at': a.indexed_at.isoformat() if a.indexed_at else None
    } for a in archives]})


@zim_bp.route("/api/zim/remove", methods=['POST'])
@require_pin
def remove_archive():
    """Remove an indexed archive and its documents from Meilisearch."""
    data = request.get_json()
    archive_path = data.get('path') if data else None
    IndexedArchive = current_app.IndexedArchive

    if not archive_path:
        return jsonify({'error': 'Archive path required'}), 400

    # Remove from database
    IndexedArchive.remove(archive_path)

    # Remove documents from Meilisearch
    removed_count = 0
    try:
        safe_path = archive_path.replace('\\', '\\\\').replace('"', '\\"')
        index = _get_index()
        while True:
            results = index.search('', {
                'filter': f'folder_root = "{safe_path}"',
                'limit': 1000
            })
            hits = results.get('hits', [])
            if not hits:
                break
            doc_ids = [hit['id'] for hit in hits]
            task = index.delete_documents(doc_ids)
            get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=30000)
            removed_count += len(doc_ids)
    except Exception as e:
        logger.error(f"Error removing archive documents: {e}")

    return jsonify({
        'success': True,
        'archive': archive_path,
        'documents_removed': removed_count
    })


@zim_bp.route("/api/zim/sync", methods=['POST'])
@require_pin
def sync_archives():
    """Re-index all tracked archives to pick up changes."""
    IndexedArchive = current_app.IndexedArchive
    archives = IndexedArchive.get_all()

    if not archives:
        return jsonify({'success': True, 'results': {
            'total': 0, 'synced': 0, 'failed': 0, 'skipped': 0, 'errors': []
        }})

    config = _get_config()
    meili_url = f"{config['meilisearch_host']}:{config['meilisearch_port']}"
    meili_key = config['master_key']

    results = {'total': len(archives), 'synced': 0, 'failed': 0,
               'skipped': 0, 'errors': [], 'details': []}

    for archive in archives:
        path = archive.archive_path
        if not os.path.isfile(path):
            results['skipped'] += 1
            results['errors'].append(f"File not found: {path}")
            continue

        try:
            ext = os.path.splitext(path)[1].lower()
            if ext == '.zim':
                r = index_zim(path, meili_url, meili_key, INDEX_NAME)
            elif ext == '.zip':
                r = index_zip(path, _get_index, get_meili_client)
            else:
                results['skipped'] += 1
                continue

            indexed_count = r.get('success', 0)
            IndexedArchive.add(path, archive.archive_name, archive.archive_type, indexed_count)
            results['synced'] += 1
            results['details'].append({
                'name': archive.archive_name,
                'indexed': indexed_count,
                'failed': r.get('failed', 0)
            })

            if r.get('errors'):
                results['errors'].extend(r['errors'][:3])

        except Exception as e:
            results['failed'] += 1
            results['errors'].append(f"{archive.archive_name}: {str(e)}")
            logger.error(f"Error syncing archive {path}: {e}")

    return jsonify({'success': True, 'results': results})


@zim_bp.route("/api/zim/article", methods=['GET'])
def get_zim_article():
    """Serve a ZIM article's HTML content for the document viewer."""
    zim_path = request.args.get('path')
    article_url = request.args.get('url')

    if not zim_path or not article_url:
        return jsonify({'error': 'path and url parameters required'}), 400

    if not os.path.isfile(zim_path):
        return jsonify({'error': 'ZIM file not found'}), 404

    try:
        html = serve_zim_article(zim_path, article_url)
        return Response(html, mimetype='text/html')
    except Exception as e:
        logger.error(f"Error serving ZIM article: {e}")
        return jsonify({'error': str(e)}), 500


@zim_bp.route("/api/zim/image", methods=['GET'])
def get_zim_image():
    """Serve an image from inside a ZIM file."""
    zim_path = request.args.get('path')
    image_path = request.args.get('img')

    if not zim_path or not image_path:
        return jsonify({'error': 'path and img parameters required'}), 400

    if not os.path.isfile(zim_path):
        return jsonify({'error': 'ZIM file not found'}), 404

    try:
        img_bytes, mimetype = serve_zim_image(zim_path, image_path)
        return Response(img_bytes, mimetype=mimetype)
    except FileNotFoundError:
        return jsonify({'error': 'Image not found in ZIM'}), 404
    except Exception as e:
        logger.error(f"Error serving ZIM image: {e}")
        return jsonify({'error': str(e)}), 500

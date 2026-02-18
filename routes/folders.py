"""
Folder indexing and sync API routes for SearchBox.
Supports background indexing with batch Meilisearch writes.
"""

import os
import uuid
import logging
import threading
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request, current_app

from config import ALLOWED_EXTENSIONS
from services.document_service import (
    normalize_file_type, extract_text, extract_image_metadata,
    cpp_batch_extract, CPP_EXTRACTOR
)
from services.meilisearch_service import get_meili_client
from utils.auth import require_pin
from routes.helpers import get_config as _get_config, get_index as _get_index

folders_bp = Blueprint('folders', __name__)
logger = logging.getLogger(__name__)

MEILI_BATCH_SIZE = 100

# Background job tracker: {job_id: {status, total, processed, indexed, failed, skipped, folder, errors}}
_indexing_jobs = {}
_jobs_lock = threading.Lock()


def _flush_batch(index, client, batch):
    """Send a batch of documents to Meilisearch and wait."""
    if not batch:
        return
    task = index.add_documents(batch)
    client.wait_for_task(task.task_uid, timeout_in_ms=60000)


def _run_index_job(app, job_id, folder_path_str):
    """Background worker: index all files in a folder with batch Meilisearch writes."""
    with app.app_context():
        folder_path = Path(folder_path_str)
        job = _indexing_jobs[job_id]

        # Enumerate files first to get total count
        files_to_process = []
        for fp in folder_path.rglob('*'):
            if fp.is_file():
                ext = fp.suffix.lstrip('.').lower()
                if ext in ALLOWED_EXTENSIONS:
                    files_to_process.append(fp)
                else:
                    job['skipped'] += 1

        job['total'] = len(files_to_process)
        logger.info(f"Job {job_id}: {job['total']} files to index in {folder_path_str}")

        index = _get_index()
        client = get_meili_client()
        batch = []

        for file_path in files_to_process:
            file_ext = file_path.suffix.lstrip('.').lower()
            try:
                file_stat = file_path.stat()
                doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, str(file_path)))[:8]

                content = extract_text(str(file_path), file_ext)
                if not content:
                    job['failed'] += 1
                    job['processed'] += 1
                    continue

                image_metadata = extract_image_metadata(str(file_path), doc_id, file_ext)

                document = {
                    'id': doc_id,
                    'filename': file_path.name,
                    'content': content,
                    'file_type': normalize_file_type(file_ext),
                    'file_size': file_stat.st_size,
                    'uploaded_at': datetime.now().isoformat(),
                    'file_path': str(file_path),
                    'source': 'folder',
                    'folder_root': folder_path_str,
                    **image_metadata
                }

                batch.append(document)
                job['indexed'] += 1
                job['processed'] += 1

                if len(batch) >= MEILI_BATCH_SIZE:
                    _flush_batch(index, client, batch)
                    batch = []

            except Exception as e:
                job['failed'] += 1
                job['processed'] += 1
                job['errors'].append(f"{file_path.name}: {str(e)[:100]}")
                logger.warning(f"Job {job_id}: error processing {file_path}: {e}")

        # Flush remaining docs
        if batch:
            try:
                _flush_batch(index, client, batch)
            except Exception as e:
                logger.error(f"Job {job_id}: final batch flush failed: {e}")

        # Register the folder in DB
        try:
            app.IndexedFolder.add(folder_path_str)
        except Exception as e:
            logger.error(f"Job {job_id}: failed to register folder: {e}")

        job['status'] = 'completed'
        logger.info(f"Job {job_id}: completed — {job['indexed']} indexed, "
                    f"{job['failed']} failed, {job['skipped']} skipped")


@folders_bp.route("/api/folder/index", methods=['POST'])
@require_pin
def index_folder():
    """Start background indexing for a folder. Returns job_id for progress polling."""
    data = request.get_json()
    folder_path = data.get('path') if data else None

    if not folder_path:
        return jsonify({'error': 'Folder path required'}), 400

    folder_path = str(Path(folder_path).resolve())

    if not os.path.isdir(folder_path):
        return jsonify({'error': 'Invalid folder path'}), 400

    # Check if already indexing this folder
    with _jobs_lock:
        for jid, j in _indexing_jobs.items():
            if j['folder'] == folder_path and j['status'] == 'running':
                return jsonify({'job_id': jid, 'status': 'already_running'})

    job_id = str(uuid.uuid4())[:8]
    _indexing_jobs[job_id] = {
        'status': 'running',
        'folder': folder_path,
        'total': 0,
        'processed': 0,
        'indexed': 0,
        'failed': 0,
        'skipped': 0,
        'errors': [],
    }

    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_index_job, args=(app, job_id, folder_path), daemon=True
    )
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'started', 'folder': folder_path})


@folders_bp.route("/api/folder/index/status", methods=['GET'])
def index_status():
    """Get progress of an indexing job (or all jobs)."""
    job_id = request.args.get('job_id')
    if job_id:
        job = _indexing_jobs.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        return jsonify({'job_id': job_id, **job})

    # Return all recent jobs
    return jsonify({'jobs': {jid: j for jid, j in _indexing_jobs.items()}})


@folders_bp.route("/api/folders", methods=['GET'])
def get_indexed_folders():
    """Get list of indexed folders."""
    IndexedFolder = current_app.IndexedFolder
    folders = IndexedFolder.get_all()
    return jsonify({'folders': [folder.folder_path for folder in folders]})


@folders_bp.route("/api/folders/sync", methods=['POST'])
@require_pin
def sync_folders():
    """Sync indexed folders to find new/changed files. Uses batch Meilisearch writes."""
    try:
        IndexedFolder = current_app.IndexedFolder
        indexed_folders = IndexedFolder.get_all()
        indexed_folder_paths = [folder.folder_path for folder in indexed_folders]
        
        if not indexed_folder_paths:
            return jsonify({'error': 'No indexed folders found'}), 404
        
        existing_docs = {}
        try:
            index = _get_index()
            offset = 0
            fetch_size = 1000
            while True:
                result = index.search('', {
                    'filter': 'source = "folder"',
                    'limit': fetch_size,
                    'offset': offset
                })
                hits = result.get('hits', [])
                for hit in hits:
                    existing_docs[hit.get('file_path')] = {
                        'id': hit.get('id'),
                        'modified_time': hit.get('uploaded_at'),
                        'file_size': hit.get('file_size')
                    }
                if len(hits) < fetch_size:
                    break
                offset += fetch_size
            logger.info(f"Sync found {len(existing_docs)} existing folder documents")
        except Exception as e:
            logger.error(f"Error getting existing documents: {e}")
        
        sync_results = {
            'added': 0,
            'updated': 0,
            'skipped': 0,
            'errors': [],
            'processed_files': []
        }

        # Build set of supported document extensions (exclude image-only types)
        supported_exts = {'.' + ext for ext in ALLOWED_EXTENSIONS
                          if ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp')}

        index = _get_index()
        client = get_meili_client()
        doc_batch = []
        
        for folder_path in indexed_folder_paths:
            if not os.path.exists(folder_path):
                sync_results['errors'].append(f"Folder not found: {folder_path}")
                continue
            
            logger.info(f"Syncing folder: {folder_path}")
            
            for root, dirs, files in os.walk(folder_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    
                    if file.startswith('.') or file in ['Thumbs.db', 'Desktop.ini']:
                        continue
                    
                    try:
                        file_stat = os.stat(file_path)
                        file_ext = os.path.splitext(file_path)[1].lower()
                    except OSError:
                        continue
                    
                    if file_ext not in supported_exts:
                        sync_results['skipped'] += 1
                        continue
                    
                    str_file_path = str(file_path)
                    is_new = str_file_path not in existing_docs
                    is_modified = not is_new
                    
                    if is_new or is_modified:
                        try:
                            doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, str_file_path))[:8]
                            
                            content = extract_text(str_file_path, file_ext)
                            if not content:
                                sync_results['errors'].append(f"No text: {file_path}")
                                continue
                            
                            image_metadata = extract_image_metadata(str_file_path, doc_id, file_ext)
                            
                            document = {
                                'id': doc_id,
                                'filename': os.path.basename(file_path),
                                'content': content,
                                'file_type': normalize_file_type(file_ext),
                                'file_size': file_stat.st_size,
                                'uploaded_at': datetime.now().isoformat(),
                                'file_path': str_file_path,
                                'source': 'folder',
                                'folder_root': folder_path,
                                **image_metadata
                            }
                            
                            doc_batch.append(document)
                            action = "Added" if is_new else "Updated"
                            if is_new:
                                sync_results['added'] += 1
                            else:
                                sync_results['updated'] += 1
                            
                            sync_results['processed_files'].append({
                                'action': action,
                                'filename': os.path.basename(file_path),
                                'file_type': normalize_file_type(file_ext),
                                'has_images': image_metadata.get('has_images', False)
                            })

                            # Flush batch when full
                            if len(doc_batch) >= MEILI_BATCH_SIZE:
                                _flush_batch(index, client, doc_batch)
                                doc_batch = []
                            
                        except Exception as e:
                            sync_results['errors'].append(f"Error: {file_path}: {str(e)[:100]}")
                            continue

        # Flush remaining
        if doc_batch:
            try:
                _flush_batch(index, client, doc_batch)
            except Exception as e:
                logger.error(f"Sync final batch flush failed: {e}")

        logger.info(f"Sync complete: {sync_results['added']} added, "
                    f"{sync_results['updated']} updated, {sync_results['skipped']} skipped")
        
        return jsonify({
            'success': True,
            'results': sync_results
        })
        
    except Exception as e:
        logger.error(f"Sync error: {e}")
        return jsonify({'error': str(e)}), 500


@folders_bp.route("/api/folder/remove", methods=['POST'])
@require_pin
def remove_indexed_folder():
    """Remove an indexed folder and optionally its documents."""
    data = request.get_json()
    folder_path = data.get('path') if data else None
    remove_documents = data.get('remove_documents', True) if data else True
    IndexedFolder = current_app.IndexedFolder
    
    if not folder_path:
        return jsonify({'error': 'Folder path required'}), 400
    
    IndexedFolder.remove(folder_path)
    
    removed_count = 0
    if remove_documents:
        try:
            # Sanitize folder_path for Meilisearch filter (escape double quotes)
            safe_folder_path = folder_path.replace('\\', '\\\\').replace('"', '\\"')
            index = _get_index()
            # Loop to handle folders with more than 1000 documents
            while True:
                results = index.search('', {
                    'filter': f'folder_root = "{safe_folder_path}"',
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
            logger.error(f"Error removing folder documents: {e}")
    
    return jsonify({
        'success': True,
        'folder': folder_path,
        'documents_removed': removed_count
    })

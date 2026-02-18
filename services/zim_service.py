"""
ZIM and ZIP archive indexing service for SearchBox.
Reads ZIM/ZIP archives and produces Meilisearch-ready documents.
ZIM text extraction and image extraction uses the C++ doc_extractor binary;
Python libzim is used only for per-request article/image serving.
Adaptive resource monitoring dynamically adjusts batch sizes and image
processing based on available system memory and CPU load.
"""

import io
import os
import json
import uuid
import shutil
import subprocess
import zipfile
import logging
import tempfile
import time
from datetime import datetime

from bs4 import BeautifulSoup

from config import ALLOWED_EXTENSIONS
from services.document_service import (
    normalize_file_type, extract_text, extract_image_metadata
)
from utils.resource_monitor import AdaptiveMonitor, get_memory_usage_pct

logger = logging.getLogger(__name__)


def _generate_doc_id(archive_path, entry_path):
    """Generate a deterministic 8-char doc ID for an archive entry."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{archive_path}#{entry_path}"))[:8]


# ---------------------------------------------------------------------------
# ZIM indexing (C++ extraction + adaptive resource monitor)
# ---------------------------------------------------------------------------

_EMPTY_IMAGE_META = {'has_images': False, 'image_count': 0, 'first_image': '', 'all_images': []}


def _adopt_cpp_thumbnails(thumb_dir, doc_id):
    """Move C++ pre-generated thumbnails into static/thumbnails/<doc_id>/.
    Returns image_metadata dict.  No PIL involved — just file renames."""
    if not thumb_dir or not os.path.isdir(thumb_dir):
        return _EMPTY_IMAGE_META

    try:
        target = os.path.join('static/thumbnails', doc_id)
        os.makedirs(os.path.dirname(target), exist_ok=True)

        # Remove target if it already exists (re-index)
        if os.path.exists(target):
            shutil.rmtree(target, ignore_errors=True)

        # Move source dir → target (shutil.move handles cross-filesystem)
        shutil.move(thumb_dir, target)

        # Rename files: <prefix>_thumb_0_<size>.jpg → <doc_id>_thumb_0_<size>.jpg
        first_image = ''
        all_images = []
        for f in sorted(os.listdir(target)):
            if not f.endswith('.jpg'):
                continue
            # Extract the size part (e.g. "large", "small")
            parts = f.rsplit('_thumb_0_', 1)
            if len(parts) == 2:
                new_name = f"{doc_id}_thumb_0_{parts[1]}"
                old_path = os.path.join(target, f)
                new_path = os.path.join(target, new_name)
                if old_path != new_path:
                    shutil.move(old_path, new_path)
                rel = new_path.replace('static/', '/static/')
                if '_large.jpg' in new_name:
                    first_image = rel
                if '_small.jpg' in new_name:
                    all_images.append(rel)

        if first_image:
            return {
                'has_images': True,
                'image_count': 1,
                'first_image': first_image,
                'all_images': all_images
            }
    except Exception as e:
        logger.debug(f"Adopt C++ thumbnails failed for {doc_id}: {e}")

    return _EMPTY_IMAGE_META


def _flush_batch(index, client, batch, results):
    """Write a batch of documents to Meilisearch and update results."""
    try:
        task = index.add_documents(batch)
        client.wait_for_task(task.task_uid, timeout_in_ms=60000)
        results['success'] += len(batch)
    except Exception as e:
        results['failed'] += len(batch)
        results['errors'].append(f"Batch error: {e}")


def index_zim(zim_path, meili_url, meili_key, index_name, progress=None):
    """
    Index all articles from a ZIM file into Meilisearch.

    Architecture:
      1. C++ doc_extractor --zim streams JSONL (text + optional images to tmpdir)
      2. Python reads line-by-line, generates thumbnails from extracted files
      3. AdaptiveMonitor checks /proc every 50 articles and adjusts:
         - batch_size (10–400) for Meilisearch writes
         - skip_images flag when memory is tight
         - sleep_seconds for backpressure under high load

    Args:
        progress: Optional dict updated in-place with live stats for polling.

    Returns dict with keys: success (int), failed (int), total (int), errors (list).
    """
    import meilisearch

    zim_path = os.path.abspath(zim_path)
    if not os.path.isfile(zim_path):
        raise FileNotFoundError(f"ZIM file not found: {zim_path}")

    cpp_bin = shutil.which('doc_extractor')
    if not cpp_bin:
        return {'success': 0, 'failed': 0, 'total': 0,
                'errors': ['C++ doc_extractor binary not found']}

    results = {'success': 0, 'failed': 0, 'total': 0, 'errors': []}
    monitor = AdaptiveMonitor()

    # Create a temp directory for C++ to write extracted images
    img_tmp_dir = tempfile.mkdtemp(prefix='searchbox_zim_imgs_')

    logger.info(f"Starting adaptive ZIM indexing: {zim_path}")
    logger.info(f"Image extraction tmpdir: {img_tmp_dir}")

    # Launch C++ extractor with image extraction
    cmd = [cpp_bin, '--zim', zim_path, '--extract-images', img_tmp_dir]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # line-buffered
    )

    client = meilisearch.Client(meili_url, meili_key)
    index = client.index(index_name)
    batch = []
    LOG_INTERVAL = 1000
    DEFERRED_DRAIN_SIZE = 100  # process deferred images in chunks of this size
    start_time = time.monotonic()
    images_processed = 0
    images_skipped_icon = 0
    images_skipped_notfound = 0
    deferred_images = []  # list of (thumb_dir, doc_id) to circle back to

    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue

            try:
                article = json.loads(line)
            except json.JSONDecodeError:
                continue

            results['total'] += 1

            # Adaptive resource check
            monitor.check()

            article_path = article.get('path', '')
            title = article.get('title', '') or article_path
            text = article.get('text', '')
            thumb_dir = article.get('thumb_dir', '')
            image_skipped = article.get('image_skipped', '')
            size = article.get('size', 0)

            # Track skipped images
            if image_skipped == 'icon':
                images_skipped_icon += 1
            elif image_skipped == 'not_found':
                images_skipped_notfound += 1

            if not text or len(text.strip()) < 10:
                results['failed'] += 1
                continue

            doc_id = _generate_doc_id(zim_path, article_path)

            # Adopt C++ pre-generated thumbnails (if available)
            if thumb_dir:
                if monitor.defer_images:
                    # Memory is high — defer this image for later
                    deferred_images.append((thumb_dir, doc_id))
                    image_metadata = _EMPTY_IMAGE_META
                else:
                    image_metadata = _adopt_cpp_thumbnails(thumb_dir, doc_id)
                    if image_metadata['has_images']:
                        images_processed += 1
            else:
                image_metadata = _EMPTY_IMAGE_META

            document = {
                'id': doc_id,
                'filename': title,
                'content': text[:100000],
                'file_type': '.zim',
                'file_size': size,
                'uploaded_at': datetime.now().isoformat(),
                'file_path': f"zim://{zim_path}#{article_path}",
                'source': 'zim',
                'folder_root': zim_path,
                'zim_article_url': article_path,
                **image_metadata
            }

            batch.append(document)

            # Use adaptive batch size
            if len(batch) >= monitor.batch_size:
                _flush_batch(index, client, batch, results)
                batch = []

                # Apply backpressure sleep if needed
                if monitor.sleep_seconds > 0:
                    time.sleep(monitor.sleep_seconds)

            # --- Drain deferred images when memory recovers ---
            if deferred_images and monitor.is_safe_for_deferred():
                drain_count = min(DEFERRED_DRAIN_SIZE, len(deferred_images))
                logger.info(f"Draining {drain_count} deferred images "
                            f"({len(deferred_images)} queued)")
                updates = []
                for _ in range(drain_count):
                    td, img_doc_id = deferred_images.pop(0)
                    meta = _adopt_cpp_thumbnails(td, img_doc_id)
                    if meta['has_images']:
                        images_processed += 1
                        updates.append({'id': img_doc_id, **meta})
                # Patch the already-indexed documents with their thumbnails
                if updates:
                    try:
                        task = index.update_documents(updates)
                        client.wait_for_task(task.task_uid, timeout_in_ms=60000)
                    except Exception as e:
                        logger.warning(f"Deferred image update error: {e}")

            # Periodic progress logging + live progress update
            if results['total'] > 0 and results['total'] % LOG_INTERVAL == 0:
                elapsed = time.monotonic() - start_time
                rate = results['total'] / elapsed if elapsed > 0 else 0
                skip_info = ''
                if images_skipped_icon > 0 or images_skipped_notfound > 0:
                    skip_info = f' (skipped: {images_skipped_icon} icons, {images_skipped_notfound} not found)'
                logger.info(
                    f"ZIM progress: {results['success']} indexed, "
                    f"{results['failed']} failed, {results['total']} total, "
                    f"{images_processed} images{skip_info}, {len(deferred_images)} deferred | "
                    f"{rate:.0f} articles/sec | "
                    f"batch={monitor.batch_size} defer={monitor.defer_images}"
                )

            # Update live progress dict for polling
            if progress is not None and results['total'] % 50 == 0:
                progress['total'] = results['total']
                progress['indexed'] = results['success']
                progress['failed'] = results['failed']
                progress['images'] = images_processed
                progress['deferred'] = len(deferred_images)
                progress['skipped_icon'] = images_skipped_icon
                progress['skipped_notfound'] = images_skipped_notfound

    except Exception as e:
        results['errors'].append(f"Streaming error: {e}")
        logger.error(f"ZIM streaming error: {e}")

    # Flush remaining batch
    if batch:
        _flush_batch(index, client, batch, results)

    # --- Process all remaining deferred images ---
    if deferred_images:
        logger.info(f"Processing {len(deferred_images)} remaining deferred images...")
        # Wait for memory to recover before processing
        monitor.wait_for_cooldown(max_wait=60)
        updates = []
        for td, img_doc_id in deferred_images:
            meta = _adopt_cpp_thumbnails(td, img_doc_id)
            if meta['has_images']:
                images_processed += 1
                updates.append({'id': img_doc_id, **meta})
            # Batch-update thumbnails to Meilisearch
            if len(updates) >= 50:
                try:
                    task = index.update_documents(updates)
                    client.wait_for_task(task.task_uid, timeout_in_ms=60000)
                except Exception as e:
                    logger.warning(f"Deferred image update error: {e}")
                updates = []
                # Re-check memory between batches
                if get_memory_usage_pct() > monitor.MEMORY_HIGH:
                    monitor.wait_for_cooldown(max_wait=30)
        if updates:
            try:
                task = index.update_documents(updates)
                client.wait_for_task(task.task_uid, timeout_in_ms=60000)
            except Exception as e:
                logger.warning(f"Deferred image update error: {e}")
        deferred_images.clear()
        logger.info(f"Deferred image processing complete: {images_processed} total images")

    # Wait for the C++ process to finish and capture stderr
    try:
        proc.stdout.close()
        stderr_output = proc.stderr.read()
        proc.stderr.close()
        proc.wait(timeout=30)
        if stderr_output:
            logger.info(f"C++ ZIM extractor: {stderr_output.strip()[:500]}")
        if proc.returncode != 0 and results['total'] == 0:
            error = stderr_output.strip()[:500] or f"exit code {proc.returncode}"
            results['errors'].append(error)
    except Exception:
        pass

    # Clean up temp image directory
    try:
        shutil.rmtree(img_tmp_dir, ignore_errors=True)
    except Exception:
        pass

    elapsed = time.monotonic() - start_time
    skip_info = ''
    if images_skipped_icon > 0 or images_skipped_notfound > 0:
        skip_info = f' (skipped: {images_skipped_icon} icons, {images_skipped_notfound} not found)'
    logger.info(
        f"ZIM indexing complete: {results['success']} indexed, "
        f"{results['failed']} failed out of {results['total']} articles, "
        f"{images_processed} images thumbnailed{skip_info} | "
        f"{elapsed:.1f}s elapsed | {monitor.summary()}"
    )
    return results


def serve_zim_article(zim_path, article_url):
    """Read a single article's HTML from a ZIM file. Returns sanitized HTML body."""
    from libzim.reader import Archive

    archive = Archive(zim_path)
    entry = archive.get_entry_by_path(article_url)
    if entry.is_redirect:
        entry = entry.get_redirect_entry()
    item = entry.get_item()
    html_bytes = bytes(item.content)
    html = html_bytes.decode('utf-8', errors='replace')

    # Sanitize: remove dangerous elements that can cause auto-navigation
    soup = BeautifulSoup(html, 'html.parser')

    # Remove script tags, base tags, and meta refresh redirects
    for tag in soup.find_all(['script', 'base', 'link']):
        tag.decompose()
    for meta in soup.find_all('meta'):
        if meta.get('http-equiv', '').lower() in ('refresh', 'redirect'):
            meta.decompose()

    # Extract just the body content (skip head styles/scripts)
    body = soup.find('body')
    if body:
        # Unwrap <body> tag but keep its children
        return body.decode_contents()
    return str(soup)


def serve_zim_image(zim_path, image_path):
    """Read an image from a ZIM file. Returns (bytes, mimetype)."""
    from libzim.reader import Archive

    archive = Archive(zim_path)

    # Try direct path, then common prefixes
    for candidate in [image_path, f"I/{image_path}", f"-/{image_path}", f"A/{image_path}"]:
        try:
            entry = archive.get_entry_by_path(candidate)
            if entry.is_redirect:
                entry = entry.get_redirect_entry()
            item = entry.get_item()
            return bytes(item.content), item.mimetype
        except KeyError:
            continue

    raise FileNotFoundError(f"Image not found in ZIM: {image_path}")


# ---------------------------------------------------------------------------
# ZIP indexing
# ---------------------------------------------------------------------------

def index_zip(zip_path, get_index, get_meili_client):
    """
    Index supported files from a ZIP archive into Meilisearch.

    Returns dict with keys: success (int), failed (int), skipped (int), total (int), errors (list).
    """
    zip_path = os.path.abspath(zip_path)
    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f"ZIP file not found: {zip_path}")

    results = {'success': 0, 'failed': 0, 'skipped': 0, 'total': 0, 'errors': []}

    with zipfile.ZipFile(zip_path, 'r') as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue

            results['total'] += 1
            filename = os.path.basename(info.filename)
            file_ext = os.path.splitext(filename)[1].lstrip('.').lower()

            if file_ext not in ALLOWED_EXTENSIONS:
                results['skipped'] += 1
                continue

            try:
                doc_id = _generate_doc_id(zip_path, info.filename)

                # Extract to temp file for processing
                with tempfile.NamedTemporaryFile(suffix=f'.{file_ext}', delete=False) as tmp:
                    tmp.write(zf.read(info.filename))
                    tmp_path = tmp.name

                try:
                    content = extract_text(tmp_path, file_ext)
                    if not content:
                        results['failed'] += 1
                        continue

                    image_metadata = extract_image_metadata(tmp_path, doc_id, file_ext)

                    document = {
                        'id': doc_id,
                        'filename': filename,
                        'content': content[:100000],
                        'file_type': normalize_file_type(file_ext),
                        'file_size': info.file_size,
                        'uploaded_at': datetime.now().isoformat(),
                        'file_path': f"zip://{zip_path}#{info.filename}",
                        'source': 'zip',
                        'folder_root': zip_path,
                        **image_metadata
                    }

                    task = get_index().add_documents([document])
                    get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=30000)
                    results['success'] += 1

                finally:
                    os.unlink(tmp_path)

            except Exception as e:
                results['failed'] += 1
                results['errors'].append(f"{info.filename}: {e}")
                logger.warning(f"Error processing ZIP entry {info.filename}: {e}")

    logger.info(f"ZIP indexing complete: {results['success']} indexed, "
                f"{results['failed']} failed, {results['skipped']} skipped "
                f"out of {results['total']} files")
    return results

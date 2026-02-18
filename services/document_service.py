"""
Document processing service for SearchBox.
Handles text extraction, file validation, image safety, and markdown processing.
"""

import os
import re
import json
import shutil
import logging
import subprocess
import tempfile

from config import ALLOWED_EXTENSIONS, ALLOWED_IMAGE_EXTENSIONS, VAULT_FOLDER

logger = logging.getLogger(__name__)

# ── C++ extractor binary ──
# Resolved once at import time; None if not installed (local dev without compile)
CPP_EXTRACTOR = shutil.which('doc_extractor')
if CPP_EXTRACTOR:
    logger.info(f"C++ doc_extractor found: {CPP_EXTRACTOR}")
else:
    logger.warning("C++ doc_extractor NOT found — PDF/DOCX/XLSX/HTML extraction will fail")

# File types the C++ binary can handle
_CPP_TEXT_TYPES = {'.pdf', '.docx', '.doc', '.xlsx', '.html', '.htm', '.txt', '.md'}
_CPP_IMAGE_TYPES = {'.pdf', '.docx', '.doc', '.xlsx'}


def _adopt_doc_thumbnails(thumb_dirs, doc_id):
    """Adopt C++ pre-generated thumbnail directories for document images.
    Moves thumbnails into static/thumbnails/<doc_id>/ with correct naming.
    Returns image_metadata dict or None if no thumbnails found."""
    target_dir = os.path.join('static/thumbnails', doc_id)
    os.makedirs(target_dir, exist_ok=True)

    adopted_count = 0
    first_image = ''
    all_images = []

    for i, tdir in enumerate(thumb_dirs):
        if not tdir or not os.path.isdir(tdir):
            continue
        try:
            for f in sorted(os.listdir(tdir)):
                if not f.endswith('.jpg'):
                    continue
                parts = f.rsplit('_thumb_0_', 1)
                if len(parts) != 2:
                    continue
                size_part = parts[1]  # e.g. "large.jpg"
                new_name = f"{doc_id}_thumb_{i}_{size_part}"
                src = os.path.join(tdir, f)
                dst = os.path.join(target_dir, new_name)
                shutil.move(src, dst)
                rel = dst.replace('static/', '/static/')
                if '_large.jpg' in new_name and not first_image:
                    first_image = rel
                if '_small.jpg' in new_name:
                    all_images.append(rel)
            adopted_count += 1
            # Clean up empty source dir
            shutil.rmtree(tdir, ignore_errors=True)
        except Exception:
            continue

    if adopted_count > 0 and first_image:
        return {
            'has_images': True,
            'image_count': adopted_count,
            'first_image': first_image,
            'all_images': all_images
        }
    return None


def _cpp_extract_text(file_path, timeout=120):
    """Call doc_extractor binary to extract text from a single file.
    Returns extracted text string, or None on failure."""
    if not CPP_EXTRACTOR:
        return None
    try:
        result = subprocess.run(
            [CPP_EXTRACTOR, file_path, '--text'],
            capture_output=True, text=True, timeout=timeout
        )
        if result.returncode != 0:
            logger.warning(f"C++ extractor returned {result.returncode} for {file_path}")
            if result.stderr:
                logger.warning(f"  stderr: {result.stderr.strip()[:200]}")
            return None
        data = json.loads(result.stdout)
        if data.get('success') and data.get('text', '').strip():
            return data['text'].strip()
        return None
    except subprocess.TimeoutExpired:
        logger.warning(f"C++ extractor timed out for {file_path}")
        return None
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"C++ extractor error for {file_path}: {e}")
        return None


def _cpp_extract_images(file_path, image_out_dir, timeout=120):
    """Call doc_extractor binary to extract images from a single file.
    Returns (images_list, thumb_dirs_list) tuple, or (None, None) on failure.
    thumb_dirs contains paths to C++ pre-generated thumbnail directories."""
    if not CPP_EXTRACTOR:
        return None, None
    try:
        os.makedirs(image_out_dir, exist_ok=True)
        result = subprocess.run(
            [CPP_EXTRACTOR, file_path, '--images', image_out_dir],
            capture_output=True, text=True, timeout=timeout
        )
        if result.returncode != 0:
            return None, None
        data = json.loads(result.stdout)
        if data.get('success'):
            return data.get('images', []), data.get('thumb_dirs', [])
        return None, None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as e:
        logger.warning(f"C++ image extractor error for {file_path}: {e}")
        return None, None


def cpp_batch_extract(directory, image_out_dir=None, text_only=False, timeout=600):
    """Call doc_extractor in batch mode to process an entire directory.
    Returns dict mapping file_path -> {text, images, image_count, file_type}.
    Returns None if the C++ binary is not available."""
    if not CPP_EXTRACTOR:
        return None
    try:
        cmd = [CPP_EXTRACTOR, '--batch', directory]
        if text_only or not image_out_dir:
            cmd.append('--text-only')
        else:
            cmd.extend(['--out', image_out_dir])
            os.makedirs(image_out_dir, exist_ok=True)

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
        # Parse JSONL (one JSON object per line)
        results = {}
        for line in result.stdout.strip().splitlines():
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                fpath = data.get('file')
                if fpath and data.get('success'):
                    results[fpath] = {
                        'text': data.get('text', ''),
                        'images': data.get('images', []),
                        'thumb_dirs': data.get('thumb_dirs', []),
                        'image_count': data.get('image_count', 0),
                        'file_type': data.get('file_type', ''),
                    }
            except json.JSONDecodeError:
                continue
        if result.stderr:
            logger.info(f"C++ batch extractor: {result.stderr.strip()[:300]}")
        return results
    except subprocess.TimeoutExpired:
        logger.warning(f"C++ batch extractor timed out for {directory}")
        return None
    except OSError as e:
        logger.warning(f"C++ batch extractor error: {e}")
        return None


def _cpp_index_zim(zim_path, timeout=7200):
    """Call doc_extractor --zim to extract all HTML articles from a ZIM archive.
    Returns (articles, error_msg) tuple.
    articles is a list of dicts [{path, title, text, image_path, size}, ...], or None on failure.
    error_msg is a string describing the failure, or None on success."""
    if not CPP_EXTRACTOR:
        return None, "C++ doc_extractor binary not found"
    try:
        result = subprocess.run(
            [CPP_EXTRACTOR, '--zim', zim_path],
            capture_output=True, text=True, timeout=timeout
        )
        articles = []
        for line in result.stdout.splitlines():
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                articles.append(data)
            except json.JSONDecodeError:
                continue
        stderr_msg = result.stderr.strip()[:500] if result.stderr else ''
        if stderr_msg:
            logger.info(f"C++ ZIM extractor: {stderr_msg}")
        if result.returncode != 0:
            logger.warning(f"C++ ZIM extractor returned {result.returncode} for {zim_path}")
            if not articles:
                return None, stderr_msg or f"doc_extractor exited with code {result.returncode}"
        return articles, None
    except subprocess.TimeoutExpired:
        logger.warning(f"C++ ZIM extractor timed out for {zim_path}")
        return None, "ZIM extraction timed out (2 hour limit)"
    except OSError as e:
        logger.warning(f"C++ ZIM extractor error: {e}")
        return None, str(e)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def normalize_file_type(file_type):
    """Normalize file_type to always start with '.' and be lowercase."""
    if not file_type:
        return file_type
    file_type = file_type.lower()
    if not file_type.startswith('.'):
        file_type = '.' + file_type
    return file_type


def extract_text(file_path, file_type):
    """Extract text content from various file types using C++ extractor."""
    try:
        file_type = normalize_file_type(file_type)

        # C++ extractor handles document formats
        if file_type in _CPP_TEXT_TYPES:
            cpp_text = _cpp_extract_text(file_path)
            if cpp_text:
                return cpp_text
            return f"Failed to extract text from {file_type} file"

        # Simple Python reads (no library needed)
        elif file_type in ('.txt', '.md'):
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read().strip()

        elif file_type in ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'):
            return f"Image file: {os.path.basename(file_path)}"

        else:
            return f"Unsupported file type: {file_type}"

    except Exception as e:
        logger.error(f"Error extracting text from {file_path}: {e}")
        return f"Error processing file: {str(e)}"


def get_user_approved_paths(IndexedFolder):
    """Get all paths user has explicitly approved (indexed folders + vault)"""
    approved_paths = [VAULT_FOLDER]
    
    try:
        indexed_folders = IndexedFolder.get_all()
        approved_paths.extend([folder.folder_path for folder in indexed_folders])
    except Exception as e:
        logger.error(f"Error loading indexed folders: {e}")
    
    return approved_paths


def is_user_approved_path(path, IndexedFolder, get_documents_index, doc_id=None):
    """Check if a path is user-approved"""
    try:
        normalized_path = os.path.normpath(path)
        
        if doc_id:
            try:
                doc = get_documents_index().get_document(doc_id)
                approved_paths = None
                
                if hasattr(doc, 'approved_image_paths'):
                    approved_paths = doc.approved_image_paths
                elif hasattr(doc, 'get') and callable(doc.get):
                    approved_paths = doc.get('approved_image_paths', [])
                elif isinstance(doc, dict):
                    approved_paths = doc.get('approved_image_paths', [])
                
                if approved_paths and path in approved_paths:
                    logger.info(f"  -> Path approved via document-specific paths: {doc_id}")
                    return True
            except Exception as e:
                logger.info(f"Document-specific approval check failed: {e}")
        
        approved_paths = get_user_approved_paths(IndexedFolder)
        
        logger.info(f"Checking if path is approved: {normalized_path}")
        logger.info(f"Approved paths: {approved_paths}")
        
        for approved_path in approved_paths:
            approved_normalized = os.path.normpath(approved_path)
            if normalized_path.startswith(approved_normalized):
                logger.info(f"  -> Path approved via: {approved_normalized}")
                return True
        
        logger.info(f"  -> Path NOT approved")
        return False
    except Exception as e:
        logger.error(f"Error checking path approval: {e}")
        return False


def is_safe_image_file(file_path):
    """Validate that file is safe to serve"""
    try:
        normalized_path = os.path.normpath(file_path)
        
        if '..' in normalized_path:
            return False
            
        if not os.path.isfile(normalized_path):
            return False
            
        if not any(normalized_path.lower().endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS):
            return False
            
        return True
    except Exception as e:
        logger.error(f"Error validating image file: {e}")
        return False


def process_markdown_content(content, IndexedFolder, get_documents_index, doc_id=None):
    """Process markdown content to replace absolute image paths with web URLs"""
    try:
        pattern = r'!\[([^\]]*)\]\((/[^\s)]+\.(jpg|jpeg|png|gif|webp|svg|bmp))\)'
        
        matches = re.findall(pattern, content)
        if matches:
            logger.info(f"Found {len(matches)} image references in markdown")
            for alt, path, ext in matches:
                logger.info(f"  - Alt: {alt}, Path: {path}, Ext: {ext}")
        
        def replace_image_path(match):
            alt_text = match.group(1)
            original_path = match.group(2)
            
            logger.info(f"Processing image: {original_path}")
            
            if is_user_approved_path(original_path, IndexedFolder, get_documents_index, doc_id) and is_safe_image_file(original_path):
                web_url = f"/local-image{original_path}?doc_id={doc_id}" if doc_id else f"/local-image{original_path}"
                logger.info(f"  -> Replacing with: {web_url}")
                return f'![{alt_text}]({web_url})'
            else:
                logger.info(f"  -> Keeping original (not approved or not safe)")
                return match.group(0)
        
        processed_content = re.sub(pattern, replace_image_path, content)
        
        return processed_content
        
    except Exception as e:
        logger.error(f"Error processing markdown content: {e}")
        return content


def extract_image_metadata(file_path, doc_id, file_ext):
    """Extract image metadata from a document file using C++ extractor.
    Markdown images use Python (no C++ equivalent).
    Returns image_metadata dict."""
    file_ext_normalized = normalize_file_type(file_ext)
    empty_metadata = {
        'has_images': False,
        'image_count': 0,
        'first_image': '',
        'all_images': []
    }

    # C++ image extraction for document formats
    if file_ext_normalized in _CPP_IMAGE_TYPES:
        try:
            tmp_dir = tempfile.mkdtemp(prefix=f'searchbox_img_{doc_id}_')
            raw_paths, thumb_dirs = _cpp_extract_images(str(file_path), tmp_dir)
            if thumb_dirs:
                # Adopt C++ pre-generated thumbnails (no PIL needed)
                adopted = _adopt_doc_thumbnails(thumb_dirs, doc_id)
                shutil.rmtree(tmp_dir, ignore_errors=True)
                if adopted:
                    return adopted
            elif raw_paths:
                # Fallback: use PIL if C++ didn't generate thumbnails
                from utils.image_extractor import image_extractor
                images = image_extractor.generate_thumbnails_from_raw(raw_paths, doc_id)
                shutil.rmtree(tmp_dir, ignore_errors=True)
                if images:
                    return {
                        'has_images': True,
                        'image_count': len(images),
                        'first_image': image_extractor.get_first_thumbnail(doc_id),
                        'all_images': image_extractor.get_all_thumbnails(doc_id)
                    }
            else:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            return empty_metadata
        except Exception as e:
            logger.error(f"C++ image extraction failed for {doc_id}: {e}")
            return empty_metadata

    # Markdown images — Python only (no C++ equivalent)
    elif file_ext_normalized == '.md':
        try:
            from utils.image_extractor import image_extractor
            images = image_extractor.extract_images_from_markdown(str(file_path), doc_id)
            
            if images:
                metadata = {
                    'has_images': True,
                    'image_count': len(images),
                    'first_image': image_extractor.get_first_thumbnail(doc_id),
                    'all_images': image_extractor.get_all_thumbnails(doc_id)
                }
                # Extract original paths for approval (markdown-specific)
                approved_image_paths = [img['original_path'] for img in images if 'original_path' in img]
                if approved_image_paths:
                    metadata['approved_image_paths'] = approved_image_paths
                return metadata
            return empty_metadata
        except Exception as e:
            logger.error(f"Error extracting images from markdown {doc_id}: {e}")
            return empty_metadata
    
    return empty_metadata

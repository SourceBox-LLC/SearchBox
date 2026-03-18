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
Document API routes for SearchBox.
Handles document CRUD, upload, thumbnails, PDF/DOCX serving, and local images.
"""

import io
import os
import uuid
import tempfile
import subprocess
import logging
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file, current_app, session
from werkzeug.utils import secure_filename

from config import VAULT_FOLDER
from services.document_service import (
    allowed_file,
    normalize_file_type,
    extract_text,
    is_user_approved_path,
    is_safe_image_file,
    process_markdown_content,
    extract_image_metadata,
)
from services.meilisearch_service import get_meili_client
from services.vault_service import get_vault_config, derive_kek_from_password
from utils.crypto import (
    generate_dek,
    wrap_dek,
    unwrap_dek,
    encrypt_file,
    decrypt_file,
    decrypt_file_to_temp,
)
from routes.helpers import get_config as _get_config, get_index as _get_index
from utils.decorators import api_login_required

documents_bp = Blueprint("documents", __name__)
logger = logging.getLogger(__name__)

import re as _re


def _get_session_kek():
    """Get KEK from session, deriving from password if needed."""
    kek_hex = session.get("vault_kek")
    if kek_hex:
        return bytes.fromhex(kek_hex)
    return None


def _sanitize_filter_value(value):
    """Sanitize a value for use in Meilisearch filter strings to prevent injection."""
    if not isinstance(value, str):
        return ""
    return _re.sub(r"[^a-zA-Z0-9_\-.]", "", value)


def _decrypt_vault_file(doc_id, file_path_on_disk):
    """
    Decrypt a vault file and return (plaintext_bytes, original_ext).
    For unencrypted legacy files, reads directly.
    Uses KEK from session (derived from admin password at login).

    Args:
        doc_id: Document ID.
        file_path_on_disk: The file_path stored in Meilisearch (relative to VAULT_FOLDER).

    Returns:
        bytes: File contents.

    Raises:
        PermissionError: If KEK is not available in session.
        FileNotFoundError: If file doesn't exist.
    """
    full_path = os.path.join(VAULT_FOLDER, file_path_on_disk)

    if file_path_on_disk.endswith(".enc"):
        kek = _get_session_kek()
        if not kek:
            raise PermissionError("Vault key not available. Please log in again.")

        enc_entry = current_app.EncryptedFile.get_by_doc_id(doc_id)
        if not enc_entry:
            raise FileNotFoundError(f"Encryption metadata not found for {doc_id}")

        try:
            dek = unwrap_dek(kek, enc_entry.wrapped_dek)
        except Exception:
            raise PermissionError("Could not decrypt file key")

        return decrypt_file(dek, full_path)
    else:
        # Legacy unencrypted file
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File not found: {full_path}")
        with open(full_path, "rb") as f:
            return f.read()


def _enrich_doc(doc_dict, doc_id):
    """Add is_image flag and process markdown image paths for a document dict."""
    IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"]
    ft = normalize_file_type(doc_dict.get("file_type", ""))
    doc_dict["is_image"] = ft in IMAGE_EXTENSIONS

    if ft == ".md" and doc_dict.get("content"):
        IndexedFolder = current_app.IndexedFolder
        doc_dict["content"] = process_markdown_content(
            doc_dict["content"], IndexedFolder, _get_index, doc_id
        )
    return doc_dict


def _fetch_document(doc_id):
    """Fetch a document by ID with fallback strategies. Returns dict or None."""
    # Strategy 1: direct fetch
    try:
        doc = _get_index().get_document(doc_id)
        if hasattr(doc, "__dict__"):
            keys = [
                "id",
                "filename",
                "content",
                "file_type",
                "file_size",
                "uploaded_at",
                "file_path",
                "source",
                "folder_root",
                "approved_image_paths",
                "zim_article_url",
            ]
            return {k: getattr(doc, k) for k in keys if hasattr(doc, k)}
        return doc if isinstance(doc, dict) else None
    except Exception:
        pass

    # Strategy 2: filter search
    try:
        results = _get_index().search(
            "", {"filter": f'id = "{_sanitize_filter_value(doc_id)}"', "limit": 1}
        )
        if results["hits"]:
            return results["hits"][0]
    except Exception:
        pass

    return None


@documents_bp.route("/api/document/<doc_id>")
@api_login_required
def get_document(doc_id):
    """Get a specific document by ID."""
    doc_dict = _fetch_document(doc_id)
    if doc_dict is None:
        return jsonify({"error": "Document not found"}), 404

    return jsonify(_enrich_doc(doc_dict, doc_id))


@documents_bp.route("/api/document/<doc_id>/open", methods=["POST"])
@api_login_required
def open_document(doc_id):
    """Open document in system default application."""
    try:
        doc = _fetch_document(doc_id)
        if not doc:
            return jsonify({"error": "Document not found"}), 404
        file_path = doc.get("file_path")
        if not file_path:
            return jsonify({"error": "File not found"}), 404

        if doc.get("source") == "vault" and file_path.endswith(".enc"):
            # Decrypt to a temp file for opening
            try:
                file_bytes = _decrypt_vault_file(doc_id, file_path)
            except PermissionError as e:
                return jsonify({"error": str(e)}), 401
            except FileNotFoundError as e:
                return jsonify({"error": str(e)}), 404
            ext = os.path.splitext(doc.get("filename", ""))[1]
            fd, temp_path = tempfile.mkstemp(suffix=ext)
            try:
                os.write(fd, file_bytes)
            finally:
                os.close(fd)
            subprocess.Popen(["xdg-open", temp_path])
            # Schedule temp file cleanup after app has had time to open it
            import threading

            def _cleanup_temp(path, delay=30):
                import time

                time.sleep(delay)
                try:
                    if os.path.exists(path):
                        os.remove(path)
                except OSError:
                    pass

            threading.Thread(
                target=_cleanup_temp, args=(temp_path,), daemon=True
            ).start()
            return jsonify({"success": True})
        else:
            # Non-vault or legacy unencrypted vault file
            full_path = (
                file_path
                if os.path.isabs(file_path)
                else os.path.join(VAULT_FOLDER, file_path)
            )
            if os.path.exists(full_path):
                subprocess.Popen(["xdg-open", full_path])
                return jsonify({"success": True})
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@documents_bp.route("/api/document/<doc_id>/reveal", methods=["POST"])
@api_login_required
def reveal_document(doc_id):
    """Reveal document in file manager."""
    try:
        doc = _fetch_document(doc_id)
        if not doc:
            return jsonify({"error": "Document not found"}), 404
        file_path = doc.get("file_path")
        if not file_path:
            return jsonify({"error": "File not found"}), 404

        if doc.get("source") == "vault":
            # For vault files, reveal the vault folder
            subprocess.Popen(["xdg-open", VAULT_FOLDER])
            return jsonify({"success": True})
        else:
            if os.path.exists(file_path):
                folder = os.path.dirname(file_path)
                subprocess.Popen(["xdg-open", folder])
                return jsonify({"success": True})
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@documents_bp.route("/api/upload", methods=["POST"])
@api_login_required
def upload_file():
    """Handle file upload, extract text, encrypt, and index to Meilisearch."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed"}), 400

    doc_id = str(uuid.uuid4())[:8]
    file_ext = file.filename.rsplit(".", 1)[1].lower()
    sanitized_name = secure_filename(file.filename)
    safe_filename = f"{doc_id}_{sanitized_name}"

    # Save to a temp file first for text extraction and image extraction
    temp_path = os.path.join(VAULT_FOLDER, safe_filename)
    file.save(temp_path)

    file_size = os.path.getsize(temp_path)
    content = extract_text(temp_path, file_ext)

    if not content:
        os.remove(temp_path)
        return jsonify({"error": "Could not extract text from file"}), 400

    image_metadata = extract_image_metadata(temp_path, doc_id, file_ext)

    # Encrypt the file
    vault_config = get_vault_config(current_app.VaultConfig)
    encrypted_filename = safe_filename + ".enc"
    encrypted_path = os.path.join(VAULT_FOLDER, encrypted_filename)

    if "salt" in vault_config:
        # Vault is set up — encrypt the file
        kek = _get_session_kek()
        if not kek:
            os.remove(temp_path)
            return jsonify(
                {"error": "Vault key not available. Please log in again."}
            ), 401

        try:
            dek = generate_dek()
            encrypt_file(dek, temp_path, encrypted_path)

            wrapped = wrap_dek(kek, dek)

            # Store encryption metadata
            current_app.EncryptedFile.create(
                doc_id=doc_id,
                wrapped_dek=wrapped,
                encrypted_filename=encrypted_filename,
                original_filename=file.filename,
            )

            # Delete the plaintext temp file
            os.remove(temp_path)
            logger.info(f"File {doc_id} encrypted successfully")

            stored_filename = encrypted_filename

        except Exception as e:
            logger.error(f"Encryption failed for {doc_id}: {e}", exc_info=True)
            # Clean up
            if os.path.exists(temp_path):
                os.remove(temp_path)
            if os.path.exists(encrypted_path):
                os.remove(encrypted_path)
            return jsonify({"error": f"File encryption failed: {str(e)}"}), 500
    else:
        # Vault not set up — store plaintext (legacy behavior)
        stored_filename = safe_filename
        logger.warning(f"Vault not set up — file {doc_id} stored unencrypted")

    document = {
        "id": doc_id,
        "filename": file.filename,
        "content": content,
        "file_type": normalize_file_type(file_ext),
        "file_size": file_size,
        "uploaded_at": datetime.now().isoformat(),
        "file_path": stored_filename,
        "source": "vault",
        "folder_root": None,
        **image_metadata,
    }

    try:
        logger.info(f"Adding document to Meilisearch: {doc_id}")
        task = _get_index().add_documents([document])
        get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=30000)
        logger.info(f"Document {doc_id} indexed successfully")

    except Exception as e:
        logger.error(f"Error indexing document {doc_id}: {e}", exc_info=True)
        # Clean up the stored file (encrypted or plaintext)
        stored_path = os.path.join(VAULT_FOLDER, stored_filename)
        if os.path.exists(stored_path):
            os.remove(stored_path)
        return jsonify({"error": f"Failed to index document: {str(e)}"}), 500

    return jsonify(
        {
            "success": True,
            "document": {
                "id": doc_id,
                "filename": file.filename,
                "file_type": normalize_file_type(file_ext),
                "file_size": file_size,
                "uploaded_at": document["uploaded_at"],
                "source": "vault",
            },
        }
    )


@documents_bp.route("/api/documents", methods=["GET"])
@api_login_required
def get_documents():
    """Get all indexed documents."""
    try:
        try:
            vault_results = _get_index().search(
                "", {"filter": 'source = "vault"', "limit": 1000}
            )
        except Exception as e:
            logger.debug(f"Could not filter vault documents: {e}")
            vault_results = {"hits": []}

        try:
            other_results = _get_index().search(
                "", {"filter": 'source != "vault"', "limit": 1000}
            )
        except Exception as e:
            logger.debug(f"Could not filter non-vault documents: {e}")
            try:
                other_results = _get_index().search("", {"limit": 1000})
            except Exception:
                other_results = {"hits": []}

        all_hits = vault_results["hits"] + other_results["hits"]

        documents = [
            {
                "id": hit["id"],
                "filename": hit["filename"],
                "file_type": normalize_file_type(hit["file_type"]),
                "file_size": hit["file_size"],
                "uploaded_at": hit["uploaded_at"],
                "source": hit.get("source", "vault"),
                "folder_root": hit.get("folder_root"),
                "has_images": hit.get("has_images"),
                "image_count": hit.get("image_count"),
                "first_image": hit.get("first_image"),
                "all_images": hit.get("all_images", []),
            }
            for hit in all_hits
        ]

        return jsonify({"documents": documents})
    except Exception as e:
        logger.error(f"Documents API error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@documents_bp.route("/api/documents/<doc_id>", methods=["DELETE"])
@api_login_required
def delete_document(doc_id):
    """Delete a document from index, storage, and encryption metadata."""
    try:
        results = _get_index().search(
            "", {"filter": f'id = "{_sanitize_filter_value(doc_id)}"', "limit": 1}
        )

        if results["hits"]:
            doc = results["hits"][0]
            if doc.get("source") == "vault":
                file_path = os.path.join(VAULT_FOLDER, doc.get("file_path", ""))
                if os.path.exists(file_path):
                    os.remove(file_path)
                # Clean up encryption metadata
                current_app.EncryptedFile.delete_by_doc_id(doc_id)

        task = _get_index().delete_document(doc_id)
        get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=10000)

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": "Failed to delete document"}), 500


@documents_bp.route("/api/thumbnail/<doc_id>")
@api_login_required
def get_thumbnail(doc_id):
    """Get thumbnail for a document."""
    try:
        doc = _get_index().get_document(doc_id)

        first_image = getattr(doc, "first_image", None) or ""

        if first_image:
            clean_path = first_image.removeprefix("/static/").lstrip("/")
            thumbnail_path = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "static", clean_path)
            )
            static_root = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "static")
            )
            if not thumbnail_path.startswith(static_root):
                return jsonify({"error": "Invalid thumbnail path"}), 400
            if os.path.exists(thumbnail_path):
                return send_file(thumbnail_path)

        all_images = getattr(doc, "all_images", None) or []
        if all_images and len(all_images) > 0:
            first_thumb = all_images[0]
            if isinstance(first_thumb, dict):
                thumb_path = first_thumb.get("thumbnail", first_thumb.get("path", ""))
            else:
                thumb_path = first_thumb

            if thumb_path:
                clean_thumb = thumb_path.removeprefix("/static/").lstrip("/")
                full_path = os.path.normpath(
                    os.path.join(os.path.dirname(__file__), "..", "static", clean_thumb)
                )
                if not full_path.startswith(static_root):
                    return jsonify({"error": "Invalid thumbnail path"}), 400
                if os.path.exists(full_path):
                    return send_file(full_path)

        return jsonify({"error": "No thumbnail available"}), 404

    except Exception as e:
        logger.error(f"Error getting thumbnail for {doc_id}: {e}")
        return jsonify({"error": "Thumbnail not found"}), 404


@documents_bp.route("/local-image/<path:image_path>")
@api_login_required
def serve_local_image(image_path):
    """Serve local images from user-approved paths for markdown rendering."""
    try:
        file_path = f"/{image_path}"
        doc_id = request.args.get("doc_id")
        IndexedFolder = current_app.IndexedFolder

        logger.debug(f"Image request: {file_path} (doc_id: {doc_id})")

        if not is_user_approved_path(file_path, IndexedFolder, _get_index, doc_id):
            logger.warning(f"Access denied for non-approved path: {file_path}")
            return jsonify({"error": "Image not found or access denied"}), 404

        if not is_safe_image_file(file_path):
            logger.warning(f"Unsafe file request: {file_path}")
            return jsonify({"error": "Image not found or access denied"}), 404

        return send_file(file_path)

    except Exception as e:
        logger.error(f"Error serving local image {image_path}: {e}")
        return jsonify({"error": "Image not found"}), 404


@documents_bp.route("/api/pdf/<doc_id>")
@api_login_required
def get_pdf(doc_id):
    """Serve PDF files for proper rendering."""
    try:
        doc = _get_index().get_document(doc_id)

        if (
            not hasattr(doc, "file_type")
            or normalize_file_type(doc.file_type) != ".pdf"
        ):
            return jsonify({"error": "Not a PDF file"}), 400

        if doc.source == "vault":
            try:
                file_bytes = _decrypt_vault_file(doc_id, doc.file_path)
                return send_file(io.BytesIO(file_bytes), mimetype="application/pdf")
            except PermissionError as e:
                return jsonify({"error": str(e)}), 401
            except FileNotFoundError as e:
                return jsonify({"error": str(e)}), 404
        else:
            file_path = doc.file_path
            if not os.path.exists(file_path):
                return jsonify({"error": "PDF file not found"}), 404
            return send_file(file_path, mimetype="application/pdf")

    except Exception as e:
        logger.error(f"Error serving PDF for {doc_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to serve PDF"}), 500


@documents_bp.route("/api/docx/<doc_id>")
@api_login_required
def get_docx(doc_id):
    """Serve DOCX files for proper rendering."""
    try:
        doc = _get_index().get_document(doc_id)

        if not hasattr(doc, "file_type") or normalize_file_type(doc.file_type) not in [
            ".docx",
            ".doc",
        ]:
            return jsonify({"error": "Not a DOCX file"}), 400

        if doc.source == "vault":
            try:
                file_bytes = _decrypt_vault_file(doc_id, doc.file_path)
                return send_file(
                    io.BytesIO(file_bytes),
                    mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            except PermissionError as e:
                return jsonify({"error": str(e)}), 401
            except FileNotFoundError as e:
                return jsonify({"error": str(e)}), 404
        else:
            file_path = doc.file_path
            if not os.path.exists(file_path):
                return jsonify({"error": "DOCX file not found"}), 404
            return send_file(
                file_path,
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

    except Exception as e:
        logger.error(f"Error serving DOCX for {doc_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to serve DOCX"}), 500

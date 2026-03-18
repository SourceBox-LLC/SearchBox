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
Meilisearch process management and client initialization service.
"""

import os
import subprocess
import time
import signal
import logging

import meilisearch

from config import INDEX_NAME

logger = logging.getLogger(__name__)

meili_process = None
meili_client = None
documents_index = None
org_indexes = {}


def is_meilisearch_running(get_config):
    """Check if Meilisearch is responding."""
    config = get_config()
    try:
        client = meilisearch.Client(
            f"{config['meilisearch_host']}:{config['meilisearch_port']}",
            config["master_key"],
        )
        client.health()
        return True
    except Exception:
        return False


def start_meilisearch(get_config):
    """Start Meilisearch server."""
    global meili_process

    config = get_config()

    if is_meilisearch_running(get_config):
        logger.info("Meilisearch is already running")
        return True

    meili_path = config["meilisearch_path"]

    if not meili_path or not os.path.isfile(meili_path):
        logger.warning(f"Meilisearch binary not found at: {meili_path}")
        return False

    try:
        cmd = [
            meili_path,
            "--http-addr",
            f"localhost:{config['meilisearch_port']}",
            "--master-key",
            config["master_key"],
            "--db-path",
            config["data_path"],
            "--no-analytics",
        ]

        meili_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        for _ in range(20):
            time.sleep(0.5)
            if is_meilisearch_running(get_config):
                logger.info(f"Meilisearch started on port {config['meilisearch_port']}")
                return True

        logger.warning("Meilisearch failed to start in time")
        return False

    except Exception as e:
        logger.error(f"Failed to start Meilisearch: {e}")
        return False


def stop_meilisearch(get_config):
    """Stop Meilisearch server."""
    global meili_process

    config = get_config()
    port = config["meilisearch_port"]

    if meili_process:
        try:
            os.killpg(os.getpgid(meili_process.pid), signal.SIGTERM)
            meili_process.wait(timeout=5)
            meili_process = None
            logger.info("Meilisearch stopped (via process reference)")
            return True
        except Exception as e:
            logger.warning(f"Failed to stop via process reference: {e}")

    try:
        result = subprocess.run(
            ["lsof", "-t", "-i", f":{port}"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split("\n")
            for pid in pids:
                try:
                    os.kill(int(pid), signal.SIGTERM)
                    logger.info(f"Meilisearch stopped (killed PID {pid})")
                except (OSError, IOError):
                    pass
            time.sleep(1)
            if not is_meilisearch_running(get_config):
                return True
    except Exception as e:
        logger.debug(f"lsof method failed: {e}")

    try:
        result = subprocess.run(
            ["fuser", "-k", f"{port}/tcp"], capture_output=True, text=True, timeout=5
        )
        time.sleep(1)
        if not is_meilisearch_running(get_config):
            logger.info("Meilisearch stopped (via fuser)")
            return True
    except Exception as e:
        logger.debug(f"fuser method failed: {e}")

    try:
        subprocess.run(["pkill", "-f", "meilisearch"], timeout=5)
        time.sleep(1)
        if not is_meilisearch_running(get_config):
            logger.info("Meilisearch stopped (via pkill)")
            return True
    except Exception as e:
        logger.debug(f"pkill method failed: {e}")

    return False


def auto_start_meilisearch(get_config):
    """Auto-start Meilisearch if configured to do so."""
    config = get_config()
    if config["auto_start"]:
        start_meilisearch(get_config)


def cleanup():
    """Cleanup on exit."""
    global meili_process
    if meili_process:
        try:
            os.killpg(os.getpgid(meili_process.pid), signal.SIGTERM)
        except Exception:
            pass


def init_meilisearch_client(get_config):
    """Initialize Meilisearch client."""
    global meili_client
    if meili_client is None:
        config = get_config()
        MEILISEARCH_HOST = f"{config['meilisearch_host']}:{config['meilisearch_port']}"
        MEILISEARCH_KEY = config["master_key"]
        meili_client = meilisearch.Client(MEILISEARCH_HOST, MEILISEARCH_KEY)
    return meili_client


def get_index_name_for_org(organization_id=None):
    """
    Get the index name for an organization.

    Args:
        organization_id: Organization ID (None for self-hosted/default)

    Returns:
        str: Index name
    """
    if organization_id is None:
        return INDEX_NAME
    return f"{INDEX_NAME}_org_{organization_id}"


def init_index(get_config, organization_id=None):
    """
    Create or get the documents index for an organization.

    Args:
        get_config: Function to get configuration
        organization_id: Organization ID (None for self-hosted/default)

    Returns:
        Meilisearch index instance
    """
    client = init_meilisearch_client(get_config)
    index_name = get_index_name_for_org(organization_id)

    try:
        client.create_index(index_name, {"primaryKey": "id"})
    except meilisearch.errors.MeilisearchApiError:
        pass

    index = client.index(index_name)
    index.update_searchable_attributes(["content", "filename"])
    index.update_displayed_attributes(
        [
            "id",
            "filename",
            "content",
            "file_type",
            "file_size",
            "uploaded_at",
            "file_path",
            "source",
            "folder_root",
            "has_images",
            "image_count",
            "first_image",
            "all_images",
            "torrent_hash",
            "torrent_name",
            "zim_article_url",
        ]
    )
    index.update_filterable_attributes(
        ["id", "source", "folder_root", "file_type", "has_images", "torrent_hash"]
    )
    index.update_sortable_attributes(["uploaded_at", "filename", "file_size"])
    return index


def get_documents_index(get_config, organization_id=None):
    """
    Get the documents index for an organization.

    Args:
        get_config: Function to get configuration
        organization_id: Organization ID (None for self-hosted/default)

    Returns:
        Meilisearch index instance
    """
    global documents_index, org_indexes

    if organization_id is None:
        if documents_index is None:
            documents_index = init_index(get_config, organization_id=None)
        return documents_index

    if organization_id not in org_indexes:
        org_indexes[organization_id] = init_index(
            get_config, organization_id=organization_id
        )

    return org_indexes[organization_id]


def get_meili_client():
    """Get the current Meilisearch client (must be initialized first)."""
    return meili_client

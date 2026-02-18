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

# Module-level state
meili_process = None
meili_client = None
documents_index = None


def is_meilisearch_running(get_config):
    """Check if Meilisearch is responding."""
    config = get_config()
    try:
        client = meilisearch.Client(
            f"{config['meilisearch_host']}:{config['meilisearch_port']}", 
            config['master_key']
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
    
    meili_path = config['meilisearch_path']

    if not meili_path or not os.path.isfile(meili_path):
        logger.warning(f"Meilisearch binary not found at: {meili_path}")
        return False
    
    try:
        cmd = [
            meili_path,
            '--http-addr', f"localhost:{config['meilisearch_port']}",
            '--master-key', config['master_key'],
            '--db-path', config['data_path'],
            '--no-analytics'
        ]
        
        meili_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
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
    port = config['meilisearch_port']
    
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
            ['lsof', '-t', '-i', f':{port}'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split('\n')
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
            ['fuser', '-k', f'{port}/tcp'],
            capture_output=True, text=True, timeout=5
        )
        time.sleep(1)
        if not is_meilisearch_running(get_config):
            logger.info("Meilisearch stopped (via fuser)")
            return True
    except Exception as e:
        logger.debug(f"fuser method failed: {e}")
    
    try:
        subprocess.run(['pkill', '-f', 'meilisearch'], timeout=5)
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
    if config['auto_start']:
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
        MEILISEARCH_KEY = config['master_key']
        meili_client = meilisearch.Client(MEILISEARCH_HOST, MEILISEARCH_KEY)
    return meili_client


def init_index(get_config):
    """Create or get the documents index."""
    client = init_meilisearch_client(get_config)
    try:
        client.create_index(INDEX_NAME, {'primaryKey': 'id'})
    except meilisearch.errors.MeilisearchApiError:
        pass
    
    index = client.index(INDEX_NAME)
    index.update_searchable_attributes(['content', 'filename'])
    index.update_displayed_attributes(['id', 'filename', 'content', 'file_type', 'file_size', 'uploaded_at', 'file_path', 'source', 'folder_root', 'has_images', 'image_count', 'first_image', 'all_images', 'torrent_hash', 'torrent_name', 'zim_article_url'])
    index.update_filterable_attributes(['id', 'source', 'folder_root', 'file_type', 'has_images', 'torrent_hash'])
    index.update_sortable_attributes(['uploaded_at', 'filename', 'file_size'])
    return index


def get_documents_index(get_config):
    """Get the documents index, initializing if needed."""
    global documents_index
    if documents_index is None:
        documents_index = init_index(get_config)
    return documents_index


def get_meili_client():
    """Get the current Meilisearch client (must be initialized first)."""
    return meili_client

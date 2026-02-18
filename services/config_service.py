"""
Configuration management service for SearchBox.
"""

import os
import logging

from config import BASE_DIR, MEILI_DATA_DIR

logger = logging.getLogger(__name__)

def get_default_meili_path():
    """Try to find Meilisearch binary."""
    paths_to_check = [
        os.path.expanduser('~/meilisearch'),
        '/usr/local/bin/meilisearch',
        '/usr/bin/meilisearch',
        os.path.join(BASE_DIR, 'meilisearch'),
    ]
    for path in paths_to_check:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return ''


def _str_to_bool(value):
    """Convert a string config value to bool."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes')
    return bool(value)


def _str_to_int(value, default):
    """Convert a string config value to int with fallback."""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def get_searchbox_config(app, Settings):
    """Get SearchBox configuration from database."""
    defaults = {
        'meilisearch_path': get_default_meili_path(),
        'meilisearch_host': 'http://localhost',
        'meilisearch_port': 7700,
        'master_key': 'aSampleMasterKey',
        'auto_start': True,
        'data_path': MEILI_DATA_DIR,
        'ai_search_enabled': False,
        'ollama_url': 'http://localhost:11434',
        'ollama_model': 'llama2',
        'ollama_timeout': 30,
        'ollama_autoconnect': False,
        'qbt_enabled': False,
        'qbt_host': 'http://localhost',
        'qbt_port': 8080,
        'qbt_username': 'admin',
        'qbt_password': '',
    }

    with app.app_context():
        db_settings = Settings.get_all()

    config = defaults.copy()
    config.update(db_settings)

    # Environment variable overrides (used in Docker)
    if os.environ.get('MEILI_HOST'):
        config['meilisearch_host'] = os.environ['MEILI_HOST']
    if os.environ.get('MEILI_PORT'):
        config['meilisearch_port'] = os.environ['MEILI_PORT']
    if os.environ.get('MEILI_MASTER_KEY'):
        config['master_key'] = os.environ['MEILI_MASTER_KEY']
    if os.environ.get('MEILI_AUTO_START'):
        config['auto_start'] = os.environ['MEILI_AUTO_START']
    if os.environ.get('OLLAMA_URL'):
        config['ollama_url'] = os.environ['OLLAMA_URL']
    if os.environ.get('QBT_HOST'):
        config['qbt_host'] = os.environ['QBT_HOST']
    if os.environ.get('QBT_PORT'):
        config['qbt_port'] = os.environ['QBT_PORT']

    # Coerce types (DB stores everything as strings)
    config['meilisearch_port'] = _str_to_int(config['meilisearch_port'], defaults['meilisearch_port'])
    config['ollama_timeout'] = _str_to_int(config['ollama_timeout'], defaults['ollama_timeout'])
    config['auto_start'] = _str_to_bool(config['auto_start'])
    config['ai_search_enabled'] = _str_to_bool(config['ai_search_enabled'])
    config['ollama_autoconnect'] = _str_to_bool(config['ollama_autoconnect'])
    config['qbt_enabled'] = _str_to_bool(config['qbt_enabled'])
    config['qbt_port'] = _str_to_int(config['qbt_port'], defaults['qbt_port'])

    return config


def save_searchbox_config(app, Settings, config):
    """Save SearchBox configuration to database."""
    with app.app_context():
        for key, value in config.items():
            if key == 'master_key':
                continue
            Settings.set(key, str(value), f"SearchBox configuration: {key}")

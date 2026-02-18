"""Shared route helpers — eliminates duplicated _get_config / _get_index across blueprints."""

from flask import current_app

from services.config_service import get_searchbox_config
from services.meilisearch_service import get_documents_index


def get_config():
    """Get the current SearchBox configuration dict."""
    return get_searchbox_config(current_app._get_current_object(), current_app.Settings)


def get_index():
    """Get the Meilisearch documents index."""
    return get_documents_index(get_config)

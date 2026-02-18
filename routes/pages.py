"""
Page routes for SearchBox — serves HTML templates.
"""

import os
from flask import Blueprint, render_template
from routes.helpers import get_config as _get_config

pages_bp = Blueprint('pages', __name__)


def _meili_config():
    """Return Meilisearch client config for templates (browser-facing)."""
    config = _get_config()
    # MEILI_PUBLIC_HOST is the browser-accessible URL (differs from server-side in Docker)
    public_host = os.environ.get('MEILI_PUBLIC_HOST', config.get('meilisearch_host', 'http://localhost'))
    port = config.get('meilisearch_port', 7700)
    return {
        'host': f"{public_host}:{port}",
        'api_key': config.get('master_key', 'aSampleMasterKey'),
    }


@pages_bp.route("/")
def index():
    return render_template("index.html", meili=_meili_config())


@pages_bp.route("/settings")
def settings():
    return render_template("settings.html")


@pages_bp.route("/view/<doc_id>")
def view_document(doc_id):
    """View a specific document."""
    return render_template("view.html", doc_id=doc_id)


@pages_bp.route("/explore")
def explore():
    """Visual browse page for all indexed documents."""
    return render_template("explore.html", meili=_meili_config())


@pages_bp.route("/images")
def images_search():
    """Dedicated image search page."""
    return render_template("images.html", meili=_meili_config())

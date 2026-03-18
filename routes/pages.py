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
Page routes for SearchBox — serves HTML templates.
"""

import os
from flask import Blueprint, render_template
from routes.helpers import get_config as _get_config
from utils.decorators import login_required

pages_bp = Blueprint("pages", __name__)


def _meili_config():
    """Return Meilisearch client config for templates (browser-facing)."""
    config = _get_config()
    # MEILI_PUBLIC_HOST is the browser-accessible URL (differs from server-side in Docker)
    public_host = os.environ.get(
        "MEILI_PUBLIC_HOST", config.get("meilisearch_host", "http://localhost")
    )
    port = config.get("meilisearch_port", 7700)
    return {
        "host": f"{public_host}:{port}",
        "api_key": config.get("master_key", "aSampleMasterKey"),
    }


@pages_bp.route("/")
@login_required
def index():
    return render_template("index.html", meili=_meili_config())


@pages_bp.route("/settings")
@login_required
def settings():
    return render_template("settings.html")


@pages_bp.route("/view/<doc_id>")
@login_required
def view_document(doc_id):
    """View a specific document."""
    return render_template("view.html", doc_id=doc_id)


@pages_bp.route("/explore")
@login_required
def explore():
    """Visual browse page for all indexed documents."""
    return render_template("explore.html", meili=_meili_config())


@pages_bp.route("/images")
@login_required
def images_search():
    """Dedicated image search page."""
    return render_template("images.html", meili=_meili_config())

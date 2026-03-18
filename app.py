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
SearchBox — Local document search engine with AI-powered summaries.
Application factory and entrypoint.
"""

import os
import secrets
import atexit
import logging

from datetime import timedelta

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect
from models import create_models

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SAAS_MODE = os.environ.get("SAAS_MODE", "false").lower() == "true"


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)

    logging.basicConfig(level=logging.INFO)

    app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
    db_dir = os.environ.get("SEARCHBOX_DB_DIR", BASE_DIR)
    os.makedirs(db_dir, exist_ok=True)
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"sqlite:///{os.path.join(db_dir, 'searchbox.db')}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
    app.config["WTF_CSRF_TIME_LIMIT"] = None
    app.config["SAAS_MODE"] = SAAS_MODE

    csrf = CSRFProtect(app)

    db = SQLAlchemy()
    db.init_app(app)

    (
        Organization,
        Team,
        TeamMember,
        User,
        Settings,
        IndexedFolder,
        VaultConfig,
        EncryptedFile,
        QBTorrent,
        IndexedArchive,
        Bookmark,
    ) = create_models(db)

    with app.app_context():
        db.create_all()

        if not SAAS_MODE:
            from services.migration_service import ensure_default_organization

            ensure_default_organization(db, Organization, User, app)

    app.Organization = Organization
    app.Team = Team
    app.TeamMember = TeamMember
    app.User = User
    app.Settings = Settings
    app.IndexedFolder = IndexedFolder
    app.VaultConfig = VaultConfig
    app.EncryptedFile = EncryptedFile
    app.QBTorrent = QBTorrent
    app.IndexedArchive = IndexedArchive
    app.Bookmark = Bookmark
    app.db = db

    from routes.auth import auth_bp
    from routes.pages import pages_bp
    from routes.meilisearch_routes import meilisearch_bp
    from routes.documents import documents_bp
    from routes.folders import folders_bp
    from routes.vault import vault_bp
    from routes.ollama import ollama_bp
    from routes.settings import settings_bp
    from routes.qbittorrent import qbittorrent_bp
    from routes.zim import zim_bp
    from routes.organization import organization_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(meilisearch_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(folders_bp)
    app.register_blueprint(vault_bp)
    app.register_blueprint(ollama_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(qbittorrent_bp)
    app.register_blueprint(zim_bp)
    app.register_blueprint(organization_bp)

    from services.config_service import get_searchbox_config
    from services.meilisearch_service import auto_start_meilisearch, cleanup

    def _get_config():
        return get_searchbox_config(app, Settings)

    auto_start_meilisearch(_get_config)
    atexit.register(cleanup)

    return app


app = create_app()


if __name__ == "__main__":
    host = os.environ.get("SEARCHBOX_HOST", "127.0.0.1")
    port = int(os.environ.get("SEARCHBOX_PORT", "5000"))
    app.run(host=host, port=port, debug=False)

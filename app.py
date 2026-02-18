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

BASE_DIR = os.path.dirname(__file__)


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)

    logging.basicConfig(level=logging.INFO)

    app.secret_key = os.environ.get('FLASK_SECRET_KEY', secrets.token_hex(32))
    db_dir = os.environ.get('SEARCHBOX_DB_DIR', BASE_DIR)
    os.makedirs(db_dir, exist_ok=True)
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(db_dir, "searchbox.db")}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB upload limit
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
    app.config['WTF_CSRF_TIME_LIMIT'] = None  # CSRF token valid for session lifetime

    csrf = CSRFProtect(app)

    db = SQLAlchemy()
    db.init_app(app)

    Settings, IndexedFolder, VaultConfig, EncryptedFile, QBTorrent, IndexedArchive = create_models(db)

    with app.app_context():
        db.create_all()

    app.Settings = Settings
    app.IndexedFolder = IndexedFolder
    app.VaultConfig = VaultConfig
    app.EncryptedFile = EncryptedFile
    app.QBTorrent = QBTorrent
    app.IndexedArchive = IndexedArchive
    app.db = db

    # Register blueprints
    from routes.pages import pages_bp
    from routes.meilisearch_routes import meilisearch_bp
    from routes.documents import documents_bp
    from routes.folders import folders_bp
    from routes.vault import vault_bp
    from routes.ollama import ollama_bp
    from routes.settings import settings_bp
    from routes.qbittorrent import qbittorrent_bp
    from routes.zim import zim_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(meilisearch_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(folders_bp)
    app.register_blueprint(vault_bp)
    app.register_blueprint(ollama_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(qbittorrent_bp)
    app.register_blueprint(zim_bp)

    # Meilisearch auto-start and cleanup
    from services.config_service import get_searchbox_config
    from services.meilisearch_service import auto_start_meilisearch, cleanup

    def _get_config():
        return get_searchbox_config(app, Settings)

    auto_start_meilisearch(_get_config)
    atexit.register(cleanup)

    return app


app = create_app()

if __name__ == "__main__":
    host = os.environ.get('SEARCHBOX_HOST', '127.0.0.1')
    port = int(os.environ.get('SEARCHBOX_PORT', '5000'))
    app.run(host=host, port=port, debug=False)

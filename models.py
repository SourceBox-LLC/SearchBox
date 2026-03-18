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
SQLAlchemy database models for SearchBox.
"""

from datetime import datetime
import json

# Models will be created dynamically when database is initialized
Settings = None
IndexedFolder = None
VaultConfig = None
EncryptedFile = None
QBTorrent = None
IndexedArchive = None
Bookmark = None
User = None


def create_models(db):
    """Create database models with the provided db instance."""
    global \
        Settings, \
        IndexedFolder, \
        VaultConfig, \
        EncryptedFile, \
        QBTorrent, \
        IndexedArchive, \
        Bookmark, \
        User

    class Settings(db.Model):
        """Application settings model."""

        __tablename__ = "settings"

        id = db.Column(db.Integer, primary_key=True)
        key = db.Column(db.String(100), unique=True, nullable=False, index=True)
        value = db.Column(db.Text, nullable=True)
        description = db.Column(db.Text, nullable=True)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        updated_at = db.Column(
            db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )

        def __repr__(self):
            return f"<Settings {self.key}={self.value}>"

        @classmethod
        def get(cls, key, default=None):
            """Get a setting value by key."""
            setting = cls.query.filter_by(key=key).first()
            return setting.value if setting else default

        @classmethod
        def set(cls, key, value, description=None):
            """Set a setting value by key."""
            setting = cls.query.filter_by(key=key).first()
            if setting:
                setting.value = value
                if description:
                    setting.description = description
                setting.updated_at = datetime.utcnow()
            else:
                setting = cls(key=key, value=value, description=description)
                db.session.add(setting)
            db.session.commit()
            return setting

        @classmethod
        def get_all(cls):
            """Get all settings as a dictionary."""
            settings = cls.query.all()
            return {s.key: s.value for s in settings}

        @classmethod
        def get_json(cls, key, default=None):
            """Get a JSON setting value by key."""
            value = cls.get(key, default)
            if value and isinstance(value, str):
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    pass
            return value or default

        @classmethod
        def set_json(cls, key, value, description=None):
            """Set a JSON setting value by key."""
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            return cls.set(key, value, description)

    class IndexedFolder(db.Model):
        """Indexed folders model."""

        __tablename__ = "indexed_folders"

        id = db.Column(db.Integer, primary_key=True)
        folder_path = db.Column(db.String(500), unique=True, nullable=False, index=True)
        folder_name = db.Column(db.String(255), nullable=False)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        last_synced = db.Column(db.DateTime, nullable=True)
        is_active = db.Column(db.Boolean, default=True)

        def __repr__(self):
            return f"<IndexedFolder {self.folder_name}>"

        @classmethod
        def get_all(cls):
            """Get all active indexed folders."""
            return cls.query.filter_by(is_active=True).all()

        @classmethod
        def add(cls, folder_path, folder_name=None):
            """Add an indexed folder."""
            import os

            if not folder_name:
                folder_name = os.path.basename(folder_path)

            folder = cls.query.filter_by(folder_path=folder_path).first()
            if folder:
                folder.is_active = True
            else:
                folder = cls(folder_path=folder_path, folder_name=folder_name)
                db.session.add(folder)

            db.session.commit()
            return folder

        @classmethod
        def remove(cls, folder_path):
            """Remove an indexed folder (soft delete)."""
            folder = cls.query.filter_by(folder_path=folder_path).first()
            if folder:
                folder.is_active = False
            db.session.commit()
            return folder

        @classmethod
        def get_paths(cls):
            """Get all active folder paths as a list."""
            folders = cls.get_all()
            return [folder.folder_path for folder in folders]

    class VaultConfig(db.Model):
        """Vault configuration model — stores PBKDF2 salt for key derivation."""

        __tablename__ = "vault_config"

        id = db.Column(db.Integer, primary_key=True)
        salt = db.Column(db.LargeBinary, nullable=False)  # 16-byte PBKDF2 salt
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        updated_at = db.Column(
            db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )

        def __repr__(self):
            return f"<VaultConfig>"

        @classmethod
        def get(cls):
            """Get vault configuration."""
            return cls.query.first()

        @classmethod
        def set(cls, salt):
            """Set vault configuration."""
            config = cls.query.first()
            if config:
                config.salt = salt
                config.updated_at = datetime.utcnow()
            else:
                config = cls(salt=salt)
                db.session.add(config)
            db.session.commit()
            return config

        @classmethod
        def clear(cls):
            """Clear vault configuration."""
            cls.query.delete()
            db.session.commit()

    class EncryptedFile(db.Model):
        """Per-file encryption metadata — stores wrapped DEK for each vault file."""

        __tablename__ = "encrypted_files"

        id = db.Column(db.Integer, primary_key=True)
        doc_id = db.Column(db.String(50), unique=True, nullable=False, index=True)
        wrapped_dek = db.Column(db.LargeBinary, nullable=False)  # DEK wrapped by KEK
        encrypted_filename = db.Column(
            db.String(500), nullable=False
        )  # filename on disk (.enc)
        original_filename = db.Column(db.String(500), nullable=False)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)

        def __repr__(self):
            return f"<EncryptedFile {self.doc_id}>"

        @classmethod
        def get_by_doc_id(cls, doc_id):
            """Get encryption metadata for a document."""
            return cls.query.filter_by(doc_id=doc_id).first()

        @classmethod
        def create(cls, doc_id, wrapped_dek, encrypted_filename, original_filename):
            """Store encryption metadata for a new file."""
            entry = cls(
                doc_id=doc_id,
                wrapped_dek=wrapped_dek,
                encrypted_filename=encrypted_filename,
                original_filename=original_filename,
            )
            db.session.add(entry)
            db.session.commit()
            return entry

        @classmethod
        def update_wrapped_dek(cls, doc_id, new_wrapped_dek):
            """Update the wrapped DEK (used during password change)."""
            entry = cls.query.filter_by(doc_id=doc_id).first()
            if entry:
                entry.wrapped_dek = new_wrapped_dek
                db.session.commit()
            return entry

        @classmethod
        def delete_by_doc_id(cls, doc_id):
            """Delete encryption metadata for a document."""
            cls.query.filter_by(doc_id=doc_id).delete()
            db.session.commit()

        @classmethod
        def get_all(cls):
            """Get all encrypted file entries."""
            return cls.query.all()

        @classmethod
        def clear_all(cls):
            """Delete all encrypted file entries."""
            cls.query.delete()
            db.session.commit()

    class QBTorrent(db.Model):
        """Tracks torrents that have been indexed from qBittorrent."""

        __tablename__ = "qb_torrents"

        id = db.Column(db.Integer, primary_key=True)
        torrent_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
        torrent_name = db.Column(db.String(500), nullable=False)
        save_path = db.Column(db.String(500), nullable=False)
        files_indexed = db.Column(db.Integer, default=0)
        indexed_at = db.Column(db.DateTime, default=datetime.utcnow)

        def __repr__(self):
            return f"<QBTorrent {self.torrent_name}>"

        @classmethod
        def get_by_hash(cls, torrent_hash):
            """Get a torrent record by its hash."""
            return cls.query.filter_by(torrent_hash=torrent_hash).first()

        @classmethod
        def get_all(cls):
            """Get all indexed torrents."""
            return cls.query.order_by(cls.indexed_at.desc()).all()

        @classmethod
        def add(cls, torrent_hash, torrent_name, save_path, files_indexed=0):
            """Record an indexed torrent."""
            entry = cls(
                torrent_hash=torrent_hash,
                torrent_name=torrent_name,
                save_path=save_path,
                files_indexed=files_indexed,
            )
            db.session.add(entry)
            db.session.commit()
            return entry

        @classmethod
        def remove(cls, torrent_hash):
            """Remove a torrent record."""
            cls.query.filter_by(torrent_hash=torrent_hash).delete()
            db.session.commit()

        @classmethod
        def get_indexed_hashes(cls):
            """Get set of all indexed torrent hashes."""
            return {
                t.torrent_hash for t in cls.query.with_entities(cls.torrent_hash).all()
            }

    class IndexedArchive(db.Model):
        """Tracks ZIM/ZIP archives that have been indexed."""

        __tablename__ = "indexed_archives"

        id = db.Column(db.Integer, primary_key=True)
        archive_path = db.Column(
            db.String(500), unique=True, nullable=False, index=True
        )
        archive_name = db.Column(db.String(255), nullable=False)
        archive_type = db.Column(db.String(10), nullable=False)  # 'zim' or 'zip'
        articles_indexed = db.Column(db.Integer, default=0)
        indexed_at = db.Column(db.DateTime, default=datetime.utcnow)

        def __repr__(self):
            return f"<IndexedArchive {self.archive_name}>"

        @classmethod
        def get_all(cls):
            """Get all indexed archives."""
            return cls.query.order_by(cls.indexed_at.desc()).all()

        @classmethod
        def get_by_path(cls, archive_path):
            """Get an archive record by its path."""
            return cls.query.filter_by(archive_path=archive_path).first()

        @classmethod
        def add(cls, archive_path, archive_name, archive_type, articles_indexed=0):
            """Record an indexed archive."""
            existing = cls.query.filter_by(archive_path=archive_path).first()
            if existing:
                existing.articles_indexed = articles_indexed
                existing.indexed_at = datetime.utcnow()
                db.session.commit()
                return existing
            entry = cls(
                archive_path=archive_path,
                archive_name=archive_name,
                archive_type=archive_type,
                articles_indexed=articles_indexed,
            )
            db.session.add(entry)
            db.session.commit()
            return entry

        @classmethod
        def remove(cls, archive_path):
            """Remove an archive record."""
            cls.query.filter_by(archive_path=archive_path).delete()
            db.session.commit()

    class Bookmark(db.Model):
        """Bookmarked documents for quick access."""

        __tablename__ = "bookmarks"

        id = db.Column(db.Integer, primary_key=True)
        slot = db.Column(db.Integer, unique=True, nullable=False, index=True)  # 1-5
        doc_id = db.Column(db.String(50), unique=True, nullable=False, index=True)
        title = db.Column(db.String(500), nullable=False)
        file_type = db.Column(db.String(20), nullable=False)  # pdf, md, docx, etc.
        file_path = db.Column(db.String(1000), nullable=True)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        updated_at = db.Column(
            db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )

        def __repr__(self):
            return f"<Bookmark slot={self.slot} doc_id={self.doc_id}>"

        @classmethod
        def get_all(cls):
            """Get all bookmarks ordered by slot."""
            return cls.query.order_by(cls.slot).all()

        @classmethod
        def get_by_slot(cls, slot):
            """Get bookmark by slot number."""
            return cls.query.filter_by(slot=slot).first()

        @classmethod
        def get_by_doc_id(cls, doc_id):
            """Get bookmark by document ID."""
            return cls.query.filter_by(doc_id=doc_id).first()

        @classmethod
        def upsert(cls, slot, doc_id, title, file_type, file_path=None):
            """Create or update a bookmark."""
            bookmark = cls.query.filter_by(slot=slot).first()
            if bookmark:
                bookmark.doc_id = doc_id
                bookmark.title = title
                bookmark.file_type = file_type
                bookmark.file_path = file_path
                bookmark.updated_at = datetime.utcnow()
            else:
                bookmark = cls(
                    slot=slot,
                    doc_id=doc_id,
                    title=title,
                    file_type=file_type,
                    file_path=file_path,
                )
                db.session.add(bookmark)
            db.session.commit()
            return bookmark

        @classmethod
        def delete_by_slot(cls, slot):
            """Delete bookmark by slot."""
            cls.query.filter_by(slot=slot).delete()
            db.session.commit()

        @classmethod
        def delete_by_doc_id(cls, doc_id):
            """Delete bookmark by document ID."""
            cls.query.filter_by(doc_id=doc_id).delete()
            db.session.commit()

    class User(db.Model):
        """User account for authentication."""

        __tablename__ = "users"

        id = db.Column(db.Integer, primary_key=True)
        email = db.Column(db.String(255), unique=True, nullable=False, index=True)
        password_hash = db.Column(db.String(255), nullable=False)
        name = db.Column(db.String(100), nullable=True)
        role = db.Column(db.String(20), default="admin")
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        last_login = db.Column(db.DateTime, nullable=True)
        is_active = db.Column(db.Boolean, default=True)

        def __repr__(self):
            return f"<User {self.email}>"

        @classmethod
        def get_by_id(cls, user_id):
            """Get user by ID."""
            return cls.query.get(user_id)

        @classmethod
        def get_by_email(cls, email):
            """Get user by email."""
            return cls.query.filter_by(email=email.lower()).first()

        @classmethod
        def get_count(cls):
            """Get total number of users."""
            return cls.query.count()

        @classmethod
        def create(cls, email, password_hash, name=None):
            """Create a new user."""
            user = cls(
                email=email.lower(),
                password_hash=password_hash,
                name=name,
                role="admin",
            )
            db.session.add(user)
            db.session.commit()
            return user

        def update_last_login(self):
            """Update last login timestamp."""
            self.last_login = datetime.utcnow()
            db.session.commit()

    return (
        Settings,
        IndexedFolder,
        VaultConfig,
        EncryptedFile,
        QBTorrent,
        IndexedArchive,
        Bookmark,
        User,
    )

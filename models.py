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
import secrets
import string

# Models will be created dynamically when database is initialized
Organization = None
Team = None
TeamMember = None
User = None
Settings = None
IndexedFolder = None
VaultConfig = None
EncryptedFile = None
QBTorrent = None
IndexedArchive = None
Bookmark = None


def generate_slug(length=8):
    """Generate a random slug for organization subdomains."""
    chars = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))


def create_models(db):
    """Create database models with the provided db instance."""
    global \
        Organization, \
        Team, \
        TeamMember, \
        User, \
        Settings, \
        IndexedFolder, \
        VaultConfig, \
        EncryptedFile, \
        QBTorrent, \
        IndexedArchive, \
        Bookmark

    class Settings(db.Model):
        """Application settings model."""

        __tablename__ = "settings"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
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
        def get(cls, key, default=None, organization_id=None):
            """Get a setting value by key."""
            query = cls.query.filter_by(key=key)
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            setting = query.first()
            return setting.value if setting else default

        @classmethod
        def set(cls, key, value, description=None, organization_id=None):
            """Set a setting value by key."""
            query = cls.query.filter_by(key=key)
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            setting = query.first()
            if setting:
                setting.value = value
                if description:
                    setting.description = description
                setting.updated_at = datetime.utcnow()
            else:
                setting = cls(
                    key=key,
                    value=value,
                    description=description,
                    organization_id=organization_id,
                )
                db.session.add(setting)
            db.session.commit()
            return setting

        @classmethod
        def get_all(cls, organization_id=None):
            """Get all settings as a dictionary."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            settings = query.all()
            return {s.key: s.value for s in settings}

        @classmethod
        def get_json(cls, key, default=None, organization_id=None):
            """Get a JSON setting value by key."""
            value = cls.get(key, default, organization_id=organization_id)
            if value and isinstance(value, str):
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    pass
            return value or default

        @classmethod
        def set_json(cls, key, value, description=None, organization_id=None):
            """Set a JSON setting value by key."""
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            return cls.set(key, value, description, organization_id=organization_id)

    class IndexedFolder(db.Model):
        """Indexed folders model."""

        __tablename__ = "indexed_folders"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
        folder_path = db.Column(db.String(500), unique=True, nullable=False, index=True)
        folder_name = db.Column(db.String(255), nullable=False)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        last_synced = db.Column(db.DateTime, nullable=True)
        is_active = db.Column(db.Boolean, default=True)

        def __repr__(self):
            return f"<IndexedFolder {self.folder_name}>"

        @classmethod
        def get_all(cls, organization_id=None):
            """Get all active indexed folders."""
            query = cls.query.filter_by(is_active=True)
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.all()

        @classmethod
        def add(cls, folder_path, folder_name=None, organization_id=None):
            """Add an indexed folder."""
            import os

            if not folder_name:
                folder_name = os.path.basename(folder_path)

            folder = cls.query.filter_by(folder_path=folder_path).first()
            if folder:
                folder.is_active = True
            else:
                folder = cls(
                    folder_path=folder_path,
                    folder_name=folder_name,
                    organization_id=organization_id,
                )
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
        def get_paths(cls, organization_id=None):
            """Get all active folder paths as a list."""
            folders = cls.get_all(organization_id=organization_id)
            return [folder.folder_path for folder in folders]

    class VaultConfig(db.Model):
        """Vault configuration model — stores PBKDF2 salt for key derivation."""

        __tablename__ = "vault_config"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
        salt = db.Column(db.LargeBinary, nullable=False)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        updated_at = db.Column(
            db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )

        def __repr__(self):
            return f"<VaultConfig>"

        @classmethod
        def get(cls, organization_id=None):
            """Get vault configuration for an organization."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.first()

        @classmethod
        def set(cls, salt, organization_id=None):
            """Set vault configuration for an organization."""
            config = cls.get(organization_id=organization_id)
            if config:
                config.salt = salt
                config.updated_at = datetime.utcnow()
            else:
                config = cls(salt=salt, organization_id=organization_id)
                db.session.add(config)
            db.session.commit()
            return config

        @classmethod
        def clear(cls, organization_id=None):
            """Clear vault configuration for an organization."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            query.delete()
            db.session.commit()

    class EncryptedFile(db.Model):
        """Per-file encryption metadata — stores wrapped DEK for each vault file."""

        __tablename__ = "encrypted_files"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
        doc_id = db.Column(db.String(50), unique=True, nullable=False, index=True)
        wrapped_dek = db.Column(db.LargeBinary, nullable=False)
        encrypted_filename = db.Column(db.String(500), nullable=False)
        original_filename = db.Column(db.String(500), nullable=False)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)

        def __repr__(self):
            return f"<EncryptedFile {self.doc_id}>"

        @classmethod
        def get_by_doc_id(cls, doc_id):
            """Get encryption metadata for a document."""
            return cls.query.filter_by(doc_id=doc_id).first()

        @classmethod
        def create(
            cls,
            doc_id,
            wrapped_dek,
            encrypted_filename,
            original_filename,
            organization_id=None,
        ):
            """Store encryption metadata for a new file."""
            entry = cls(
                doc_id=doc_id,
                wrapped_dek=wrapped_dek,
                encrypted_filename=encrypted_filename,
                original_filename=original_filename,
                organization_id=organization_id,
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
        def get_all(cls, organization_id=None):
            """Get all encrypted file entries."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.all()

        @classmethod
        def clear_all(cls, organization_id=None):
            """Delete all encrypted file entries for an organization."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            query.delete()
            db.session.commit()

    class QBTorrent(db.Model):
        """Tracks torrents that have been indexed from qBittorrent."""

        __tablename__ = "qb_torrents"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
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
        def get_all(cls, organization_id=None):
            """Get all indexed torrents for an organization."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.order_by(cls.indexed_at.desc()).all()

        @classmethod
        def add(
            cls,
            torrent_hash,
            torrent_name,
            save_path,
            files_indexed=0,
            organization_id=None,
        ):
            """Record an indexed torrent."""
            entry = cls(
                torrent_hash=torrent_hash,
                torrent_name=torrent_name,
                save_path=save_path,
                files_indexed=files_indexed,
                organization_id=organization_id,
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
        def get_indexed_hashes(cls, organization_id=None):
            """Get set of all indexed torrent hashes for an organization."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return {t.torrent_hash for t in query.with_entities(cls.torrent_hash).all()}

    class IndexedArchive(db.Model):
        """Tracks ZIM/ZIP archives that have been indexed."""

        __tablename__ = "indexed_archives"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
        archive_path = db.Column(
            db.String(500), unique=True, nullable=False, index=True
        )
        archive_name = db.Column(db.String(255), nullable=False)
        archive_type = db.Column(db.String(10), nullable=False)
        articles_indexed = db.Column(db.Integer, default=0)
        indexed_at = db.Column(db.DateTime, default=datetime.utcnow)

        def __repr__(self):
            return f"<IndexedArchive {self.archive_name}>"

        @classmethod
        def get_all(cls, organization_id=None):
            """Get all indexed archives for an organization."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.order_by(cls.indexed_at.desc()).all()

        @classmethod
        def get_by_path(cls, archive_path):
            """Get an archive record by its path."""
            return cls.query.filter_by(archive_path=archive_path).first()

        @classmethod
        def add(
            cls,
            archive_path,
            archive_name,
            archive_type,
            articles_indexed=0,
            organization_id=None,
        ):
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
                organization_id=organization_id,
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
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
        slot = db.Column(db.Integer, nullable=False, index=True)
        doc_id = db.Column(db.String(50), nullable=False, index=True)
        title = db.Column(db.String(500), nullable=False)
        file_type = db.Column(db.String(20), nullable=False)
        file_path = db.Column(db.String(1000), nullable=True)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        updated_at = db.Column(
            db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )

        __table_args__ = (
            db.UniqueConstraint("organization_id", "slot", name="unique_org_slot"),
            db.UniqueConstraint("organization_id", "doc_id", name="unique_org_doc_id"),
        )

        def __repr__(self):
            return f"<Bookmark slot={self.slot} doc_id={self.doc_id}>"

        @classmethod
        def get_all(cls, organization_id=None):
            """Get all bookmarks ordered by slot for an organization."""
            query = cls.query
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.order_by(cls.slot).all()

        @classmethod
        def get_by_slot(cls, slot, organization_id=None):
            """Get bookmark by slot number for an organization."""
            query = cls.query.filter_by(slot=slot)
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.first()

        @classmethod
        def get_by_doc_id(cls, doc_id, organization_id=None):
            """Get bookmark by document ID for an organization."""
            query = cls.query.filter_by(doc_id=doc_id)
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            return query.first()

        @classmethod
        def upsert(
            cls, slot, doc_id, title, file_type, file_path=None, organization_id=None
        ):
            """Create or update a bookmark for an organization."""
            bookmark = cls.get_by_slot(slot, organization_id=organization_id)
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
                    organization_id=organization_id,
                )
                db.session.add(bookmark)
            db.session.commit()
            return bookmark

        @classmethod
        def delete_by_slot(cls, slot, organization_id=None):
            """Delete bookmark by slot for an organization."""
            query = cls.query.filter_by(slot=slot)
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            query.delete()
            db.session.commit()

        @classmethod
        def delete_by_doc_id(cls, doc_id, organization_id=None):
            """Delete bookmark by document ID for an organization."""
            query = cls.query.filter_by(doc_id=doc_id)
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            elif organization_id is None:
                query = query.filter(cls.organization_id.is_(None))
            query.delete()
            db.session.commit()

    class Organization(db.Model):
        """Organization for multi-tenant SaaS support."""

        __tablename__ = "organizations"

        id = db.Column(db.Integer, primary_key=True)
        name = db.Column(db.String(255), nullable=False)
        slug = db.Column(db.String(50), unique=True, nullable=False, index=True)
        plan = db.Column(db.String(20), default="free")
        settings = db.Column(db.Text, nullable=True)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        updated_at = db.Column(
            db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )

        def __repr__(self):
            return f"<Organization {self.name} ({self.slug})>"

        @classmethod
        def get_by_id(cls, org_id):
            """Get organization by ID."""
            return cls.query.get(org_id)

        @classmethod
        def get_by_slug(cls, slug):
            """Get organization by slug."""
            return cls.query.filter_by(slug=slug.lower()).first()

        @classmethod
        def create(cls, name, slug=None, plan="free"):
            """Create a new organization."""
            if not slug:
                slug = generate_slug()
            org = cls(
                name=name,
                slug=slug.lower(),
                plan=plan,
            )
            db.session.add(org)
            db.session.commit()
            return org

        def get_settings(self):
            """Get organization settings as dict."""
            if self.settings:
                try:
                    return json.loads(self.settings)
                except json.JSONDecodeError:
                    pass
            return {}

        def set_settings(self, settings_dict):
            """Set organization settings from dict."""
            self.settings = json.dumps(settings_dict)
            self.updated_at = datetime.utcnow()
            db.session.commit()

        def get_users(self):
            """Get all users in this organization."""
            return User.query.filter_by(organization_id=self.id).all()

        def get_teams(self):
            """Get all teams in this organization."""
            return Team.query.filter_by(organization_id=self.id).all()

    class Team(db.Model):
        """Team within an organization."""

        __tablename__ = "teams"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True
        )
        name = db.Column(db.String(100), nullable=False)
        created_at = db.Column(db.DateTime, default=datetime.utcnow)

        def __repr__(self):
            return f"<Team {self.name}>"

        @classmethod
        def get_by_id(cls, team_id):
            """Get team by ID."""
            return cls.query.get(team_id)

        @classmethod
        def create(cls, organization_id, name):
            """Create a new team."""
            team = cls(organization_id=organization_id, name=name)
            db.session.add(team)
            db.session.commit()
            return team

        def get_members(self):
            """Get all members of this team."""
            return (
                User.query.join(TeamMember).filter(TeamMember.team_id == self.id).all()
            )

    class TeamMember(db.Model):
        """Membership of a user in a team."""

        __tablename__ = "team_members"

        id = db.Column(db.Integer, primary_key=True)
        team_id = db.Column(
            db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True
        )
        user_id = db.Column(
            db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
        )
        role = db.Column(db.String(20), default="member")

        __table_args__ = (
            db.UniqueConstraint("team_id", "user_id", name="unique_team_member"),
        )

        def __repr__(self):
            return f"<TeamMember team_id={self.team_id} user_id={self.user_id}>"

        @classmethod
        def add(cls, team_id, user_id, role="member"):
            """Add a user to a team."""
            existing = cls.query.filter_by(team_id=team_id, user_id=user_id).first()
            if existing:
                existing.role = role
                db.session.commit()
                return existing
            else:
                member = cls(team_id=team_id, user_id=user_id, role=role)
                db.session.add(member)
                db.session.commit()
                return member

        @classmethod
        def remove(cls, team_id, user_id):
            """Remove a user from a team."""
            cls.query.filter_by(team_id=team_id, user_id=user_id).delete()
            db.session.commit()

        @classmethod
        def is_member(cls, team_id, user_id):
            """Check if user is a member of a team."""
            return (
                cls.query.filter_by(team_id=team_id, user_id=user_id).first()
                is not None
            )

    class User(db.Model):
        """User account for authentication."""

        __tablename__ = "users"

        id = db.Column(db.Integer, primary_key=True)
        organization_id = db.Column(
            db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True
        )
        email = db.Column(db.String(255), nullable=False, index=True)
        password_hash = db.Column(db.String(255), nullable=False)
        name = db.Column(db.String(100), nullable=True)
        role = db.Column(db.String(20), default="member")
        created_at = db.Column(db.DateTime, default=datetime.utcnow)
        last_login = db.Column(db.DateTime, nullable=True)
        is_active = db.Column(db.Boolean, default=True)

        __table_args__ = (
            db.UniqueConstraint("organization_id", "email", name="unique_org_email"),
        )

        def __repr__(self):
            return f"<User {self.email}>"

        @classmethod
        def get_by_id(cls, user_id):
            """Get user by ID."""
            return cls.query.get(user_id)

        @classmethod
        def get_by_email(cls, email, organization_id=None):
            """Get user by email, optionally filtered by organization."""
            query = cls.query.filter_by(email=email.lower())
            if organization_id is not None:
                query = query.filter_by(organization_id=organization_id)
            return query.first()

        @classmethod
        def get_count(cls):
            """Get total number of users."""
            return cls.query.count()

        @classmethod
        def create(
            cls, email, password_hash, name=None, organization_id=None, role="member"
        ):
            """Create a new user."""
            user = cls(
                email=email.lower(),
                password_hash=password_hash,
                name=name,
                organization_id=organization_id,
                role=role,
            )
            db.session.add(user)
            db.session.commit()
            return user

        def update_last_login(self):
            """Update last login timestamp."""
            self.last_login = datetime.utcnow()
            db.session.commit()

    return (
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
    )

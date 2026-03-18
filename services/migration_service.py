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
Migration service for upgrading self-hosted instances to multi-tenant schema.

When SAAS_MODE is false, this module ensures all existing data is associated
with a default organization for backward compatibility.
"""

import logging

logger = logging.getLogger(__name__)


def migrate_add_organization_column(db, table_name):
    """
    Add organization_id column to a table if it doesn't exist.

    Args:
        db: SQLAlchemy database instance
        table_name: Name of the table to migrate
    """
    from sqlalchemy import text, inspect

    inspector = inspect(db.engine)

    try:
        columns = [col["name"] for col in inspector.get_columns(table_name)]
        if "organization_id" not in columns:
            logger.info(f"Adding organization_id column to {table_name}")
            with db.engine.connect() as conn:
                conn.execute(
                    text(f"ALTER TABLE {table_name} ADD COLUMN organization_id INTEGER")
                )
                conn.commit()
            logger.info(f"Successfully added organization_id to {table_name}")
    except Exception as e:
        logger.warning(f"Could not migrate {table_name}: {e}")


def run_migrations(db, app):
    """
    Run all database migrations for multi-tenancy.

    Args:
        db: SQLAlchemy database instance
        app: Flask application instance
    """
    tables_with_org_id = [
        "users",
        "settings",
        "indexed_folders",
        "vault_config",
        "encrypted_files",
        "qb_torrents",
        "indexed_archives",
        "bookmarks",
    ]

    for table in tables_with_org_id:
        migrate_add_organization_column(db, table)

    try:
        from sqlalchemy import text

        with db.engine.connect() as conn:
            conn.execute(
                text("""
                CREATE TABLE IF NOT EXISTS organizations (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(50) UNIQUE NOT NULL,
                    plan VARCHAR(20) DEFAULT 'free',
                    settings TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            )
            conn.commit()
            logger.info("Organizations table created or already exists")
    except Exception as e:
        logger.warning(f"Could not create organizations table: {e}")

    try:
        from sqlalchemy import text

        with db.engine.connect() as conn:
            conn.execute(
                text("""
                CREATE TABLE IF NOT EXISTS teams (
                    id INTEGER PRIMARY KEY,
                    organization_id INTEGER NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (organization_id) REFERENCES organizations(id)
                )
            """)
            )
            conn.commit()
            logger.info("Teams table created or already exists")
    except Exception as e:
        logger.warning(f"Could not create teams table: {e}")

    try:
        from sqlalchemy import text

        with db.engine.connect() as conn:
            conn.execute(
                text("""
                CREATE TABLE IF NOT EXISTS team_members (
                    id INTEGER PRIMARY KEY,
                    team_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    role VARCHAR(20) DEFAULT 'member',
                    FOREIGN KEY (team_id) REFERENCES teams(id),
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    UNIQUE(team_id, user_id)
                )
            """)
            )
            conn.commit()
            logger.info("Team members table created or already exists")
    except Exception as e:
        logger.warning(f"Could not create team_members table: {e}")


def ensure_default_organization(db, Organization, User, app):
    """
    Ensure a default organization exists for self-hosted instances.

    In self-hosted mode (SAAS_MODE=false), all data belongs to a single
    implicit organization. This function creates that organization and
    assigns all existing data to it.

    Args:
        db: SQLAlchemy database instance
        Organization: Organization model class
        User: User model class
        app: Flask application instance
    """
    from flask import current_app

    run_migrations(db, app)

    existing_org = Organization.query.first()

    if existing_org:
        logger.info("Default organization already exists")
        return existing_org

    logger.info("Creating default organization for self-hosted mode")

    org = Organization.create(
        name="My Organization",
        slug="default",
        plan="self-hosted",
    )

    User.query.filter_by(organization_id=None).update({"organization_id": org.id})

    if hasattr(current_app, "Settings"):
        current_app.Settings.query.filter_by(organization_id=None).update(
            {"organization_id": org.id}
        )
    if hasattr(current_app, "IndexedFolder"):
        current_app.IndexedFolder.query.filter_by(organization_id=None).update(
            {"organization_id": org.id}
        )
    if hasattr(current_app, "VaultConfig"):
        current_app.VaultConfig.query.filter_by(organization_id=None).update(
            {"organization_id": org.id}
        )
    if hasattr(current_app, "EncryptedFile"):
        current_app.EncryptedFile.query.filter_by(organization_id=None).update(
            {"organization_id": org.id}
        )
    if hasattr(current_app, "QBTorrent"):
        current_app.QBTorrent.query.filter_by(organization_id=None).update(
            {"organization_id": org.id}
        )
    if hasattr(current_app, "IndexedArchive"):
        current_app.IndexedArchive.query.filter_by(organization_id=None).update(
            {"organization_id": org.id}
        )
    if hasattr(current_app, "Bookmark"):
        current_app.Bookmark.query.filter_by(organization_id=None).update(
            {"organization_id": org.id}
        )

    db.session.commit()

    logger.info(f"Default organization created with ID {org.id}")

    return org


def get_or_create_organization_for_user(db, Organization, user_id, User):
    """
    Get the organization for a user, creating a default one if needed.

    This is used during user creation in self-hosted mode to ensure
    every user belongs to an organization.

    Args:
        db: SQLAlchemy database instance
        Organization: Organization model class
        user_id: User ID to look up
        User: User model class

    Returns:
        Organization instance or None
    """
    user = User.query.get(user_id)

    if not user:
        return None

    if user.organization_id:
        return Organization.query.get(user.organization_id)

    org = Organization.query.first()

    if org:
        user.organization_id = org.id
        db.session.commit()
        return org

    org = Organization.create(
        name="My Organization",
        slug="default",
        plan="self-hosted",
    )
    user.organization_id = org.id
    db.session.commit()

    return org

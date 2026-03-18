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
Organization service for multi-tenant operations.

Provides functions for creating, retrieving, and managing organizations.
"""

import logging
from flask import session, g

logger = logging.getLogger(__name__)


def get_current_organization_id():
    """
    Get the current organization ID from session or request context.

    In SaaS mode, this comes from the subdomain.
    In self-hosted mode, this returns None (all data is global).

    Returns:
        int or None: Organization ID or None if self-hosted mode
    """
    from flask import current_app

    if not current_app.config.get("SAAS_MODE", False):
        return None

    return session.get("organization_id") or g.get("organization_id")


def set_current_organization(organization_id):
    """
    Set the current organization in session.

    Args:
        organization_id: Organization ID to set
    """
    session["organization_id"] = organization_id
    g.organization_id = organization_id


def get_organization_by_slug(slug):
    """
    Get an organization by its slug.

    Args:
        slug: Organization slug (subdomain)

    Returns:
        Organization instance or None
    """
    from flask import current_app

    Organization = current_app.Organization
    return Organization.get_by_slug(slug)


def get_organization_by_id(org_id):
    """
    Get an organization by its ID.

    Args:
        org_id: Organization ID

    Returns:
        Organization instance or None
    """
    from flask import current_app

    Organization = current_app.Organization
    return Organization.get_by_id(org_id)


def create_organization(name, slug=None, plan="free"):
    """
    Create a new organization.

    Args:
        name: Organization name
        slug: Optional slug (auto-generated if not provided)
        plan: Subscription plan (default: "free")

    Returns:
        Created Organization instance
    """
    from flask import current_app

    Organization = current_app.Organization
    return Organization.create(name=name, slug=slug, plan=plan)


def add_user_to_organization(user_id, organization_id, role="member"):
    """
    Add a user to an organization.

    Args:
        user_id: User ID to add
        organization_id: Organization ID
        role: User role (default: "member")

    Returns:
        Updated User instance
    """
    from flask import current_app

    User = current_app.User
    user = User.query.get(user_id)

    if user:
        user.organization_id = organization_id
        user.role = role
        current_app.db.session.commit()

    return user


def get_organization_users(organization_id):
    """
    Get all users in an organization.

    Args:
        organization_id: Organization ID

    Returns:
        List of User instances
    """
    from flask import current_app

    Organization = current_app.Organization
    org = Organization.query.get(organization_id)

    if org:
        return org.get_users()

    return []


def get_organization_teams(organization_id):
    """
    Get all teams in an organization.

    Args:
        organization_id: Organization ID

    Returns:
        List of Team instances
    """
    from flask import current_app

    Organization = current_app.Organization
    org = Organization.query.get(organization_id)

    if org:
        return org.get_teams()

    return []


def get_meilisearch_index_name(organization_id=None):
    """
    Get the Meilisearch index name for an organization.

    In self-hosted mode, returns the default index name.
    In SaaS mode, returns the organization-scoped index name.

    Args:
        organization_id: Organization ID (optional, uses current if not provided)

    Returns:
        str: Meilisearch index name
    """
    from flask import current_app

    if organization_id is None:
        organization_id = get_current_organization_id()

    base_name = "searchbox"

    if organization_id is None:
        return base_name

    return f"{base_name}_org_{organization_id}"

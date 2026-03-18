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
Organization management API routes for SearchBox.
Handles organization CRUD and team management (SaaS mode only).
"""

import logging
from flask import Blueprint, jsonify, request, current_app, session

from utils.decorators import api_login_required, get_current_organization_id

organization_bp = Blueprint("organization", __name__)
logger = logging.getLogger(__name__)


@organization_bp.route("/api/organization", methods=["GET"])
@api_login_required
def get_organization():
    """Get the current organization info."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    org = current_app.Organization.query.get(org_id)
    if not org:
        return jsonify({"error": "Organization not found"}), 404

    return jsonify(
        {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "plan": org.plan,
            "created_at": org.created_at.isoformat() if org.created_at else None,
        }
    )


@organization_bp.route("/api/organization", methods=["PUT"])
@api_login_required
def update_organization():
    """Update organization settings (admin only)."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    user_id = session.get("user_id")
    user = current_app.User.query.get(user_id)

    if not user or user.role not in ("owner", "admin"):
        return jsonify({"error": "Admin access required"}), 403

    org = current_app.Organization.query.get(org_id)
    if not org:
        return jsonify({"error": "Organization not found"}), 404

    data = request.get_json() or {}

    if "name" in data:
        org.name = data["name"][:255]

    current_app.db.session.commit()

    return jsonify(
        {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "plan": org.plan,
        }
    )


@organization_bp.route("/api/organization/users", methods=["GET"])
@api_login_required
def get_organization_users():
    """Get all users in the organization."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    users = current_app.User.query.filter_by(organization_id=org_id).all()

    return jsonify(
        {
            "users": [
                {
                    "id": u.id,
                    "email": u.email,
                    "name": u.name,
                    "role": u.role,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                    "last_login": u.last_login.isoformat() if u.last_login else None,
                }
                for u in users
            ]
        }
    )


@organization_bp.route("/api/organization/teams", methods=["GET"])
@api_login_required
def get_teams():
    """Get all teams in the organization."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    teams = current_app.Team.query.filter_by(organization_id=org_id).all()

    return jsonify(
        {
            "teams": [
                {
                    "id": t.id,
                    "name": t.name,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                    "member_count": len(t.get_members())
                    if hasattr(t, "get_members")
                    else 0,
                }
                for t in teams
            ]
        }
    )


@organization_bp.route("/api/organization/teams", methods=["POST"])
@api_login_required
def create_team():
    """Create a new team."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    user_id = session.get("user_id")
    user = current_app.User.query.get(user_id)

    if not user or user.role not in ("owner", "admin"):
        return jsonify({"error": "Admin access required"}), 403

    data = request.get_json() or {}
    name = data.get("name", "").strip()

    if not name:
        return jsonify({"error": "Team name is required"}), 400

    team = current_app.Team.create(organization_id=org_id, name=name)

    return jsonify(
        {
            "id": team.id,
            "name": team.name,
            "created_at": team.created_at.isoformat() if team.created_at else None,
        }
    ), 201


@organization_bp.route("/api/organization/teams/<int:team_id>/members", methods=["GET"])
@api_login_required
def get_team_members(team_id):
    """Get all members of a team."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    team = current_app.Team.query.get(team_id)
    if not team or team.organization_id != org_id:
        return jsonify({"error": "Team not found"}), 404

    members = current_app.TeamMember.query.filter_by(team_id=team_id).all()
    user_ids = [m.user_id for m in members]
    users = {
        u.id: u
        for u in current_app.User.query.filter(current_app.User.id.in_(user_ids)).all()
    }

    return jsonify(
        {
            "members": [
                {
                    "user_id": m.user_id,
                    "email": users.get(m.user_id, {}).email
                    if m.user_id in users
                    else None,
                    "name": users.get(m.user_id, {}).name
                    if m.user_id in users
                    else None,
                    "role": m.role,
                }
                for m in members
            ]
        }
    )


@organization_bp.route(
    "/api/organization/teams/<int:team_id>/members", methods=["POST"]
)
@api_login_required
def add_team_member(team_id):
    """Add a member to a team."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    user_id = session.get("user_id")
    user = current_app.User.query.get(user_id)

    if not user or user.role not in ("owner", "admin"):
        return jsonify({"error": "Admin access required"}), 403

    team = current_app.Team.query.get(team_id)
    if not team or team.organization_id != org_id:
        return jsonify({"error": "Team not found"}), 404

    data = request.get_json() or {}
    target_user_id = data.get("user_id")
    role = data.get("role", "member")

    if not target_user_id:
        return jsonify({"error": "user_id is required"}), 400

    target_user = current_app.User.query.get(target_user_id)
    if not target_user or target_user.organization_id != org_id:
        return jsonify({"error": "User not found in organization"}), 404

    member = current_app.TeamMember.add(
        team_id=team_id, user_id=target_user_id, role=role
    )

    return jsonify(
        {
            "user_id": member.user_id,
            "team_id": member.team_id,
            "role": member.role,
        }
    ), 201


@organization_bp.route(
    "/api/organization/teams/<int:team_id>/members/<int:user_id>", methods=["DELETE"]
)
@api_login_required
def remove_team_member(team_id, user_id):
    """Remove a member from a team."""
    org_id = get_current_organization_id()

    if not org_id:
        return jsonify({"error": "No organization context"}), 400

    current_user_id = session.get("user_id")
    user = current_app.User.query.get(current_user_id)

    if not user or user.role not in ("owner", "admin"):
        return jsonify({"error": "Admin access required"}), 403

    team = current_app.Team.query.get(team_id)
    if not team or team.organization_id != org_id:
        return jsonify({"error": "Team not found"}), 404

    current_app.TeamMember.remove(team_id=team_id, user_id=user_id)

    return jsonify({"success": True})

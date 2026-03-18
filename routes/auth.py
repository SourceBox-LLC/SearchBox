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
Authentication routes for SearchBox.
Handles setup, login, logout, and password management.
"""

import logging
from datetime import datetime
from flask import (
    Blueprint,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    current_app,
)

from utils.user_auth import (
    get_user_count,
    create_user,
    authenticate_user,
    get_user_by_id,
    get_password_hash,
    verify_password,
    validate_email,
)
from utils.decorators import login_required, get_current_user
from services.vault_service import get_vault_config, derive_kek_from_password

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)


@auth_bp.route("/setup", methods=["GET", "POST"])
def setup():
    """First-time setup wizard to create admin account."""
    if get_user_count() > 0:
        return redirect(url_for("pages.index"))

    if request.method == "GET":
        return render_template("setup.html")

    data = request.get_json() if request.is_json else request.form

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")
    name = data.get("name", "").strip() or None

    errors = []

    if not validate_email(email):
        errors.append("Invalid email format.")

    if len(password) < 1:
        errors.append("Password cannot be empty.")

    if password != confirm_password:
        errors.append("Passwords do not match.")

    if errors:
        if request.is_json:
            return jsonify({"errors": errors}), 400
        return render_template("setup.html", errors=errors, email=email, name=name)

    try:
        user = create_user(email=email, password=password, name=name)
    except ValueError as e:
        if request.is_json:
            return jsonify({"errors": [str(e)]}), 400
        return render_template("setup.html", errors=[str(e)], email=email, name=name)

    session.permanent = True
    session["user_id"] = user.id
    session["user_email"] = user.email
    session["user_name"] = user.name
    session["auth_time"] = datetime.utcnow().timestamp()

    logger.info(f"Admin account created: {email}")

    if request.is_json:
        return jsonify({"status": "ok", "message": "Account created successfully"})

    return redirect(url_for("pages.index"))


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    """Login page."""
    if get_user_count() == 0:
        return redirect(url_for("auth.setup"))

    user_id = session.get("user_id")
    if user_id and get_user_by_id(user_id):
        return redirect(url_for("pages.index"))

    if request.method == "GET":
        return render_template("login.html")

    data = request.get_json() if request.is_json else request.form

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    user = authenticate_user(email, password)

    if not user:
        if request.is_json:
            return jsonify({"error": "Invalid email or password"}), 401
        return render_template(
            "login.html", error="Invalid email or password", email=email
        )

    if not user.is_active:
        if request.is_json:
            return jsonify({"error": "Account is disabled"}), 401
        return render_template("login.html", error="Account is disabled", email=email)

    session.permanent = True
    session["user_id"] = user.id
    session["user_email"] = user.email
    session["user_name"] = user.name
    session["auth_time"] = datetime.utcnow().timestamp()

    if user.organization_id:
        session["organization_id"] = user.organization_id

    try:
        with current_app.app_context():
            vault_config = get_vault_config(
                current_app.VaultConfig, organization_id=user.organization_id
            )
            if vault_config and "salt" in vault_config:
                kek = derive_kek_from_password(
                    current_app.VaultConfig,
                    password,
                    organization_id=user.organization_id,
                )
                if kek:
                    session["vault_kek"] = kek.hex()
    except Exception as e:
        logger.warning(f"Could not derive vault KEK: {e}")

    logger.info(f"User logged in: {email}")

    if request.is_json:
        return jsonify(
            {"status": "ok", "user": {"email": user.email, "name": user.name}}
        )

    next_url = request.args.get("next")
    if next_url:
        return redirect(next_url)
    return redirect(url_for("pages.index"))


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Logout the current user."""
    email = session.get("user_email")
    session.clear()

    if email:
        logger.info(f"User logged out: {email}")

    if request.is_json:
        return jsonify({"status": "ok", "message": "Logged out successfully"})

    return redirect(url_for("auth.login"))


@auth_bp.route("/api/auth/status", methods=["GET"])
def auth_status():
    """Check authentication status."""
    user_count = get_user_count()

    if user_count == 0:
        return jsonify({"setup_required": True, "authenticated": False, "user": None})

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"setup_required": False, "authenticated": False, "user": None})

    user = get_user_by_id(user_id)
    if not user:
        session.clear()
        return jsonify({"setup_required": False, "authenticated": False, "user": None})

    response = {
        "setup_required": False,
        "authenticated": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
    }

    if user.organization_id:
        org = current_app.Organization.query.get(user.organization_id)
        if org:
            response["organization"] = {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "plan": org.plan,
            }

    return jsonify(response)


@auth_bp.route("/api/auth/change-password", methods=["POST"])
@login_required
def change_password():
    """Change the current user's password."""
    data = request.get_json()

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        return jsonify({"error": "Current password and new password are required"}), 400

    user = get_current_user()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401

    if not verify_password(current_password, user.password_hash):
        return jsonify({"error": "Current password is incorrect"}), 400

    if len(new_password) < 1:
        return jsonify({"error": "New password cannot be empty"}), 400

    user.password_hash = get_password_hash(new_password)
    current_app.db.session.commit()

    logger.info(f"Password changed for user: {user.email}")

    return jsonify({"status": "ok", "message": "Password changed successfully"})

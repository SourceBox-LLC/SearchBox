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
Authentication decorators for SearchBox.
"""

import functools
from flask import session, redirect, url_for, jsonify, request
from utils.user_auth import get_user_by_id, get_user_count


def setup_required(f):
    """Decorator that redirects to setup if no users exist.

    Use this on routes that should be accessible during setup.
    """

    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if get_user_count() == 0:
            return redirect(url_for("auth.setup"))
        return f(*args, **kwargs)

    return decorated


def login_required(f):
    """Decorator that requires user to be logged in.

    Redirects to setup if no users exist.
    Redirects to login if not authenticated.
    """

    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if get_user_count() == 0:
            return redirect(url_for("auth.setup"))

        user_id = session.get("user_id")
        if not user_id:
            if request.path.startswith("/api/"):
                return jsonify(
                    {"error": "Authentication required", "auth_required": True}
                ), 401
            return redirect(url_for("auth.login"))

        user = get_user_by_id(user_id)
        if not user or not user.is_active:
            session.clear()
            if request.path.startswith("/api/"):
                return jsonify(
                    {"error": "Authentication required", "auth_required": True}
                ), 401
            return redirect(url_for("auth.login"))

        return f(*args, **kwargs)

    return decorated


def api_login_required(f):
    """Decorator for API routes that requires authentication.

    Returns 401 JSON response if not authenticated.
    """

    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if get_user_count() == 0:
            return jsonify({"error": "Setup required", "setup_required": True}), 401

        user_id = session.get("user_id")
        if not user_id:
            return jsonify(
                {"error": "Authentication required", "auth_required": True}
            ), 401

        user = get_user_by_id(user_id)
        if not user or not user.is_active:
            session.clear()
            return jsonify(
                {"error": "Authentication required", "auth_required": True}
            ), 401

        return f(*args, **kwargs)

    return decorated


def get_current_user():
    """Get the currently authenticated user.

    Returns:
        User instance if authenticated, None otherwise.
    """
    user_id = session.get("user_id")
    if not user_id:
        return None
    return get_user_by_id(user_id)


def is_authenticated():
    """Check if a user is currently authenticated.

    Returns:
        True if authenticated, False otherwise.
    """
    return (
        session.get("user_id") is not None
        and get_user_by_id(session.get("user_id")) is not None
    )

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
User authentication utilities for SearchBox.
Handles password hashing, user creation, and authentication.
"""

import re
import bcrypt
from flask import current_app


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: Plain text password.

    Returns:
        Hashed password string.
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a hash.

    Args:
        password: Plain text password.
        password_hash: Hashed password.

    Returns:
        True if password matches, False otherwise.
    """
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def validate_email(email: str) -> bool:
    """Validate email format.

    Args:
        email: Email address to validate.

    Returns:
        True if valid format, False otherwise.
    """
    if not email or len(email) > 255:
        return False
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def create_user(email: str, password: str, name: str = None):
    """Create a new user.

    Args:
        email: User's email address.
        password: Plain text password.
        name: Optional display name.

    Returns:
        Created User instance.

    Raises:
        ValueError: If email is invalid or password is empty.
    """
    if not validate_email(email):
        raise ValueError("Invalid email format")

    if not password:
        raise ValueError("Password cannot be empty")

    User = current_app.User

    existing = User.get_by_email(email)
    if existing:
        raise ValueError("Email already registered")

    password_hash = get_password_hash(password)
    user = User.create(email=email, password_hash=password_hash, name=name)

    return user


def authenticate_user(email: str, password: str):
    """Authenticate a user by email and password.

    Args:
        email: User's email address.
        password: Plain text password.

    Returns:
        User instance if authentication successful, None otherwise.
    """
    if not email or not password:
        return None

    User = current_app.User
    user = User.get_by_email(email)

    if not user:
        return None

    if not user.is_active:
        return None

    if not verify_password(password, user.password_hash):
        return None

    user.update_last_login()

    return user


def get_user_count() -> int:
    """Get the total number of users.

    Returns:
        Number of users in the database.
    """
    User = current_app.User
    return User.get_count()


def get_user_by_id(user_id: int):
    """Get a user by ID.

    Args:
        user_id: User's ID.

    Returns:
        User instance or None.
    """
    User = current_app.User
    return User.get_by_id(user_id)


def get_user_by_email(email: str):
    """Get a user by email.

    Args:
        email: User's email address.

    Returns:
        User instance or None.
    """
    User = current_app.User
    return User.get_by_email(email)


def change_password(user_id: int, new_password: str) -> bool:
    """Change a user's password.

    Args:
        user_id: User's ID.
        new_password: New plain text password.

    Returns:
        True if successful, False otherwise.
    """
    if not new_password:
        return False

    User = current_app.User
    user = User.get_by_id(user_id)

    if not user:
        return False

    user.password_hash = get_password_hash(new_password)
    current_app.db.session.commit()

    return True

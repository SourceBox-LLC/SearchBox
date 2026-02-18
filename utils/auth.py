"""
Session + PIN authentication decorator for admin routes.
Checks for a valid Flask session first (set after PIN verify),
then falls back to X-Vault-PIN header for backward compatibility.
If no vault PIN is configured yet, the request is allowed through
so the initial setup flow is not blocked.
"""

import functools
import logging
import time

from flask import request, jsonify, session, current_app

from services.vault_service import get_vault_config, verify_pin

logger = logging.getLogger(__name__)


def _is_session_valid():
    """Check if the current Flask session is authenticated and not expired."""
    if not session.get('authenticated'):
        return False
    auth_time = session.get('auth_time', 0)
    timeout = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    if time.time() - auth_time > timeout:
        session.pop('authenticated', None)
        session.pop('auth_time', None)
        return False
    return True


def require_pin(f):
    """Decorator that enforces authentication on admin routes.

    Checks in order:
    1. No vault PIN configured → allow through (first-time setup).
    2. Valid session (set after PIN verify) → allow through.
    3. X-Vault-PIN header present and correct → allow through.
    4. Otherwise → 401.
    """
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        config = get_vault_config(current_app.VaultConfig)

        # No PIN configured yet — allow through (first-time setup)
        if 'pin_hash' not in config:
            return f(*args, **kwargs)

        # Check session first (avoids expensive PBKDF2 on every request)
        if _is_session_valid():
            return f(*args, **kwargs)

        # Fall back to X-Vault-PIN header
        pin = request.headers.get('X-Vault-PIN')
        if not pin:
            return jsonify({'error': 'Authentication required. Please enter your vault PIN.', 'auth_required': True}), 401

        if not verify_pin(current_app.VaultConfig, pin):
            return jsonify({'error': 'Incorrect PIN', 'auth_required': True}), 401

        return f(*args, **kwargs)
    return decorated

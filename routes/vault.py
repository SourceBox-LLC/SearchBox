"""
Vault PIN management API routes for SearchBox.
"""

import os
import glob
import time
import logging
from collections import defaultdict

from flask import Blueprint, jsonify, request, current_app, session

from config import VAULT_FOLDER
from services.vault_service import (
    get_vault_config, setup_vault, verify_pin, change_pin
)

vault_bp = Blueprint('vault', __name__)
logger = logging.getLogger(__name__)

# Rate limiting for PIN attempts
_pin_attempts = defaultdict(list)  # ip -> list of timestamps
MAX_PIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 300  # 5 minutes

def _check_rate_limit():
    """Check if the current IP has exceeded PIN attempt limits. Returns (allowed, retry_after)."""
    ip = request.remote_addr or '0.0.0.0'
    now = time.time()
    # Purge old attempts
    _pin_attempts[ip] = [t for t in _pin_attempts[ip] if now - t < LOCKOUT_SECONDS]
    if len(_pin_attempts[ip]) >= MAX_PIN_ATTEMPTS:
        retry_after = int(LOCKOUT_SECONDS - (now - _pin_attempts[ip][0]))
        return False, retry_after
    return True, 0

def _record_failed_attempt():
    """Record a failed PIN attempt for rate limiting."""
    ip = request.remote_addr or '0.0.0.0'
    _pin_attempts[ip].append(time.time())

def _clear_attempts():
    """Clear failed attempts after successful verification."""
    ip = request.remote_addr or '0.0.0.0'
    _pin_attempts.pop(ip, None)


@vault_bp.route("/api/vault/status", methods=['GET'])
def vault_status():
    """Check if vault PIN is set up."""
    config = get_vault_config(current_app.VaultConfig)
    return jsonify({
        'pin_set': 'pin_hash' in config
    })


@vault_bp.route("/api/vault/setup", methods=['POST'])
def vault_setup_route():
    """Set up vault PIN with proper key derivation."""
    data = request.get_json()
    pin = data.get('pin') if data else None

    if not pin or len(pin) != 4 or not pin.isdigit():
        return jsonify({'error': 'PIN must be 4 digits'}), 400

    config = get_vault_config(current_app.VaultConfig)
    if 'pin_hash' in config:
        return jsonify({'error': 'PIN already set up'}), 400

    setup_vault(current_app.VaultConfig, pin)

    # Auto-authenticate after setup
    session.permanent = True
    session['authenticated'] = True
    session['auth_time'] = time.time()

    return jsonify({'success': True})


@vault_bp.route("/api/vault/verify", methods=['POST'])
def vault_verify():
    """Verify vault PIN."""
    allowed, retry_after = _check_rate_limit()
    if not allowed:
        return jsonify({'error': f'Too many attempts. Try again in {retry_after}s', 'locked': True}), 429

    data = request.get_json()
    pin = data.get('pin') if data else None

    if not pin:
        return jsonify({'error': 'PIN required'}), 400

    if not isinstance(pin, str):
        return jsonify({'error': 'Invalid PIN format'}), 400

    config = get_vault_config(current_app.VaultConfig)
    if 'pin_hash' not in config:
        return jsonify({'error': 'PIN not set up'}), 400

    if not verify_pin(current_app.VaultConfig, pin):
        _record_failed_attempt()
        return jsonify({'error': 'Incorrect PIN', 'valid': False}), 401

    _clear_attempts()

    # Create authenticated session
    session.permanent = True
    session['authenticated'] = True
    session['auth_time'] = time.time()

    return jsonify({'success': True, 'valid': True})


@vault_bp.route("/api/vault/change-pin", methods=['POST'])
def vault_change_pin():
    """Change vault PIN and re-wrap all file encryption keys."""
    data = request.get_json()
    old_pin = data.get('old_pin') if data else None
    new_pin = data.get('new_pin') if data else None

    if not old_pin or not new_pin:
        return jsonify({'error': 'Both old and new PIN required'}), 400

    if len(new_pin) != 4 or not new_pin.isdigit():
        return jsonify({'error': 'New PIN must be 4 digits'}), 400

    if old_pin == new_pin:
        return jsonify({'error': 'New PIN must be different from current PIN'}), 400

    config = get_vault_config(current_app.VaultConfig)
    if 'pin_hash' not in config:
        return jsonify({'error': 'PIN not set up'}), 400

    if not verify_pin(current_app.VaultConfig, old_pin):
        _record_failed_attempt()
        return jsonify({'error': 'Incorrect current PIN'}), 401

    _clear_attempts()
    try:
        result = change_pin(
            current_app.VaultConfig,
            current_app.EncryptedFile,
            old_pin,
            new_pin
        )

        # Refresh session after PIN change
        session['auth_time'] = time.time()

        return jsonify({
            'success': True,
            'files_rewrapped': result['files_rewrapped']
        })
    except RuntimeError as e:
        logger.error(f"PIN change failed: {e}")
        return jsonify({'error': str(e)}), 500


@vault_bp.route("/api/vault/reset", methods=['POST'])
def vault_reset():
    """Reset vault: verify PIN, delete all encrypted files, clear DB."""
    data = request.get_json()
    pin = data.get('pin') if data else None

    if not pin:
        return jsonify({'error': 'Current PIN required to reset'}), 400

    config = get_vault_config(current_app.VaultConfig)
    if 'pin_hash' not in config:
        return jsonify({'error': 'PIN not set up'}), 400

    if not verify_pin(current_app.VaultConfig, pin):
        _record_failed_attempt()
        return jsonify({'error': 'Incorrect PIN'}), 401

    _clear_attempts()
    # Delete all encrypted vault files from disk
    deleted_files = 0
    for f in glob.glob(os.path.join(VAULT_FOLDER, '*.enc')):
        try:
            os.remove(f)
            deleted_files += 1
        except OSError as e:
            logger.error(f"Failed to delete {f}: {e}")

    # Also delete any remaining plaintext vault files
    for f in os.listdir(VAULT_FOLDER):
        fpath = os.path.join(VAULT_FOLDER, f)
        if os.path.isfile(fpath):
            try:
                os.remove(fpath)
                deleted_files += 1
            except OSError as e:
                logger.error(f"Failed to delete {fpath}: {e}")

    # Clear encryption metadata from DB
    current_app.EncryptedFile.clear_all()

    # Clear vault config (PIN + salt)
    current_app.VaultConfig.clear()

    # Clear session after vault reset
    session.pop('authenticated', None)
    session.pop('auth_time', None)

    logger.info(f"Vault reset: deleted {deleted_files} files")
    return jsonify({'success': True, 'deleted_files': deleted_files})


@vault_bp.route("/api/vault/lock", methods=['POST'])
def vault_lock():
    """Lock the vault by clearing the authenticated session."""
    session.pop('authenticated', None)
    session.pop('auth_time', None)
    return jsonify({'success': True, 'locked': True})


@vault_bp.route("/api/vault/session", methods=['GET'])
def vault_session_status():
    """Check if the current session is authenticated and not expired."""
    if not session.get('authenticated'):
        return jsonify({'authenticated': False})

    auth_time = session.get('auth_time', 0)
    timeout = current_app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
    elapsed = time.time() - auth_time

    if elapsed > timeout:
        session.pop('authenticated', None)
        session.pop('auth_time', None)
        return jsonify({'authenticated': False, 'reason': 'expired'})

    return jsonify({
        'authenticated': True,
        'remaining_seconds': int(timeout - elapsed)
    })

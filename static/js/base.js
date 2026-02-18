/* SearchBox — Shared utilities loaded on every page via base.html */

// Authenticated fetch — includes X-Vault-PIN header and CSRF token
function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  const pin = sessionStorage.getItem('vaultPin');
  if (pin) {
    options.headers['X-Vault-PIN'] = pin;
  }
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  if (csrfToken) {
    options.headers['X-CSRFToken'] = csrfToken;
  }
  return fetch(url, options);
}

// --- Shared Auth PIN Modal logic ---
const _authPinModal = document.getElementById('auth-pin-modal');
const _authPinModalClose = document.getElementById('auth-pin-modal-close');
const _authPinInputs = document.querySelectorAll('#auth-pin-inputs .auth-pin-box');
const _authPinError = document.getElementById('auth-pin-error');
let _authPinResolve = null;

function showAuthPinModal() {
  return new Promise((resolve) => {
    _authPinResolve = resolve;
    _authPinError.textContent = '';
    _authPinInputs.forEach(b => { b.value = ''; b.classList.remove('error', 'filled'); });
    _authPinModal.style.display = 'flex';
    setTimeout(() => _authPinInputs[0].focus(), 50);
  });
}

function hideAuthPinModal(pin) {
  _authPinModal.style.display = 'none';
  if (_authPinResolve) {
    _authPinResolve(pin || null);
    _authPinResolve = null;
  }
}

_authPinModalClose.addEventListener('click', () => hideAuthPinModal(null));
_authPinModal.addEventListener('click', (e) => {
  if (e.target === _authPinModal) hideAuthPinModal(null);
});

_authPinInputs.forEach((box, index) => {
  box.addEventListener('input', (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = value;
    if (value) {
      box.classList.add('filled');
      if (index < _authPinInputs.length - 1) {
        _authPinInputs[index + 1].focus();
      }
    } else {
      box.classList.remove('filled');
    }
    const pin = Array.from(_authPinInputs).map(b => b.value).join('');
    if (pin.length === 4) {
      hideAuthPinModal(pin);
    }
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      _authPinInputs[index - 1].focus();
    }
    if (e.key === 'Escape') hideAuthPinModal(null);
  });
  box.addEventListener('focus', (e) => e.target.select());
});

// Authenticated fetch with automatic PIN modal on 401
async function pinAuthFetch(url, options = {}) {
  let resp = await authFetch(url, options);
  if (resp.status === 401) {
    const pin = await showAuthPinModal();
    if (!pin) return resp;
    sessionStorage.setItem('vaultPin', pin);
    options.headers = options.headers || {};
    options.headers['X-Vault-PIN'] = pin;
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) options.headers['X-CSRFToken'] = csrfToken;
    resp = await fetch(url, options);
    if (resp.status === 401) {
      sessionStorage.removeItem('vaultPin');
    }
  }
  return resp;
}

// Format file size for display (consistent across all pages)
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'Unknown';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

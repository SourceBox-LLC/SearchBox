/* SearchBox — Shared utilities loaded on every page via base.html */

// Authenticated fetch — includes CSRF token
function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  if (csrfToken) {
    options.headers['X-CSRFToken'] = csrfToken;
  }
  return fetch(url, options);
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
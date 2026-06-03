/* SearchBox — Settings page logic */

// Download recovery key helper
function downloadRecoveryKey(key) {
  const blob = new Blob([key], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'searchbox-recovery-key.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  document.getElementById('recovery-key-modal').style.display = 'none';
  showToast('Recovery key downloaded! Save it in a secure location.', 'success');
}

// Toast notification function
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d29922" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
  };
  
  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Account Management ──────────────────────────────────────────────────────

// Load user info
async function loadUserInfo() {
  try {
    const resp = await fetch('/api/auth/status');
    const data = await resp.json();
    
    const emailEl = document.getElementById('account-email');
    if (emailEl) {
      if (data.authenticated && data.user) {
        emailEl.textContent = data.user.email;
      } else {
        emailEl.textContent = 'Not logged in';
      }
    }
  } catch (e) {
    console.error('Failed to load user info:', e);
  }
}

// Password change
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordModal = document.getElementById('password-modal');
const passwordCancelBtn = document.getElementById('password-cancel-btn');
const passwordSubmitBtn = document.getElementById('password-submit-btn');
const passwordError = document.getElementById('password-error');

if (changePasswordBtn) {
  changePasswordBtn.addEventListener('click', () => {
    if (passwordModal) {
      passwordModal.style.display = 'flex';
      document.getElementById('current-password').focus();
    }
  });
}

if (passwordCancelBtn) {
  passwordCancelBtn.addEventListener('click', () => {
    if (passwordModal) {
      passwordModal.style.display = 'none';
      document.getElementById('current-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
      passwordError.textContent = '';
    }
  });
}

if (passwordSubmitBtn) {
  passwordSubmitBtn.addEventListener('click', async () => {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      passwordError.textContent = 'All fields are required';
      return;
    }
    
    if (newPassword !== confirmPassword) {
      passwordError.textContent = 'New passwords do not match';
      return;
    }
    
    if (newPassword.length < 1) {
      passwordError.textContent = 'Password cannot be empty';
      return;
    }
    
    try {
      const resp = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      
      const data = await resp.json();
      
      if (resp.ok) {
        showToast('Password changed successfully', 'success');
        passwordModal.style.display = 'none';
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        passwordError.textContent = '';
      } else {
        passwordError.textContent = data.error || 'Failed to change password';
      }
    } catch (e) {
      passwordError.textContent = 'Error connecting to server';
    }
  });
}

// ── Recovery Key ───────────────────────────────────────────────────────────

const generateRecoveryKeyBtn = document.getElementById('generate-recovery-key-btn');

if (generateRecoveryKeyBtn) {
  generateRecoveryKeyBtn.addEventListener('click', async () => {
    generateRecoveryKeyBtn.disabled = true;
    generateRecoveryKeyBtn.textContent = 'Generating...';
    
    try {
      const resp = await authFetch('/api/settings/generate-recovery-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await resp.json();
      
      if (resp.ok) {
        // Download recovery key as file
        const blob = new Blob([data.recovery_key], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'searchbox-recovery-key.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Recovery key downloaded! Save it in a secure location.', 'success');
      } else {
        showToast(data.error || 'Failed to generate recovery key', 'error');
      }
    } catch (e) {
      showToast('Error connecting to server', 'error');
    } finally {
      generateRecoveryKeyBtn.disabled = false;
      generateRecoveryKeyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
        </svg>
        Generate Recovery Key
      `;
    }
  });
}

// ── Vault Management ──────────────────────────────────────────────────────

const resetVaultBtn = document.getElementById('reset-vault-btn');
const resetWarning = document.getElementById('reset-warning');
const resetConfirmInput = document.getElementById('reset-confirm-input');
const resetCancelBtn = document.getElementById('reset-cancel-btn');
const resetConfirmBtn = document.getElementById('reset-confirm-btn');

if (resetVaultBtn) {
  resetVaultBtn.addEventListener('click', () => {
    if (resetWarning) {
      resetWarning.style.display = 'block';
      resetConfirmInput.value = '';
      resetConfirmBtn.disabled = true;
    }
  });
}

if (resetCancelBtn) {
  resetCancelBtn.addEventListener('click', () => {
    if (resetWarning) {
      resetWarning.style.display = 'none';
      resetConfirmInput.value = '';
      resetConfirmBtn.disabled = true;
    }
  });
}

if (resetConfirmInput) {
  resetConfirmInput.addEventListener('input', () => {
    resetConfirmBtn.disabled = resetConfirmInput.value.trim() !== 'RESET';
  });
}

if (resetConfirmBtn) {
  resetConfirmBtn.addEventListener('click', async () => {
    if (resetConfirmInput.value.trim() !== 'RESET') return;
    
    resetConfirmBtn.disabled = true;
    resetConfirmBtn.textContent = 'Resetting...';
    
    try {
      const resp = await authFetch('/api/vault/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
      });
      
      const data = await resp.json();
      
      if (resp.ok) {
        showToast(`Vault reset: ${data.deleted_files} files deleted`, 'success');
        resetWarning.style.display = 'none';
        resetConfirmInput.value = '';
        resetConfirmBtn.textContent = 'Reset Vault';
      } else {
        showToast(data.error || 'Failed to reset vault', 'error');
        resetConfirmBtn.textContent = 'Reset Vault';
        resetConfirmBtn.disabled = false;
      }
    } catch (e) {
      showToast('Error resetting vault', 'error');
      resetConfirmBtn.textContent = 'Reset Vault';
      resetConfirmBtn.disabled = false;
    }
  });
}

// ── Vault Unlock (in-memory key is cleared on restart) ────────────────────

const vaultLockedPanel = document.getElementById('vault-locked');
const vaultUnlockBtn = document.getElementById('vault-unlock-btn');
const vaultUnlockInput = document.getElementById('vault-unlock-password');

async function refreshVaultStatus() {
  if (!vaultLockedPanel) return;
  try {
    const resp = await fetch('/api/vault/status');
    if (!resp.ok) return;
    const data = await resp.json();
    vaultLockedPanel.style.display = data.locked ? 'block' : 'none';
  } catch (e) {
    /* network hiccup — leave the panel as-is */
  }
}

async function submitVaultUnlock() {
  const pw = vaultUnlockInput ? vaultUnlockInput.value : '';
  if (!pw) { showToast('Enter your password', 'error'); return; }
  vaultUnlockBtn.disabled = true;
  try {
    const resp = await authFetch('/api/vault/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await resp.json();
    if (resp.ok) {
      showToast('Vault unlocked', 'success');
      if (vaultUnlockInput) vaultUnlockInput.value = '';
      refreshVaultStatus();
    } else {
      showToast(data.error || 'Unlock failed', 'error');
    }
  } catch (e) {
    showToast('Unlock failed', 'error');
  } finally {
    vaultUnlockBtn.disabled = false;
  }
}

if (vaultUnlockBtn) {
  vaultUnlockBtn.addEventListener('click', submitVaultUnlock);
}
if (vaultUnlockInput) {
  vaultUnlockInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitVaultUnlock();
  });
}
refreshVaultStatus();

// ── Indexed Folders ──────────────────────────────────────────────────────

const foldersList = document.getElementById('folders-list');

async function loadIndexedFolders() {
  try {
    const response = await fetch('/api/folders');
    const data = await response.json();
    
    if (data.folders && data.folders.length > 0) {
      foldersList.innerHTML = data.folders.map(folder => `
        <div class="folder-item" data-path="${folder}">
          <div class="folder-path">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${folder}</span>
          </div>
          <button class="folder-remove" onclick="removeFolder(this)">Remove</button>
        </div>
      `).join('');
    } else {
      foldersList.innerHTML = '<div class="no-folders">No folders indexed yet. Add folders from the main page.</div>';
    }
  } catch (error) {
    console.error('Failed to load folders:', error);
  }
}

window.removeFolder = async function(btn) {
  // Read the path from the unmangled data-path attribute — an inline-onclick JS
  // string literal would corrupt a Windows path's backslashes.
  const item = btn.closest('[data-path]');
  const folderPath = item ? item.dataset.path : '';
  if (!folderPath) return;
  if (!confirm(`Remove "${folderPath}" from indexed folders?`)) return;
  
  try {
    const resp = await authFetch('/api/folder/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath })
    });
    
    if (resp.ok) {
      showToast('Folder removed', 'success');
      loadIndexedFolders();
    } else {
      const data = await resp.json();
      showToast(data.error || 'Failed to remove folder', 'error');
    }
  } catch (e) {
    showToast('Error removing folder', 'error');
  }
};

// ── Helper Functions ──────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Sign out button
const signOutBtn = document.getElementById('sign-out-btn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const resp = await fetch('/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken || ''
        }
      });
      if (resp.ok) {
        window.location.href = '/login';
      } else {
        showToast('Failed to sign out', 'error');
      }
    } catch (e) {
      showToast('Error signing out', 'error');
    }
  });
}

// ── Software updates ──────────────────────────────────────────────────────
function initUpdates() {
  const versionEl = document.getElementById('app-version');
  const statusEl = document.getElementById('update-status');
  const checkBtn = document.getElementById('check-update-btn');
  const applyBtn = document.getElementById('apply-update-btn');
  const autoToggle = document.getElementById('auto-update-toggle');
  if (!checkBtn || !statusEl) return;

  // This build's version — local, no network.
  fetch('/api/version')
    .then(r => r.json())
    .then(d => { if (versionEl && d.version) versionEl.textContent = 'v' + d.version; })
    .catch(() => {});

  // The auto-check preference is a local UI setting (so the app stays silent
  // unless the user opts in) — see index.js for the on-startup check.
  if (autoToggle) {
    autoToggle.checked = localStorage.getItem('autoUpdateCheck') === 'true';
    autoToggle.addEventListener('change', () => {
      localStorage.setItem('autoUpdateCheck', autoToggle.checked ? 'true' : 'false');
    });
  }

  async function check() {
    statusEl.textContent = 'Checking…';
    applyBtn.style.display = 'none';
    try {
      const resp = await fetch('/api/update/check');
      if (!resp.ok) throw new Error('check failed');
      const d = await resp.json();
      if (d.update_available) {
        statusEl.innerHTML = `Version <strong>v${d.latest}</strong> is available ` +
          `(you have v${d.current}). <a href="${d.release_url}" target="_blank" rel="noopener">Release notes</a>`;
        // Only offer in-app install when the release ships an installer for this platform.
        applyBtn.style.display = d.download_url ? '' : 'none';
      } else {
        statusEl.textContent = `You're up to date (v${d.current}).`;
      }
    } catch (e) {
      statusEl.textContent = 'Could not check for updates (no connection, or GitHub rate-limited).';
    }
  }
  checkBtn.addEventListener('click', check);

  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    statusEl.textContent = 'Downloading the installer…';
    try {
      const resp = await authFetch('/api/update/apply', { method: 'POST' });
      const d = await resp.json();
      if (resp.ok) {
        statusEl.textContent = 'The installer is opening — follow its prompts. SearchBox will close to finish updating.';
      } else {
        statusEl.textContent = d.error || 'Update failed.';
        applyBtn.disabled = false;
      }
    } catch (e) {
      statusEl.textContent = 'Update failed (could not reach the server).';
      applyBtn.disabled = false;
    }
  });

  // If auto-check is enabled, also check as soon as this page opens.
  if (autoToggle && autoToggle.checked) check();
}

// ── Search Engine (Meilisearch) ───────────────────────────────────────────
function initMeili() {
  const dot = document.getElementById('meili-status-dot');
  const text = document.getElementById('meili-status-text');
  const statsEl = document.getElementById('meili-stats');
  const pathInput = document.getElementById('meili-path');
  const portInput = document.getElementById('meili-port');
  const autostart = document.getElementById('meili-autostart');
  const startBtn = document.getElementById('meili-start-btn');
  const stopBtn = document.getElementById('meili-stop-btn');
  const clearBtn = document.getElementById('meili-clear-btn');
  if (!text || !startBtn) return;

  const toast = (type, title, msg) => {
    if (typeof showToast === 'function') showToast(type, title, msg);
  };

  async function loadStatus() {
    try {
      const d = await (await fetch('/api/meilisearch/status')).json();
      const running = !!d.running;
      if (dot) dot.className = 'status-dot ' + (running ? 'running' : 'stopped');
      let label = running ? 'Running' : 'Stopped';
      if (running && d.version) label += ` · v${d.version}`;
      text.textContent = label;
      if (statsEl) {
        const n = d.stats && (d.stats.numberOfDocuments ?? d.stats.number_of_documents);
        statsEl.textContent = running && n != null ? `${Number(n).toLocaleString()} documents indexed` : '';
      }
      if (startBtn) startBtn.disabled = running;
      if (stopBtn) stopBtn.disabled = !running;
    } catch (e) {
      if (dot) dot.className = 'status-dot stopped';
      text.textContent = 'Status unavailable';
    }
  }

  async function loadConfig() {
    try {
      const d = await (await fetch('/api/meilisearch/config')).json();
      if (pathInput && d.meilisearch_path) pathInput.value = d.meilisearch_path;
      if (portInput && d.port) portInput.value = d.port;
      if (autostart) autostart.checked = !!d.auto_start;
    } catch (e) { /* keep template defaults */ }
  }

  async function saveConfig() {
    // Only send a path/port when actually set, so an empty field never clobbers
    // the sibling-binary auto-detect or the default port.
    const body = { auto_start: autostart ? autostart.checked : undefined };
    const p = pathInput && pathInput.value.trim();
    const port = portInput && portInput.value.trim();
    if (p) body.meilisearch_path = p;
    if (port) body.meilisearch_port = port;
    try {
      await authFetch('/api/meilisearch/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) { /* non-fatal */ }
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    text.textContent = 'Starting…';
    await saveConfig();
    try {
      const resp = await authFetch('/api/meilisearch/start', { method: 'POST' });
      const d = await resp.json();
      if (!resp.ok) toast('error', 'Meilisearch', d.error || 'Failed to start');
    } catch (e) { toast('error', 'Meilisearch', 'Could not reach the server'); }
    setTimeout(loadStatus, 1000);
  });

  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    text.textContent = 'Stopping…';
    try {
      const resp = await authFetch('/api/meilisearch/stop', { method: 'POST' });
      const d = await resp.json();
      if (!resp.ok) toast('error', 'Meilisearch', d.error || 'Failed to stop');
    } catch (e) { toast('error', 'Meilisearch', 'Could not reach the server'); }
    setTimeout(loadStatus, 600);
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear the entire search index? Every indexed document is removed from search (your actual files are NOT deleted). You would need to re-index to search again.')) return;
    clearBtn.disabled = true;
    try {
      const resp = await authFetch('/api/meilisearch/clear', { method: 'POST' });
      const d = await resp.json();
      toast(resp.ok ? 'success' : 'error', resp.ok ? 'Index cleared' : 'Clear failed',
        resp.ok ? 'The search index was cleared.' : (d.error || 'Could not clear the index'));
    } catch (e) { toast('error', 'Clear failed', 'Could not reach the server'); }
    clearBtn.disabled = false;
    loadStatus();
  });

  if (autostart) autostart.addEventListener('change', saveConfig);

  loadConfig();
  loadStatus();
}

// ── AI Search (Ollama) ────────────────────────────────────────────────────
function initOllama() {
  const aiToggle = document.getElementById('ai-search-toggle');
  const ollamaSettings = document.getElementById('ollama-settings');
  const urlInput = document.getElementById('ollama-url');
  const modelInput = document.getElementById('ollama-model');
  const timeoutInput = document.getElementById('ollama-timeout');
  const autoconnect = document.getElementById('ollama-autoconnect');
  const statusText = document.getElementById('ollama-status-text');
  const statusDot = document.getElementById('ollama-status-dot');
  const testBtn = document.getElementById('test-ollama-btn');
  const modelsText = document.getElementById('ollama-models-text');
  const refreshBtn = document.getElementById('refresh-models-btn');
  if (!aiToggle) return;

  const showOllama = () => {
    if (ollamaSettings) ollamaSettings.style.display = aiToggle.checked ? '' : 'none';
  };

  async function saveConfig(patch) {
    try {
      await authFetch('/api/meilisearch/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (e) { /* non-fatal */ }
  }

  async function loadConfig() {
    try {
      const d = await (await fetch('/api/meilisearch/config')).json();
      if (urlInput && d.ollama_url) urlInput.value = d.ollama_url;
      if (modelInput && d.ollama_model) modelInput.value = d.ollama_model;
      aiToggle.checked = !!d.ai_search_enabled;
    } catch (e) { /* keep template defaults */ }
    showOllama();
  }

  async function loadStatus() {
    try {
      const d = await (await fetch('/api/ollama/status')).json();
      if (autoconnect) autoconnect.checked = !!d.autoconnect;
      const connected = !!d.connected;
      if (statusDot) statusDot.className = 'status-dot ' + (connected ? 'running' : (d.enabled ? 'stopped' : 'checking'));
      if (statusText) {
        statusText.textContent = !d.enabled
          ? 'AI Search is disabled'
          : (connected ? `Connected${d.configured_model ? ' · ' + d.configured_model : ''}` : 'Not connected — is Ollama running?');
      }
      if (modelsText) {
        const models = d.available_models || [];
        modelsText.textContent = models.length ? models.join(', ') : (connected ? 'No models installed (e.g. run: ollama pull llama3)' : '—');
      }
    } catch (e) {
      if (statusText) statusText.textContent = 'Status unavailable';
    }
  }

  const saveOllama = () => saveConfig({
    ollama_url: urlInput ? urlInput.value.trim() : undefined,
    ollama_model: modelInput ? modelInput.value.trim() : undefined,
    ollama_timeout: timeoutInput ? timeoutInput.value.trim() : undefined,
    ollama_autoconnect: autoconnect ? autoconnect.checked : undefined,
  });

  aiToggle.addEventListener('change', async () => {
    showOllama();
    await saveConfig({ ai_search_enabled: aiToggle.checked });
    loadStatus();
  });
  [urlInput, modelInput, timeoutInput].forEach((el) => el && el.addEventListener('change', saveOllama));
  if (autoconnect) autoconnect.addEventListener('change', saveOllama);

  if (testBtn) testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    if (statusText) statusText.textContent = 'Testing…';
    await saveOllama();
    try {
      const resp = await authFetch('/api/ollama/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput ? urlInput.value.trim() : undefined,
          timeout: timeoutInput ? (Number(timeoutInput.value) || undefined) : undefined,
        }),
      });
      const d = await resp.json();
      if (statusDot) statusDot.className = 'status-dot ' + (d.connected ? 'running' : 'stopped');
      if (statusText) statusText.textContent = d.connected ? 'Connected' : 'Not connected — is Ollama running at that URL?';
    } catch (e) {
      if (statusText) statusText.textContent = 'Test failed (could not reach the server)';
    }
    testBtn.disabled = false;
    loadStatus();
  });

  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    if (modelsText) modelsText.textContent = 'Loading models…';
    try {
      const d = await (await fetch('/api/ollama/models')).json();
      const models = d.models || [];
      if (modelsText) modelsText.textContent = models.length ? models.join(', ') : 'No models installed (e.g. run: ollama pull llama3)';
    } catch (e) {
      if (modelsText) modelsText.textContent = 'Could not list models';
    }
  });

  loadConfig();
  loadStatus();
}

// ── Global "Save Configuration" button ────────────────────────────────────
function initGlobalSave() {
  const btn = document.getElementById('global-save-btn');
  const status = document.getElementById('save-status');
  if (!btn) return;
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const checked = (id) => { const el = document.getElementById(id); return el ? el.checked : undefined; };

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    if (status) { status.className = 'save-status'; status.textContent = 'Saving…'; }
    // Everything that flows through the settings ConfigPatch (Search Engine +
    // AI Search). Empty path/url/model fields are omitted so a blank input never
    // clobbers an auto-detected path or an existing value.
    const patch = {
      auto_start: checked('meili-autostart'),
      ai_search_enabled: checked('ai-search-toggle'),
      ollama_autoconnect: checked('ollama-autoconnect'),
    };
    const add = (key, v) => { if (v) patch[key] = v; };
    add('meilisearch_path', val('meili-path'));
    add('meilisearch_port', val('meili-port'));
    add('ollama_url', val('ollama-url'));
    add('ollama_model', val('ollama-model'));
    add('ollama_timeout', val('ollama-timeout'));
    try {
      const resp = await authFetch('/api/meilisearch/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (resp.ok) {
        if (status) { status.className = 'save-status success'; status.textContent = '✓ Saved'; }
        if (typeof showToast === 'function') showToast('success', 'Settings saved', 'Your configuration was saved.');
        setTimeout(() => { if (status && status.textContent === '✓ Saved') status.textContent = ''; }, 4000);
      } else {
        const d = await resp.json().catch(() => ({}));
        if (status) { status.className = 'save-status error'; status.textContent = d.error || 'Save failed'; }
      }
    } catch (e) {
      if (status) { status.className = 'save-status error'; status.textContent = 'Save failed (server unreachable)'; }
    }
    btn.disabled = false;
  });
}

// ── Search History panel ──────────────────────────────────────────────────
function initSearchHistory() {
  const toggle = document.getElementById('ai-history-enhancement');
  const list = document.getElementById('recent-searches-list');
  const clearBtn = document.getElementById('clear-search-history');
  if (!toggle && !list && !clearBtn) return;
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  function render(history) {
    if (!list) return;
    if (!history || history.length === 0) {
      list.innerHTML = '<p class="search-history-empty">No recent searches yet — your searches will show up here.</p>';
      return;
    }
    list.innerHTML = history.map((q) => `<div class="search-history-item">${esc(q)}</div>`).join('');
  }

  async function loadHistory() {
    try {
      const d = await (await fetch('/api/settings/search-history')).json();
      render(d.history || []);
    } catch (e) {
      if (list) list.innerHTML = '<p class="search-history-empty">Could not load search history.</p>';
    }
  }

  async function loadToggle() {
    if (!toggle) return;
    try {
      const d = await (await fetch('/api/settings/ai-enhancement')).json();
      toggle.checked = d.enabled !== false;
    } catch (e) { /* leave template default */ }
  }

  if (toggle) {
    toggle.addEventListener('change', async () => {
      try {
        await authFetch('/api/settings/ai-enhancement', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: toggle.checked }),
        });
      } catch (e) { /* non-fatal */ }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Clear your recent search history?')) return;
      clearBtn.disabled = true;
      try {
        await authFetch('/api/settings/search-history', { method: 'DELETE' });
        render([]);
        if (typeof showToast === 'function') showToast('success', 'History cleared', 'Your search history was cleared.');
      } catch (e) { /* non-fatal */ }
      clearBtn.disabled = false;
    });
  }

  loadToggle();
  loadHistory();
}

// Initialize
loadUserInfo();
loadIndexedFolders();
initUpdates();
initMeili();
initOllama();
initGlobalSave();
initSearchHistory();

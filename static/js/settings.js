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
          <button class="folder-remove" onclick="removeFolder('${folder}')">Remove</button>
        </div>
      `).join('');
    } else {
      foldersList.innerHTML = '<div class="no-folders">No folders indexed yet. Add folders from the main page.</div>';
    }
  } catch (error) {
    console.error('Failed to load folders:', error);
  }
}

window.removeFolder = async function(folderPath) {
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

// Initialize
loadUserInfo();
loadIndexedFolders();

/* SearchBox — Settings page logic */

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

    // DOM Elements
    const vaultStatus = document.getElementById('vault-status');
    const setupPinBtn = document.getElementById('setup-pin-btn');
    const changePinBtn = document.getElementById('change-pin-btn');
    const resetVaultBtn = document.getElementById('reset-vault-btn');
    const pinContainer = document.getElementById('pin-container');
    const pinTitle = document.getElementById('pin-title');
    const pinBoxes = document.querySelectorAll('.pin-box');
    const pinStatus = document.getElementById('pin-status');
    const pinCancelBtn = document.getElementById('pin-cancel-btn');
    const resetWarning = document.getElementById('reset-warning');
    const resetConfirmInput = document.getElementById('reset-confirm-input');
    const resetCancelBtn = document.getElementById('reset-cancel-btn');
    const resetConfirmBtn = document.getElementById('reset-confirm-btn');
    const foldersList = document.getElementById('folders-list');

    let currentPinAction = null;
    let pinStep = 'enter'; // 'enter', 'confirm', 'current', 'new'
    let tempPin = '';

    // Check vault status on load
    async function checkVaultStatus() {
      try {
        const response = await fetch('/api/vault/status');
        const data = await response.json();
        
        if (data.pin_set) {
          vaultStatus.className = 'vault-status setup';
          vaultStatus.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span class="vault-status-text"><strong>PIN is set up.</strong> Your vault is protected.</span>
          `;
          setupPinBtn.disabled = true;
          setupPinBtn.textContent = 'PIN Set';
          changePinBtn.disabled = false;
        }
      } catch (error) {
        console.error('Failed to check vault status:', error);
      }
    }

    // Load indexed folders
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

    // PIN Box handling
    pinBoxes.forEach((box, index) => {
      box.addEventListener('input', (e) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = value;
        
        if (value && index < pinBoxes.length - 1) {
          pinBoxes[index + 1].focus();
        }
        
        // Check if all boxes filled
        const pin = Array.from(pinBoxes).map(b => b.value).join('');
        if (pin.length === 4) {
          handlePinComplete(pin);
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          pinBoxes[index - 1].focus();
        }
      });

      box.addEventListener('focus', (e) => {
        e.target.select();
      });
    });

    function clearPinBoxes() {
      pinBoxes.forEach(box => {
        box.value = '';
        box.classList.remove('filled', 'error');
      });
      pinBoxes[0].focus();
    }

    function showPinEntry(action, title) {
      currentPinAction = action;
      pinTitle.textContent = title;
      pinContainer.classList.add('visible');
      pinStatus.textContent = '';
      pinStatus.className = 'pin-status';
      clearPinBoxes();
    }

    function hidePinEntry() {
      pinContainer.classList.remove('visible');
      currentPinAction = null;
      pinStep = 'enter';
      tempPin = '';
    }

    async function handlePinComplete(pin) {
      if (currentPinAction === 'setup') {
        if (pinStep === 'enter') {
          tempPin = pin;
          pinStep = 'confirm';
          pinTitle.textContent = 'Confirm your PIN';
          clearPinBoxes();
        } else if (pinStep === 'confirm') {
          if (pin === tempPin) {
            // Save PIN
            try {
              const response = await authFetch('/api/vault/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: pin })
              });
              
              if (response.ok) {
                // Cache PIN for this session
                sessionStorage.setItem('vaultPin', pin);
                pinStatus.textContent = '✓ PIN set successfully!';
                pinStatus.className = 'pin-status success';
                setTimeout(() => {
                  hidePinEntry();
                  checkVaultStatus();
                }, 1500);
              } else {
                const data = await response.json();
                pinStatus.textContent = data.error || 'Failed to set PIN';
                pinStatus.className = 'pin-status error';
                pinBoxes.forEach(b => b.classList.add('error'));
              }
            } catch (error) {
              pinStatus.textContent = 'Error connecting to server';
              pinStatus.className = 'pin-status error';
            }
          } else {
            pinStatus.textContent = 'PINs do not match. Try again.';
            pinStatus.className = 'pin-status error';
            pinBoxes.forEach(b => b.classList.add('error'));
            pinStep = 'enter';
            tempPin = '';
            setTimeout(() => {
              pinTitle.textContent = 'Create a 4-digit PIN';
              clearPinBoxes();
            }, 1500);
          }
        }
      } else if (currentPinAction === 'reset') {
        // Verify PIN then reset vault
        try {
          const response = await authFetch('/api/vault/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pin })
          });
          
          if (response.ok) {
            // Clear cached PIN since vault is reset
            sessionStorage.removeItem('vaultPin');
            pinStatus.textContent = '✓ Vault has been reset.';
            pinStatus.className = 'pin-status success';
            showToast('Vault has been reset. You can now set up a new PIN.', 'success');
            setTimeout(() => {
              hidePinEntry();
              checkVaultStatus();
            }, 1500);
          } else {
            const data = await response.json();
            pinStatus.textContent = data.error || 'Failed to reset vault';
            pinStatus.className = 'pin-status error';
            pinBoxes.forEach(b => b.classList.add('error'));
            setTimeout(clearPinBoxes, 1000);
          }
        } catch (error) {
          pinStatus.textContent = 'Error connecting to server';
          pinStatus.className = 'pin-status error';
        }
      } else if (currentPinAction === 'change') {
        if (pinStep === 'current') {
          // Verify current PIN
          try {
            const response = await authFetch('/api/vault/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: pin })
            });
            
            if (response.ok) {
              tempPin = pin;
              pinStep = 'new';
              pinTitle.textContent = 'Enter new PIN';
              clearPinBoxes();
            } else {
              pinStatus.textContent = 'Incorrect PIN';
              pinStatus.className = 'pin-status error';
              pinBoxes.forEach(b => b.classList.add('error'));
              setTimeout(clearPinBoxes, 1000);
            }
          } catch (error) {
            pinStatus.textContent = 'Error verifying PIN';
            pinStatus.className = 'pin-status error';
          }
        } else if (pinStep === 'new') {
          // Set new PIN
          try {
            const response = await authFetch('/api/vault/change-pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ old_pin: tempPin, new_pin: pin })
            });
            
            if (response.ok) {
              // Cache new PIN for this session
              sessionStorage.setItem('vaultPin', pin);
              pinStatus.textContent = '✓ PIN changed successfully!';
              pinStatus.className = 'pin-status success';
              setTimeout(hidePinEntry, 1500);
            } else {
              const data = await response.json();
              pinStatus.textContent = data.error || 'Failed to change PIN';
              pinStatus.className = 'pin-status error';
            }
          } catch (error) {
            pinStatus.textContent = 'Error connecting to server';
            pinStatus.className = 'pin-status error';
          }
        }
      }
    }

    // Button handlers
    setupPinBtn.addEventListener('click', () => {
      pinStep = 'enter';
      showPinEntry('setup', 'Create a 4-digit PIN');
    });

    changePinBtn.addEventListener('click', () => {
      pinStep = 'current';
      showPinEntry('change', 'Enter current PIN');
    });

    pinCancelBtn.addEventListener('click', hidePinEntry);

    // Reset Vault
    resetVaultBtn.addEventListener('click', () => {
      resetWarning.classList.add('visible');
      resetConfirmInput.value = '';
      resetConfirmBtn.disabled = true;
    });

    resetCancelBtn.addEventListener('click', () => {
      resetWarning.classList.remove('visible');
    });

    resetConfirmInput.addEventListener('input', () => {
      resetConfirmBtn.disabled = resetConfirmInput.value !== 'RESET';
    });

    resetConfirmBtn.addEventListener('click', async () => {
      if (resetConfirmInput.value === 'RESET') {
        // Show PIN entry to authorize the reset
        resetWarning.classList.remove('visible');
        currentPinAction = 'reset';
        pinStep = 'enter';
        showPinEntry('reset', 'Enter your PIN to confirm reset');
      }
    });

    // Remove folder from index (global for onclick in dynamic HTML)
    window.removeFolder = async function removeFolder(folderPath) {
      if (!confirm(`Remove "${folderPath}" from index? Indexed documents from this folder will be removed from search.`)) {
        return;
      }
      
      try {
        const response = await authFetch('/api/folder/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folderPath, remove_documents: true })
        });
        
        if (response.ok) {
          const result = await response.json();
          const count = result.documents_removed || 0;
          showToast(`Folder removed — ${count} document(s) cleaned from search`, 'success');
          loadIndexedFolders();
        } else {
          showToast('Failed to remove folder', 'error');
        }
      } catch (error) {
        showToast('Error connecting to server', 'error');
      }
    }

    // Meilisearch Management
    const meiliStatusDot = document.getElementById('meili-status-dot');
    const meiliStatusText = document.getElementById('meili-status-text');
    const meiliStats = document.getElementById('meili-stats');
    const meiliPath = document.getElementById('meili-path');
    const meiliPort = document.getElementById('meili-port');
    const meiliAutostart = document.getElementById('meili-autostart');
    const meiliStartBtn = document.getElementById('meili-start-btn');
    const meiliStopBtn = document.getElementById('meili-stop-btn');
    const meiliSaveBtn = document.getElementById('meili-save-btn');
    const meiliClearBtn = document.getElementById('meili-clear-btn');
    const aiSearchToggle = document.getElementById('ai-search-toggle');
    
    // Ollama settings elements
    const ollamaUrl = document.getElementById('ollama-url');
    const ollamaModel = document.getElementById('ollama-model');
    const ollamaTimeout = document.getElementById('ollama-timeout');
    const ollamaAutoconnect = document.getElementById('ollama-autoconnect');
    
    // Ollama status elements
    const ollamaStatusDot = document.getElementById('ollama-status-dot');
    const ollamaStatusText = document.getElementById('ollama-status-text');
    const ollamaModelsText = document.getElementById('ollama-models-text');
    const refreshModelsBtn = document.getElementById('refresh-models-btn');
    const testOllamaBtn = document.getElementById('test-ollama-btn');
    
    // Save button elements
    const saveBtnText = document.getElementById('save-btn-text');
    const saveChangesIndicator = document.getElementById('save-changes-indicator');
    
    // Track original values for change detection
    let originalValues = {};
    let hasChanges = false;

    function updateChangesIndicator() {
      if (hasChanges) {
        saveChangesIndicator.style.display = 'inline';
        saveBtnText.textContent = 'Save Changes *';
        meiliSaveBtn.classList.add('btn-warning');
        meiliSaveBtn.classList.remove('btn-primary');
      } else {
        saveChangesIndicator.style.display = 'none';
        saveBtnText.textContent = 'Save Changes';
        meiliSaveBtn.classList.remove('btn-warning');
        meiliSaveBtn.classList.add('btn-primary');
      }
    }

    function checkForChanges() {
      const currentValues = {
        meilisearch_path: meiliPath.value,
        meilisearch_port: parseInt(meiliPort.value) || 7700,
        auto_start: meiliAutostart.checked,
        ai_search_enabled: aiSearchToggle.checked,
        ollama_url: ollamaUrl.value,
        ollama_model: ollamaModel.value,
        ollama_timeout: parseInt(ollamaTimeout.value) || 30,
        ollama_autoconnect: ollamaAutoconnect.checked
      };
      
      hasChanges = JSON.stringify(currentValues) !== JSON.stringify(originalValues);
      updateChangesIndicator();
    }

    function storeOriginalValues() {
      originalValues = {
        meilisearch_path: meiliPath.value,
        meilisearch_port: parseInt(meiliPort.value) || 7700,
        auto_start: meiliAutostart.checked,
        ai_search_enabled: aiSearchToggle.checked,
        ollama_url: ollamaUrl.value,
        ollama_model: ollamaModel.value,
        ollama_timeout: parseInt(ollamaTimeout.value) || 30,
        ollama_autoconnect: ollamaAutoconnect.checked
      };
      hasChanges = false;
      updateChangesIndicator();
      
      console.log('Original values stored:');
      console.log('  ai_search_enabled:', originalValues.ai_search_enabled);
      console.log('  aiSearchToggle.checked:', aiSearchToggle.checked);
      console.log('  ollama_autoconnect:', originalValues.ollama_autoconnect);
      console.log('  ollamaAutoconnect.checked:', ollamaAutoconnect.checked);
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Ollama functions
    async function checkOllamaStatus(showToastOnSuccess = false) {
      try {
        console.log('Checking Ollama status (showToast:', showToastOnSuccess, ')...');
        const response = await fetch('/api/ollama/status');
        const data = await response.json();
        
        console.log('Ollama status response:', data);
        
        if (data.enabled) {
          if (data.connected) {
            ollamaStatusDot.className = 'status-dot running';
            ollamaStatusText.textContent = `Connected to ${data.server_url} • ${data.model_count} models available`;
            console.log('✅ Ollama connected - UI updated');
            if (showToastOnSuccess) {
              showToast('Ollama connected successfully', 'success');
            }
          } else {
            ollamaStatusDot.className = 'status-dot stopped';
            ollamaStatusText.textContent = data.error || 'Connection failed';
            console.log('❌ Ollama not connected - UI updated');
          }
        } else {
          ollamaStatusDot.className = 'status-dot stopped';
          ollamaStatusText.textContent = 'AI Search is disabled';
          console.log('🚫 AI Search disabled - UI updated');
        }
      } catch (error) {
        ollamaStatusDot.className = 'status-dot stopped';
        ollamaStatusText.textContent = 'Error checking status';
        console.error('Error checking Ollama status:', error);
      }
    }

    async function refreshOllamaModels() {
      try {
        refreshModelsBtn.disabled = true;
        refreshModelsBtn.textContent = 'Refreshing...';
        
        const response = await fetch('/api/ollama/models');
        const data = await response.json();
        
        if (data.models && Array.isArray(data.models)) {
          if (data.models.length > 0) {
            ollamaModelsText.textContent = `${data.count} models: ${data.models.slice(0, 3).join(', ')}${data.count > 3 ? '...' : ''}`;
            showToast(`Found ${data.count} models`, 'success');
          } else {
            ollamaModelsText.textContent = 'No models available - pull one to get started';
            showToast('No models found', 'warning');
          }
        } else {
          ollamaModelsText.textContent = 'No models available';
          showToast('No models found', 'warning');
        }
      } catch (error) {
        ollamaModelsText.textContent = 'Error loading models';
        showToast('Error loading models', 'error');
        console.error('Error refreshing models:', error);
      } finally {
        refreshModelsBtn.disabled = false;
        refreshModelsBtn.textContent = 'Refresh';
      }
    }

    async function testOllamaConnection() {
      try {
        testOllamaBtn.disabled = true;
        testOllamaBtn.textContent = 'Testing...';
        ollamaStatusDot.className = 'status-dot checking';
        ollamaStatusText.textContent = 'Testing connection...';
        
        const response = await authFetch('/api/ollama/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ollama_url: ollamaUrl.value,
            ollama_timeout: parseInt(ollamaTimeout.value)
          })
        });
        
        const data = await response.json();
        
        if (data.connected) {
          ollamaStatusDot.className = 'status-dot running';
          ollamaStatusText.textContent = `Connected to ${data.server_url} • ${data.model_count} models available`;
          showToast('Ollama connection successful!', 'success');
          
          // Refresh models after successful connection
          await refreshOllamaModels();
        } else {
          ollamaStatusDot.className = 'status-dot stopped';
          ollamaStatusText.textContent = data.error || 'Connection failed';
          showToast('Ollama connection failed', 'error');
        }
      } catch (error) {
        ollamaStatusDot.className = 'status-dot stopped';
        ollamaStatusText.textContent = 'Connection test failed';
        showToast('Connection test failed', 'error');
        console.error('Error testing Ollama:', error);
      } finally {
        testOllamaBtn.disabled = false;
        testOllamaBtn.textContent = 'Test Connection';
      }
    }

    async function loadMeiliConfig() {
      try {
        const response = await fetch('/api/meilisearch/config');
        const data = await response.json();
        
        // Load Meilisearch settings
        meiliPath.value = data.meilisearch_path || '';
        meiliPort.value = data.meilisearch_port || 7700;
        meiliAutostart.checked = data.auto_start !== false;
        aiSearchToggle.checked = data.ai_search_enabled === true;
        
        console.log('AI Search Debug:');
        console.log('  API value:', data.ai_search_enabled);
        console.log('  Toggle set to:', aiSearchToggle.checked);
        console.log('  Toggle checked after set:', aiSearchToggle.checked);
        
        console.log('Auto-connect Debug:');
        console.log('  API value:', data.ollama_autoconnect, '(', typeof data.ollama_autoconnect, ')');
        console.log('  === true result:', data.ollama_autoconnect === true);
        console.log('  Setting toggle to:', data.ollama_autoconnect === true);
        ollamaAutoconnect.checked = data.ollama_autoconnect === true;
        console.log('  Toggle checked after set:', ollamaAutoconnect.checked, '(', typeof ollamaAutoconnect.checked, ')');
        
        // Load Ollama settings
        ollamaUrl.value = data.ollama_url || 'http://localhost:11434';
        ollamaModel.value = data.ollama_model || 'llama2';
        ollamaTimeout.value = data.ollama_timeout || 30;
        
        // Show/hide Ollama settings based on AI Search toggle
        const ollamaSettings = document.getElementById('ollama-settings');
        ollamaSettings.style.display = aiSearchToggle.checked ? 'block' : 'none';
        
        // Store original values after loading
        storeOriginalValues();
        
        console.log('Configuration loaded:', data);
      } catch (error) {
        console.error('Error loading configuration:', error);
      }
    }

    async function checkMeiliStatus() {
      try {
        const response = await fetch('/api/meilisearch/status');
        const data = await response.json();
        
        if (data.running) {
          meiliStatusDot.className = 'status-dot running';
          meiliStatusText.textContent = `Running (v${data.version || 'unknown'})`;
          meiliStats.textContent = `${data.document_count || 0} documents indexed • ${formatBytes(data.stats?.database_size || 0)}`;
          meiliStartBtn.disabled = true;
          meiliStopBtn.disabled = false;
        } else {
          meiliStatusDot.className = 'status-dot stopped';
          meiliStatusText.textContent = 'Stopped';
          meiliStats.textContent = 'Search engine is not running';
          meiliStartBtn.disabled = false;
          meiliStopBtn.disabled = true;
        }
      } catch (error) {
        meiliStatusDot.className = 'status-dot stopped';
        meiliStatusText.textContent = 'Error checking status';
        meiliStats.textContent = 'Status check failed';
        console.error('Error checking Meilisearch status:', error);
      }
    }

    meiliStartBtn.addEventListener('click', async () => {
      // Check if already running before attempting start
      if (meiliStatusDot.classList.contains('running')) {
        showToast('Meilisearch is already running', 'info');
        return;
      }
      
      meiliStartBtn.disabled = true;
      meiliStatusText.textContent = 'Starting...';
      
      try {
        const response = await authFetch('/api/meilisearch/start', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          showToast('Meilisearch started successfully', 'success');
          setTimeout(checkMeiliStatus, 1000);
        } else if (data.already_running) {
          showToast('Meilisearch is already running', 'info');
          checkMeiliStatus();
        } else {
          showToast(data.error || 'Failed to start Meilisearch', 'error');
          checkMeiliStatus();
        }
      } catch (error) {
        showToast('Error: ' + error.message, 'error');
        checkMeiliStatus();
      }
    });

    meiliStopBtn.addEventListener('click', async () => {
      if (!confirm('Stop the search engine? Search will be unavailable until restarted.')) {
        return;
      }
      
      meiliStopBtn.disabled = true;
      meiliStatusText.textContent = 'Stopping...';
      
      try {
        const response = await authFetch('/api/meilisearch/stop', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          setTimeout(checkMeiliStatus, 1000);
        } else {
          showToast(data.error || 'Failed to stop Meilisearch', 'error');
          checkMeiliStatus();
        }
      } catch (error) {
        showToast('Error: ' + error.message, 'error');
        checkMeiliStatus();
      }
    });

    meiliSaveBtn.addEventListener('click', async () => {
      try {
        const response = await authFetch('/api/meilisearch/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meilisearch_path: meiliPath.value,
            meilisearch_port: parseInt(meiliPort.value),
            auto_start: meiliAutostart.checked,
            ai_search_enabled: aiSearchToggle.checked,
            ollama_url: ollamaUrl.value,
            ollama_model: ollamaModel.value,
            ollama_timeout: parseInt(ollamaTimeout.value),
            ollama_autoconnect: ollamaAutoconnect.checked
          })
        });
        
        const data = await response.json();
        if (data.success) {
          showToast('Configuration saved! Restart Meilisearch for changes to take effect.', 'success');
          // Reset change indicator after successful save
          storeOriginalValues();
        } else {
          showToast(data.error || 'Failed to save configuration', 'error');
        }
      } catch (error) {
        showToast('Error: ' + error.message, 'error');
      }
    });

    // Ollama button event listeners
    testOllamaBtn.addEventListener('click', testOllamaConnection);
    refreshModelsBtn.addEventListener('click', refreshOllamaModels);

    // AI Search toggle event listener
    aiSearchToggle.addEventListener('change', () => {
      const ollamaSettings = document.getElementById('ollama-settings');
      
      if (aiSearchToggle.checked) {
        ollamaSettings.style.display = 'block';
        showToast('AI Search enabled - Configure Ollama settings below', 'info');
        // Check Ollama status and refresh models when AI Search is enabled
        setTimeout(checkOllamaStatus, 500);
        setTimeout(refreshOllamaModels, 1000);
      } else {
        ollamaSettings.style.display = 'none';
        showToast('AI Search disabled', 'info');
      }
      
      // Check for changes
      checkForChanges();
    });

    // Add change detection event listeners to all form fields
    meiliPath.addEventListener('input', checkForChanges);
    meiliPort.addEventListener('input', checkForChanges);
    meiliAutostart.addEventListener('change', checkForChanges);
    ollamaUrl.addEventListener('input', checkForChanges);
    ollamaModel.addEventListener('input', checkForChanges);
    ollamaModel.addEventListener('change', checkForChanges);
    ollamaTimeout.addEventListener('input', checkForChanges);
    ollamaAutoconnect.addEventListener('change', checkForChanges);

    meiliClearBtn.addEventListener('click', async () => {
      if (!confirm('Clear all indexed documents? This cannot be undone.')) {
        return;
      }
      
      try {
        const response = await authFetch('/api/meilisearch/clear', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          showToast('Index cleared successfully', 'success');
          checkMeiliStatus();
        } else {
          showToast(data.error || 'Failed to clear index', 'error');
        }
      } catch (error) {
        showToast('Error: ' + error.message, 'error');
      }
    });

    // Sync folders functionality
    const syncFoldersBtn = document.getElementById('sync-folders-btn');
    const syncStatus = document.getElementById('sync-status');
    const lastSynced = document.getElementById('last-synced');

    // Function to format time ago
    function formatTimeAgo(timestamp) {
      const now = new Date();
      const syncTime = new Date(timestamp);
      const diffMs = now - syncTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) {
        return 'just now';
      } else if (diffMins < 60) {
        return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else {
        return syncTime.toLocaleDateString();
      }
    }

    // Function to update last synced display
    function updateLastSynced(timestamp) {
      if (timestamp) {
        lastSynced.textContent = `Last synced: ${formatTimeAgo(timestamp)}`;
        lastSynced.className = 'last-synced';
      } else {
        lastSynced.textContent = 'Never synced';
        lastSynced.className = 'last-synced never';
      }
    }

    // Load last synced time from database
    async function loadLastSynced() {
      try {
        const resp = await fetch('/api/settings/last-sync-time');
        const data = await resp.json();
        if (data.last_sync_time) {
          updateLastSynced(data.last_sync_time);
        } else {
          updateLastSynced(null);
        }
      } catch (e) {
        console.error('Failed to load last sync time:', e);
        updateLastSynced(null);
      }
    }

    // Update last synced time every minute
    setInterval(loadLastSynced, 60000);

    // Load initial last synced time
    loadLastSynced();

    syncFoldersBtn.addEventListener('click', async () => {
      try {
        // Disable button and show loading spinner
        syncFoldersBtn.disabled = true;
        syncFoldersBtn.classList.add('loading');
        syncStatus.textContent = 'Syncing...';
        syncStatus.className = 'sync-status loading';
        
        // Show spinner icon, hide sync icon
        const spinnerIcon = syncFoldersBtn.querySelector('.spinner-icon');
        const syncIcon = syncFoldersBtn.querySelector('.sync-icon');
        const syncText = syncFoldersBtn.querySelector('.sync-text');
        
        if (spinnerIcon) spinnerIcon.style.display = 'inline-block';
        if (syncIcon) syncIcon.style.opacity = '0';
        if (syncText) syncText.textContent = 'Syncing...';

        const response = await authFetch('/api/folders/sync', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
          const results = data.results;
          let statusMessage = `Sync complete! `;
          
          if (results.added > 0) {
            statusMessage += `Added ${results.added} new files. `;
          }
          if (results.updated > 0) {
            statusMessage += `Updated ${results.updated} files. `;
          }
          if (results.skipped > 0) {
            statusMessage += `Skipped ${results.skipped} files. `;
          }
          
          if (results.errors.length > 0) {
            statusMessage += `${results.errors.length} errors occurred.`;
            console.error('Sync errors:', results.errors);
          }
          
          syncStatus.textContent = statusMessage;
          syncStatus.className = 'sync-status success';
          
          // Save last sync time
          const now = new Date().toISOString();
          authFetch('/api/settings/last-sync-time', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: now })
          }).catch(e => console.error('Failed to save sync time:', e));
          updateLastSynced(now);
          
          // Show detailed results
          if (results.processed_files.length > 0) {
            console.log('Processed files:', results.processed_files);
          }
          
          // Refresh folders list
          loadIndexedFolders();
        } else {
          syncStatus.textContent = data.error || 'Sync failed';
          syncStatus.className = 'sync-status error';
        }
      } catch (error) {
        syncStatus.textContent = 'Error: ' + error.message;
        syncStatus.className = 'sync-status error';
        console.error('Sync error:', error);
      } finally {
        // Restore button state
        syncFoldersBtn.disabled = false;
        syncFoldersBtn.classList.remove('loading');
        
        // Hide spinner icon, show sync icon
        const spinnerIcon = syncFoldersBtn.querySelector('.spinner-icon');
        const syncIcon = syncFoldersBtn.querySelector('.sync-icon');
        const syncText = syncFoldersBtn.querySelector('.sync-text');
        
        if (spinnerIcon) spinnerIcon.style.display = 'none';
        if (syncIcon) syncIcon.style.opacity = '1';
        if (syncText) syncText.textContent = 'Sync Folders';
        
        // Clear status after 5 seconds
        setTimeout(() => {
          syncStatus.textContent = '';
          syncStatus.className = 'sync-status';
        }, 5000);
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // qBittorrent Integration
    // ═══════════════════════════════════════════════════════════════

    const qbtEnabled = document.getElementById('qbt-enabled');
    const qbtSettings = document.getElementById('qbt-settings');
    const qbtHost = document.getElementById('qbt-host');
    const qbtPort = document.getElementById('qbt-port');
    const qbtUsername = document.getElementById('qbt-username');
    const qbtPassword = document.getElementById('qbt-password');
    const qbtStatusDot = document.getElementById('qbt-status-dot');
    const qbtStatusText = document.getElementById('qbt-status-text');
    const qbtTestBtn = document.getElementById('qbt-test-btn');
    const qbtSyncBtn = document.getElementById('qbt-sync-btn');
    const qbtSaveBtn = document.getElementById('qbt-save-btn');
    const qbtStats = document.getElementById('qbt-stats');
    const qbtDlSpeed = document.getElementById('qbt-dl-speed');
    const qbtUpSpeed = document.getElementById('qbt-up-speed');
    const qbtCounts = document.getElementById('qbt-counts');
    const qbtIndexedItems = document.getElementById('qbt-indexed-items');

    function formatSpeed(bytesPerSec) {
      if (bytesPerSec < 1024) return bytesPerSec + ' B/s';
      if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
      return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    // Toggle qBittorrent settings visibility
    qbtEnabled.addEventListener('change', () => {
      qbtSettings.style.display = qbtEnabled.checked ? 'block' : 'none';
    });

    async function loadQbtConfig() {
      try {
        const resp = await fetch('/api/qbittorrent/config');
        const data = await resp.json();
        qbtEnabled.checked = data.qbt_enabled || false;
        qbtHost.value = data.qbt_host || 'http://localhost';
        qbtPort.value = data.qbt_port || 8080;
        qbtUsername.value = data.qbt_username || 'admin';
        qbtPassword.value = data.qbt_password || '';
        qbtSettings.style.display = qbtEnabled.checked ? 'block' : 'none';

        if (qbtEnabled.checked) {
          checkQbtStatus();
          loadQbtIndexed();
        }
      } catch (e) {
        console.error('Failed to load qBittorrent config:', e);
      }
    }

    async function checkQbtStatus() {
      try {
        qbtStatusDot.className = 'status-dot checking';
        qbtStatusText.textContent = 'Checking...';
        const resp = await fetch('/api/qbittorrent/status');
        const data = await resp.json();

        if (data.connected) {
          qbtStatusDot.className = 'status-dot running';
          qbtStatusText.textContent = `Connected — qBittorrent ${data.version}`;
          qbtStats.style.display = 'block';
          qbtDlSpeed.textContent = formatSpeed(data.dl_speed || 0);
          qbtUpSpeed.textContent = formatSpeed(data.up_speed || 0);
          qbtCounts.textContent = `${data.downloading_count || 0} downloading · ${data.completed_count || 0} completed`;
        } else {
          qbtStatusDot.className = 'status-dot stopped';
          qbtStatusText.textContent = data.error || 'Not connected';
          qbtStats.style.display = 'none';
        }
      } catch (e) {
        qbtStatusDot.className = 'status-dot stopped';
        qbtStatusText.textContent = 'Connection error';
        qbtStats.style.display = 'none';
      }
    }

    // Test connection
    qbtTestBtn.addEventListener('click', async () => {
      qbtTestBtn.disabled = true;
      qbtStatusDot.className = 'status-dot checking';
      qbtStatusText.textContent = 'Testing...';

      try {
        const resp = await pinAuthFetch('/api/qbittorrent/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: qbtHost.value,
            port: parseInt(qbtPort.value),
            username: qbtUsername.value,
            password: qbtPassword.value,
          })
        });
        const data = await resp.json();

        if (data.connected) {
          qbtStatusDot.className = 'status-dot running';
          qbtStatusText.textContent = `Connected — qBittorrent ${data.version}`;
          showToast('qBittorrent connection successful!', 'success');
        } else {
          qbtStatusDot.className = 'status-dot stopped';
          qbtStatusText.textContent = data.error || 'Connection failed';
          showToast('qBittorrent connection failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (e) {
        qbtStatusDot.className = 'status-dot stopped';
        qbtStatusText.textContent = 'Connection error';
        showToast('Could not reach server', 'error');
      } finally {
        qbtTestBtn.disabled = false;
      }
    });

    // Reusable save function — persists current UI state to DB
    async function saveQbtSettings(silent = false) {
      const resp = await pinAuthFetch('/api/qbittorrent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qbt_enabled: qbtEnabled.checked,
          qbt_host: qbtHost.value,
          qbt_port: parseInt(qbtPort.value),
          qbt_username: qbtUsername.value,
          qbt_password: qbtPassword.value,
        })
      });
      const data = await resp.json();
      if (!data.success) {
        if (!silent) showToast(data.error || 'Failed to save settings', 'error');
        return false;
      }
      if (!silent) {
        showToast('qBittorrent settings saved', 'success');
        if (qbtEnabled.checked) checkQbtStatus();
      }
      return true;
    }

    // Save qBittorrent settings
    qbtSaveBtn.addEventListener('click', async () => {
      qbtSaveBtn.disabled = true;
      try {
        await saveQbtSettings();
      } catch (e) {
        showToast('Error saving settings', 'error');
      } finally {
        qbtSaveBtn.disabled = false;
      }
    });

    // Sync downloads
    qbtSyncBtn.addEventListener('click', async () => {
      qbtSyncBtn.disabled = true;
      qbtSyncBtn.classList.add('loading');
      const spinnerIcon = qbtSyncBtn.querySelector('.spinner-icon');
      const syncIcon = qbtSyncBtn.querySelector('.sync-icon');
      const syncText = qbtSyncBtn.querySelector('.sync-text');
      if (spinnerIcon) spinnerIcon.style.display = 'inline-block';
      if (syncIcon) syncIcon.style.opacity = '0';
      if (syncText) syncText.textContent = 'Syncing...';

      try {
        // Auto-save current settings to DB before syncing
        const saved = await saveQbtSettings(true);
        if (!saved) {
          showToast('Failed to save settings before sync', 'error');
          return;
        }
        const resp = await pinAuthFetch('/api/qbittorrent/sync', { method: 'POST' });
        const data = await resp.json();

        if (data.success) {
          const r = data.results;
          let msg = `Synced ${r.torrents_processed} torrent(s): ${r.files_indexed} files indexed`;
          if (r.files_skipped > 0) msg += `, ${r.files_skipped} skipped`;
          if (r.files_failed > 0) msg += `, ${r.files_failed} failed`;
          showToast(msg, r.files_failed > 0 ? 'warning' : 'success');
          loadQbtIndexed();
        } else {
          showToast(data.error || 'Sync failed', 'error');
        }
      } catch (e) {
        showToast('Sync error: ' + e.message, 'error');
      } finally {
        qbtSyncBtn.disabled = false;
        qbtSyncBtn.classList.remove('loading');
        if (spinnerIcon) spinnerIcon.style.display = 'none';
        if (syncIcon) syncIcon.style.opacity = '1';
        if (syncText) syncText.textContent = 'Sync Downloads';
      }
    });

    async function loadQbtIndexed() {
      try {
        const resp = await fetch('/api/qbittorrent/indexed');
        const data = await resp.json();
        const torrents = data.torrents || [];

        if (torrents.length === 0) {
          qbtIndexedItems.innerHTML = '<p class="no-items">No torrents indexed yet. Click "Sync Downloads" to index completed torrents.</p>';
          return;
        }

        qbtIndexedItems.innerHTML = torrents.map(t => {
          const date = t.indexed_at ? new Date(t.indexed_at).toLocaleDateString() : '';
          return `
            <div class="qbt-indexed-item">
              <div class="qbt-indexed-info">
                <span class="qbt-indexed-name" title="${t.name}">${t.name}</span>
                <span class="qbt-indexed-meta">${t.files_indexed} file(s) · ${date}</span>
              </div>
              <button class="btn btn-danger btn-small" onclick="removeQbtTorrent('${t.hash}')">Remove</button>
            </div>
          `;
        }).join('');
      } catch (e) {
        console.error('Failed to load indexed torrents:', e);
      }
    }

    window.removeQbtTorrent = async function(hash) {
      if (!confirm('Remove this torrent and its indexed documents?')) return;
      try {
        const resp = await pinAuthFetch('/api/qbittorrent/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash })
        });
        const data = await resp.json();
        if (data.success) {
          showToast(`Removed "${data.torrent_name}" (${data.documents_removed} documents)`, 'success');
          loadQbtIndexed();
        } else {
          showToast(data.error || 'Failed to remove', 'error');
        }
      } catch (e) {
        showToast('Error removing torrent', 'error');
      }
    };

    // Initialize
    checkVaultStatus();
    loadIndexedFolders();
    checkMeiliStatus();
    loadQbtConfig();
    
    // Reset AI Search toggle to unchecked state before loading config
    aiSearchToggle.checked = false;
    
    // Load config first, then check Ollama status after config is loaded
    loadMeiliConfig().then(() => {
      console.log('Config loaded. AI Search toggle:', aiSearchToggle.checked);
      
      // Check Ollama status after config is loaded
      setTimeout(() => checkOllamaStatus(false), 500);
      
      // Check models and auto-connect if AI Search is enabled
      if (aiSearchToggle.checked) {
        setTimeout(refreshOllamaModels, 1000);
        if (ollamaAutoconnect.checked) {
          setTimeout(() => {
            console.log('Auto-connecting to Ollama...');
            checkOllamaStatus(false);
          }, 1500);
        }
      }
    });

    // Search History Settings Management
    document.addEventListener('DOMContentLoaded', function() {
      const enhancementToggle = document.getElementById('ai-history-enhancement');
      const clearButton = document.getElementById('clear-search-history');
      const historyList = document.getElementById('recent-searches-list');

      // Load saved AI enhancement preference from database
      fetch('/api/settings/ai-enhancement')
        .then(r => r.json())
        .then(data => { enhancementToggle.checked = data.enabled; })
        .catch(() => { enhancementToggle.checked = true; });

      // Save preference on change
      enhancementToggle.addEventListener('change', (e) => {
        authFetch('/api/settings/ai-enhancement', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: e.target.checked })
        }).catch(err => console.error('Failed to save AI enhancement pref:', err));
        console.log('AI History Enhancement:', e.target.checked ? 'enabled' : 'disabled');
      });

      // Clear history
      clearButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your search history?')) {
          authFetch('/api/settings/search-history', { method: 'DELETE' })
            .then(() => updateHistoryDisplay())
            .catch(err => console.error('Failed to clear history:', err));
          showToast('Search history cleared', 'success');
        }
      });

      // Display recent searches
      updateHistoryDisplay();

      async function updateHistoryDisplay() {
        try {
          const resp = await fetch('/api/settings/search-history');
          const data = await resp.json();
          const history = data.history || [];

          if (history.length === 0) {
            historyList.innerHTML = '<div class="search-history-empty">No recent searches</div>';
          } else {
            historyList.innerHTML = history.map(query => {
              const escaped = query.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,"\\'");
              return `<div class="search-history-item" onclick="searchFromHistory('${escaped}')">${query.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
            }).join('');
          }
        } catch (e) {
          console.error('Failed to load search history:', e);
          historyList.innerHTML = '<div class="search-history-empty">Failed to load history</div>';
        }
      }

      // Make function global for onclick
      window.searchFromHistory = function(query) {
        // Redirect to main page with search
        window.location.href = `/?q=${encodeURIComponent(query)}`;
      };

      // Update display when returning to settings
      window.addEventListener('focus', updateHistoryDisplay);
    });

    // ── Factory Reset ──────────────────────────────────────────────────────
    (function() {
      const resetBtn = document.getElementById('factory-reset-btn');
      const modal = document.getElementById('factory-reset-modal');
      const cancelBtn = document.getElementById('factory-reset-cancel');
      const confirmBtn = document.getElementById('factory-reset-confirm');
      const confirmInput = document.getElementById('factory-reset-confirm-input');

      if (!resetBtn || !modal) return;

      resetBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        confirmInput.value = '';
        confirmBtn.disabled = true;
        confirmInput.focus();
      });

      cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        confirmInput.value = '';
        confirmBtn.disabled = true;
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
          confirmInput.value = '';
          confirmBtn.disabled = true;
        }
      });

      confirmInput.addEventListener('input', () => {
        confirmBtn.disabled = confirmInput.value.trim() !== 'RESET';
      });

      confirmBtn.addEventListener('click', async () => {
        if (confirmInput.value.trim() !== 'RESET') return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Resetting...';
        cancelBtn.disabled = true;
        confirmInput.disabled = true;

        try {
          const resp = await pinAuthFetch('/api/settings/factory-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await resp.json();

          if (data.success) {
            // Clear any cached PIN
            sessionStorage.removeItem('vaultPin');
            // Show success briefly then redirect to home
            modal.querySelector('.factory-reset-modal').innerHTML = `
              <div class="factory-reset-modal-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <h3 style="color:#3fb950;">Reset Complete</h3>
              <p>SearchBox has been restored to its default state. Redirecting...</p>
            `;
            setTimeout(() => { window.location.href = '/'; }, 2000);
          } else {
            showToast('Reset completed with errors: ' + (data.errors || []).join(', '), 'warning');
            modal.style.display = 'none';
          }
        } catch (e) {
          console.error('Factory reset failed:', e);
          showToast('Factory reset failed: ' + e.message, 'error');
          modal.style.display = 'none';
        }
      });
    })();

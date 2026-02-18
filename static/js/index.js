/* SearchBox — Main search page logic */

// Meilisearch client (config injected from backend via template)
    const meiliClient = new MeiliSearch({
      host: MEILI_HOST,
      apiKey: MEILI_API_KEY
    });
    const documentsIndex = meiliClient.index('documents');

    // DOM Elements
    const mainContainer = document.getElementById('main-container');
    const mainLogo = document.getElementById('main-logo');
    const mainSearchWrapper = document.getElementById('main-search-wrapper');
    const mainSearch = document.getElementById('main-search');
    const mainClear = document.getElementById('main-clear');
    const header = document.getElementById('header');
    const headerSearch = document.getElementById('header-search');
    const headerClear = document.getElementById('header-clear');
    const resultsContainer = document.getElementById('results-container');
    const resultsStats = document.getElementById('results-stats');
    const resultsList = document.getElementById('results-list');
    const searchBtn = document.getElementById('search-btn');
    const footer = document.getElementById('footer');

    // Notification elements
    const notificationBtn = document.getElementById('notification-btn');
    const notificationBadge = document.getElementById('notification-badge');
    const notificationModal = document.getElementById('notification-modal');
    const notificationModalClose = document.getElementById('notification-modal-close');
    const notificationList = document.getElementById('notification-list');
    const notificationEmpty = document.getElementById('notification-empty');
    const clearNotificationsBtn = document.getElementById('clear-notifications-btn');
    const toastContainer = document.getElementById('toast-container');

    // Notification System
    let notifications = JSON.parse(localStorage.getItem('searchbox_notifications') || '[]');

    function saveNotifications() {
      localStorage.setItem('searchbox_notifications', JSON.stringify(notifications));
    }

    function updateNotificationBadge() {
      const unreadCount = notifications.filter(n => !n.read).length;
      const fabBadge = document.getElementById('fab-notification-badge');
      
      if (unreadCount > 0) {
        const badgeText = unreadCount > 9 ? '9+' : unreadCount;
        notificationBadge.textContent = badgeText;
        notificationBadge.style.display = 'flex';
        if (fabBadge) {
          fabBadge.textContent = badgeText;
          fabBadge.style.display = 'flex';
        }
      } else {
        notificationBadge.style.display = 'none';
        if (fabBadge) fabBadge.style.display = 'none';
      }
    }

    function getNotificationIcon(type) {
      const icons = {
        info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      };
      return icons[type] || icons.info;
    }

    function formatTimeAgo(timestamp) {
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      if (seconds < 60) return 'Just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    }

    function showToast(type, title, message, duration = 5000) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `
        <div class="toast-icon ${type}">${getNotificationIcon(type)}</div>
        <div class="toast-content">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
      toastContainer.appendChild(toast);

      if (duration > 0) {
        setTimeout(() => dismissToast(toast), duration);
      }

      return toast;
    }

    function dismissToast(toast) {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }

    // Vault PIN Modal for search results
    const vaultPinModal = document.getElementById('vault-pin-modal');
    const vaultPinModalClose = document.getElementById('vault-pin-modal-close');
    const vaultPinInputs = document.querySelectorAll('#vault-pin-inputs .vault-pin-box');
    const vaultPinError = document.getElementById('vault-pin-error');
    // Button removed - auto-submit handles PIN entry
    let pendingVaultDocId = null;
    let pendingVaultSearchQuery = '';
    let pendingVaultSearchPage = '1';

    function openVaultResult(docId, searchQuery = '', searchPage = '1') {
      pendingVaultDocId = docId;
      pendingVaultSearchQuery = searchQuery;
      pendingVaultSearchPage = searchPage;
      vaultPinError.textContent = '';
      vaultPinInputs.forEach(input => input.value = '');
      vaultPinModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      setTimeout(() => vaultPinInputs[0].focus(), 100);
    }

    function closeVaultPinModal() {
      vaultPinModal.style.display = 'none';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      pendingVaultDocId = null;
    }

    vaultPinModalClose.addEventListener('click', closeVaultPinModal);
    vaultPinModal.addEventListener('click', (e) => {
      if (e.target === vaultPinModal) closeVaultPinModal();
    });

    // PIN input navigation for vault modal
    let isVerifying = false;
    
    vaultPinInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        if (value && index < vaultPinInputs.length - 1) {
          vaultPinInputs[index + 1].focus();
        }
        // Auto-submit when all 4 digits entered (with slight delay to ensure value is set)
        if (index === 3 && value) {
          setTimeout(() => verifySearchVaultPin(), 50);
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          vaultPinInputs[index - 1].focus();
        }
        if (e.key === 'Enter') {
          verifySearchVaultPin();
        }
      });
    });

    async function verifySearchVaultPin() {
      if (isVerifying) return;
      
      const pin = Array.from(vaultPinInputs).map(i => i.value).join('');
      if (pin.length !== 4) {
        vaultPinError.textContent = 'Please enter all 4 digits';
        return;
      }

      isVerifying = true;

      try {
        const response = await authFetch('/api/vault/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await response.json();

        if (response.ok && data.success) {
          // Cache verified PIN for this session (uploads, file serving)
          sessionStorage.setItem('vaultPin', pin);
          
          const docId = pendingVaultDocId;
          const searchQuery = pendingVaultSearchQuery;
          const searchPage = pendingVaultSearchPage;
          closeVaultPinModal();
          
          // Build URL with search context
          let viewUrl = `/view/${docId}`;
          if (searchQuery) {
            viewUrl += `?q=${encodeURIComponent(searchQuery)}&page=${searchPage}`;
          }
          window.location.href = viewUrl;
        } else {
          vaultPinError.textContent = data.error || 'Invalid PIN. Please try again.';
          vaultPinInputs.forEach(input => input.value = '');
          vaultPinInputs[0].focus();
        }
      } catch (error) {
        vaultPinError.textContent = 'Error verifying PIN';
      } finally {
        isVerifying = false;
      }
    }

    function addNotification(type, title, message, showToastNow = true) {
      const notification = {
        id: Date.now().toString(),
        type,
        title,
        message,
        timestamp: Date.now(),
        read: false
      };

      notifications.unshift(notification);
      if (notifications.length > 50) notifications = notifications.slice(0, 50);
      saveNotifications();
      updateNotificationBadge();
      renderNotifications();

      if (showToastNow) {
        showToast(type, title, message);
      }

      return notification;
    }

    function renderNotifications() {
      const emptyHTML = `
        <div class="notification-empty" id="notification-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <p>No notifications</p>
        </div>
      `;

      if (notifications.length === 0) {
        notificationList.innerHTML = emptyHTML;
        return;
      }

      const items = notifications.map(n => `
        <div class="notification-item" data-id="${n.id}">
          <div class="notification-item-icon ${n.type}">${getNotificationIcon(n.type)}</div>
          <div class="notification-item-content">
            <div class="notification-item-title">${n.title}</div>
            <div class="notification-item-message">${n.message}</div>
            <div class="notification-item-time">${formatTimeAgo(n.timestamp)}</div>
          </div>
        </div>
      `).join('');

      notificationList.innerHTML = items;
    }

    function openNotificationModal() {
      notifications.forEach(n => n.read = true);
      saveNotifications();
      updateNotificationBadge();
      renderNotifications();
      notificationModal.classList.add('visible');
    }

    function closeNotificationModal() {
      notificationModal.classList.remove('visible');
    }

    // Help Modal
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const helpModalClose = document.getElementById('help-modal-close');

    function openHelpModal() {
      helpModal.classList.add('visible');
    }

    function closeHelpModal() {
      helpModal.classList.remove('visible');
    }

    const notificationFab = document.getElementById('notification-fab');
    const fabNotificationBadge = document.getElementById('fab-notification-badge');

    // Notification button event listeners (with null checks)
    if (notificationBtn) notificationBtn.addEventListener('click', openNotificationModal);
    
    if (notificationFab) notificationFab.addEventListener('click', openNotificationModal);
    if (notificationModalClose) notificationModalClose.addEventListener('click', closeNotificationModal);
    if (notificationModal) {
      notificationModal.addEventListener('click', (e) => {
        if (e.target === notificationModal) closeNotificationModal();
      });
    }

    // Help button event listeners (with null checks)
    if (helpBtn) helpBtn.addEventListener('click', openHelpModal);
    if (helpModalClose) helpModalClose.addEventListener('click', closeHelpModal);
    if (helpModal) {
      helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) closeHelpModal();
      });
    }

    if (clearNotificationsBtn) {
      clearNotificationsBtn.addEventListener('click', () => {
        if (notifications.length === 0) {
          showToast('info', 'No Notifications', 'No notifications to clear');
          return;
        }
        const count = notifications.length;
        notifications = [];
        saveNotifications();
        updateNotificationBadge();
        renderNotifications();
        showToast('success', 'Cleared', `${count} notification${count > 1 ? 's' : ''} cleared`);
      });
    }

    // Initialize notifications
    updateNotificationBadge();
    renderNotifications();

    // Check system status on load and notify about issues
    async function checkSystemStatus() {
      // Check Meilisearch connection via Flask API (works in Docker and locally)
      try {
        const resp = await fetch('/api/meilisearch/status');
        const data = await resp.json();
        if (!data.running) {
          addNotification('error', 'Search Engine Offline', 
            'Cannot connect to Meilisearch. Go to Settings to start the search engine or check configuration.');
        }
      } catch (error) {
        addNotification('error', 'Search Engine Offline', 
          'Cannot connect to Meilisearch. Go to Settings to start the search engine or check configuration.');
      }
    }

    checkSystemStatus();

    let currentQuery = '';

    // Switch to results view
    function showResultsView() {
      // Remove any no results messages
      const existingNoResults = document.querySelector('.no-results-home');
      if (existingNoResults) {
        existingNoResults.remove();
      }
      
      // Hide search recommendations when showing results
      hideRecommendations();
      
      mainLogo.style.display = 'none';
      mainSearchWrapper.style.display = 'none';
      mainContainer.classList.add('has-results');
      header.classList.add('visible');
      resultsContainer.classList.add('visible');
      // footer.style.position = 'fixed'; // Removed - let footer flow naturally
    }

    // Switch to home view
    function showHomeView() {
      console.log('DEBUG: showHomeView called');
      // Remove any no results messages
      const existingNoResults = document.querySelector('.no-results-home');
      if (existingNoResults) {
        existingNoResults.remove();
        console.log('DEBUG: Removed existing no results message');
      }
      
      mainLogo.style.display = 'block';
      mainSearchWrapper.style.display = 'block';
      mainContainer.classList.remove('has-results');
      header.classList.remove('visible');
      resultsContainer.classList.remove('visible');
      // footer.style.position = 'fixed'; // Removed - let footer flow naturally
      mainSearch.focus();
      
      // Check for recommendations when returning to home view
      setTimeout(() => {
        checkOllamaAndFetchRecommendations();
      }, 500);
      
      console.log('DEBUG: showHomeView completed');
    }

    // Update clear button visibility
    function updateClearButton(input, clearBtn) {
      clearBtn.classList.toggle('visible', input.value.length > 0);
    }

    // Pagination state
    const RESULTS_PER_PAGE = 10;
    let currentPage = 1;
    let totalResults = 0;

    // Source filter keywords that map to Meilisearch source= filters
    const SOURCE_FILTERS = {
      'torrent': 'qbittorrent',
      'vault': 'vault',
      'zim': 'zim',
      'zip': 'zip',
    };

    function parseSearchQuery(query){
      // Check for image search command first (before all other parsing)
      if (query.includes('::image')) {
        const searchText = query.replace('::image', '').trim();
        return {
          isImageSearch: true,
          searchText: searchText,
          isAdvanced: false,
          fileFilter: null,
          sourceFilter: null
        };
      }
      
      // Check if this is an advanced query with operators or multiple file types
      const hasOperators = query.includes('::&&') || query.includes('::||') || query.includes('::!');
      const fileParts = query.split('::');
      const hasMultipleFileTypes = fileParts.length > 2; // More than "query::type"
      
      if (hasOperators || hasMultipleFileTypes) {
        return parseAdvancedQuery(query);
      }
      
      // Legacy simple query support (existing logic)
      const parts = query.split('::');
      const filterToken = parts[1] ? parts[1].trim().toLowerCase() : null;
      
      // Check if the filter is a source filter (torrent, vault) or a file type
      if (filterToken && SOURCE_FILTERS[filterToken] !== undefined) {
        return {
          searchText: parts[0].trim(),
          fileFilter: null,
          sourceFilter: filterToken,
          isAdvanced: false
        };
      }
      
      return {
        searchText: parts[0].trim(),
        fileFilter: filterToken,
        sourceFilter: null,
        isAdvanced: false
      };
    }

    function parseAdvancedQuery(query){
      // Tokenize the query by operators and file types
      const tokens = query.split(/(::&&|::\|\||::!|::[a-zA-Z0-9]+)/);
      const segments = [];
      let currentSegment = { terms: '', types: [], operator: null };
      
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].trim();
        
        if (!token) continue;
        
        if (token === '::&&' || token === '::||' || token === '::!') {
          // Save current segment
          if (currentSegment.terms || currentSegment.types.length > 0) {
            segments.push({...currentSegment});
          }
          
          // Start new segment with operator
          currentSegment = {
            terms: '',
            types: [],
            operator: token.replace('::', '')
          };
        } else if (token.startsWith('::') && !token.startsWith('::&&') && !token.startsWith('::||') && !token.startsWith('::!')) {
          // File type token
          const fileType = token.substring(2).toLowerCase();
          if (fileType && !currentSegment.types.includes(fileType)) {
            currentSegment.types.push(fileType);
          }
        } else {
          // Search terms
          if (currentSegment.terms) {
            currentSegment.terms += ' ' + token;
          } else {
            currentSegment.terms = token;
          }
        }
      }
      
      // Add the last segment
      if (currentSegment.terms || currentSegment.types.length > 0) {
        segments.push(currentSegment);
      }
      
      return {
        segments: segments,
        isAdvanced: true
      };
    }

    function buildAdvancedSearch(segments) {
      let allTerms = [];
      let includeFilters = [];
      let excludeFilters = [];
      
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        
        // Collect all search terms
        if (segment.terms) {
          allTerms.push(segment.terms);
        }
        
        // Build filter for this segment (file types and source filters)
        if (segment.types.length > 0) {
          const typeFilters = segment.types.map(type => {
            // Check if this is a source filter (torrent, vault)
            if (SOURCE_FILTERS[type] !== undefined) {
              return `source = "${SOURCE_FILTERS[type]}"`;
            }
            // Add dot prefix if not present (for consistency with backend storage)
            const fileType = type.startsWith('.') ? type : `.${type}`;
            return `file_type = "${fileType}"`;
          });
          let segmentFilter;
          
          if (typeFilters.length === 1) {
            segmentFilter = typeFilters[0];
          } else {
            segmentFilter = `(${typeFilters.join(' OR ')})`;
          }
          
          // Handle NOT operator
          if (segment.operator === '!') {
            excludeFilters.push(segmentFilter);
          } else {
            includeFilters.push(segmentFilter);
          }
        }
      }
      
      // Build final filter string
      let finalFilter = '';
      
      // Combine include filters with OR (any of these types)
      if (includeFilters.length > 0) {
        if (includeFilters.length === 1) {
          finalFilter = includeFilters[0];
        } else {
          finalFilter = `(${includeFilters.join(' OR ')})`;
        }
      }
      
      // Add exclude filters with AND
      if (excludeFilters.length > 0) {
        if (finalFilter) {
          finalFilter += ` AND NOT (${excludeFilters.join(' OR ')})`;
        } else {
          finalFilter = `NOT (${excludeFilters.join(' OR ')})`;
        }
      }
      
      // Build search query (all terms for relevance)
      const finalQuery = allTerms.join(' ');
      
      return {
        query: finalQuery,
        filter: finalFilter
      };
    }

    // Perform search with Meilisearch
    async function performSearch(query, page = 1) {

      if (!query.trim()) {
        showToast('info', 'Empty Search', 'Please enter a search query');
        return;
      }

      const parsedQuery = parseSearchQuery(query);
      
      // Handle image search command (NEW - inserted after existing validation)
      if (parsedQuery.isImageSearch) {
        if (!parsedQuery.searchText) {
          showToast('info', 'Empty Search', 'Please enter a search query before ::image');
          return;
        }
        // Direct redirect to image search page
        const imageUrl = `/images?q=${encodeURIComponent(parsedQuery.searchText)}&source=direct`;
        window.location.href = imageUrl;
        return;
      }
      
      // Validate query has content (existing logic - unchanged)
      if (!parsedQuery.isAdvanced && !parsedQuery.searchText && !parsedQuery.fileFilter && !parsedQuery.sourceFilter){
        showToast('info', 'Empty Search', 'Please enter a search query');
        return;
      }
      
      if (parsedQuery.isAdvanced && parsedQuery.segments.length === 0){
        showToast('info', 'Empty Search', 'Please enter a search query');
        return;
      }

      currentQuery = query;
      currentPage = page;
      headerSearch.value = query;
      showResultsView();
      
      // Update URL to reflect current search and page
      const newUrl = `/?q=${encodeURIComponent(query)}&page=${page}`;
      window.history.pushState({ query: query, page: page }, '', newUrl);

      const offset = (page - 1) * RESULTS_PER_PAGE;

      try {
        
        const searchOptions = {
          limit: RESULTS_PER_PAGE,
          offset: offset,
          attributesToHighlight: ['filename', 'content'],
          highlightPreTag: '<em>',
          highlightPostTag: '</em>'
        };

        let searchQuery = '';
        let searchFilter = '';

        if (parsedQuery.isAdvanced) {
          // Handle advanced query with compound operators
          const result = buildAdvancedSearch(parsedQuery.segments);
          searchQuery = result.query;
          searchFilter = result.filter;
          
          // Debug logging
          console.log('Advanced Query Debug:');
          console.log('Segments:', parsedQuery.segments);
          console.log('Search Query:', searchQuery);
          console.log('Search Filter:', searchFilter);
        } else {
          // Check for source filter (::torrent, ::vault)
          if (parsedQuery.sourceFilter) {
            const sourceValue = SOURCE_FILTERS[parsedQuery.sourceFilter];
            searchFilter = `source = "${sourceValue}"`;
          }
          // Check for file type filter
          else if (parsedQuery.fileFilter){
            // Add dot prefix if not present (for consistency with backend storage)
            const fileType = parsedQuery.fileFilter.startsWith('.') ? parsedQuery.fileFilter : `.${parsedQuery.fileFilter}`;
            searchFilter = `file_type = "${fileType}"`;
          }
          searchQuery = parsedQuery.searchText === "*" ? "" : parsedQuery.searchText;
          
          // Debug logging
          console.log('Legacy Query Debug:');
          console.log('Search Query:', searchQuery);
          console.log('Search Filter:', searchFilter);
        }

        if (searchFilter) {
          searchOptions.filter = searchFilter;
        }

        console.log('Final search options:', searchOptions);
        const searchResults = await documentsIndex.search(searchQuery, searchOptions);
        
        console.log('DEBUG: Search results received:', { 
          hits: searchResults.hits.length, 
          estimatedTotalHits: searchResults.estimatedTotalHits,
          processingTimeMs: searchResults.processingTimeMs 
        });

        totalResults = searchResults.estimatedTotalHits || 0;

        const results = searchResults.hits.map(hit => ({
          id: hit.id,
          filename: hit._formatted?.filename || hit.filename,
          content: hit._formatted?.content || hit.content || 'No content available',
          fileType: hit.file_type,
          fileSize: hit.file_size,
          uploadedAt: hit.uploaded_at,
          source: hit.source || 'vault',
          has_images: hit.has_images,
          image_count: hit.image_count,
          first_image: hit.first_image,
          all_images: hit.all_images
        }));

        renderResults(results, query, totalResults, searchResults.processingTimeMs, page);
      } catch (error) {
        console.error('Search error:', error);
        renderResults([], query, 0, 0, 1);
      }
    }

    // Render search results
    function renderResults(results, query, totalHits = 0, processingTime = 0, page = 1) {
      console.log('DEBUG: renderResults called with:', { resultsLength: results.length, query, totalHits, processingTime, page });
      const totalPages = Math.ceil(totalHits / RESULTS_PER_PAGE);
      const startResult = (page - 1) * RESULTS_PER_PAGE + 1;
      const endResult = Math.min(page * RESULTS_PER_PAGE, totalHits);
      
      resultsStats.textContent = totalHits > 0 
        ? `Page ${page} of ${totalPages} (${totalHits.toLocaleString()} results in ${processingTime}ms)`
        : `About ${totalHits.toLocaleString()} results (${processingTime}ms)`;

      console.log('DEBUG: Checking results.length === 0:', results.length === 0);
      if (results.length === 0) {
        resultsList.innerHTML = `
          <div class="no-results">
            <h3>No results found for "${query}"</h3>
            <p>Try different keywords or upload more documents</p>
          </div>
        `;
        return;
      }

      // Add to search history after successful search
      if (results.length > 0 && query && query.trim()) {
        console.log('Adding to search history:', query);
        addToSearchHistory(query);
        console.log('Updated history:', getSearchHistory());
      } else {
        console.log('Not adding to history - results:', results.length, 'query:', query);
      }

      
      resultsList.innerHTML = results.map(result => {
        const typeConfig = getFileTypeConfig(result.filename);
        // Escape HTML content to prevent rendering issues
        const escapeHtml = (text) => {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        };
        const snippet = result.content.length > 300 ? escapeHtml(result.content.substring(0, 300)) + '...' : escapeHtml(result.content);
        const isVault = result.source === 'vault';
        const isQBT = result.source === 'qbittorrent';
        const isZim = result.source === 'zim';
        const isZip = result.source === 'zip';
        const sourceIcon = isVault 
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
          : isQBT
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f0883e" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`
          : isZim
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`
          : isZip
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        const sourceLabel = isVault ? 'Vault' : isQBT ? 'qBittorrent' : isZim ? 'ZIM Archive' : isZip ? 'ZIP Archive' : 'Folder';
        const lockBadge = isVault ? `<span class="vault-lock-badge" title="PIN required to view">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </span>` : '';
        
        // Check if this is an image file
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
        const isImage = imageExtensions.includes(result.fileType.toLowerCase());
        
        // For vault docs, use onclick to require PIN; for folder docs, direct link
        if (isVault) {
          if (isImage) {
            return `
              <div class="result-item vault-result image-result" data-id="${result.id}" onclick="openVaultResult('${result.id}', '${encodeURIComponent(query)}', ${page})">
                <div class="result-source">
                  <div class="result-icon">
                    <span class="file-type-badge" style="color: ${typeConfig.color}; background: ${typeConfig.bg};">${typeConfig.label}</span>
                  </div>
                  <div class="result-url">
                    <span class="source-indicator">${sourceIcon}</span>
                    <span class="domain">${sourceLabel}</span>
                    <span class="path"> › ${result.fileType.toUpperCase()} › ${formatFileSize(result.fileSize)}</span>
                  </div>
                </div>
                <div class="image-thumbnail-container">
                  <img src="/api/thumbnail/${result.id}" alt="${result.filename}" class="image-thumbnail" loading="lazy" 
                       onload="console.log('Vault image loaded: ${result.id}')" 
                       onerror="console.error('Vault image failed: ${result.id}'); this.style.display='none'; this.nextElementSibling.style.display='block';">
                  <div class="image-error-placeholder" style="display: none; width: 120px; height: 120px; background: #30363d; border: 1px solid #484f58; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #8b949e; font-size: 12px; text-align: center;">
                    ⚠️ Image<br>Load Error
                  </div>
                  <div class="image-info">
                    <div class="result-title">${result.filename} ${lockBadge}</div>
                    <div class="image-meta">Image • ${result.fileType.toUpperCase()} • ${formatFileSize(result.fileSize)}</div>
                  </div>
                </div>
              </div>
            `;
          } else {
            // Check if document has images
            const hasImages = result.has_images || false;
            const firstImage = result.first_image || null;
            const imageCount = result.image_count || 0;
            const imageBadge = hasImages ? `<span class="image-count-badge" title="Contains ${imageCount} images">🖼️ ${imageCount}</span>` : '';
            
            if (hasImages && firstImage) {
              // Document with images - show thumbnail
              return `
                <div class="result-item vault-result document-with-images" data-id="${result.id}" onclick="openVaultResult('${result.id}', '${encodeURIComponent(query)}', ${page})">
                  <div class="result-source">
                    <div class="result-icon">
                      <span class="file-type-badge" style="color: ${typeConfig.color}; background: ${typeConfig.bg};">${typeConfig.label}</span>
                    </div>
                    <div class="result-url">
                      <span class="source-indicator">${sourceIcon}</span>
                      <span class="domain">${sourceLabel}</span>
                      <span class="path"> › ${result.fileType.toUpperCase()} › ${formatFileSize(result.fileSize)}</span>
                    </div>
                  </div>
                  <div class="document-thumbnail-container">
                    <img src="${firstImage}" alt="${result.filename}" class="document-thumbnail" loading="lazy">
                    <div class="document-info">
                      <div class="result-title">${result.filename} ${lockBadge} ${imageBadge}</div>
                      <p class="result-snippet">${snippet}</p>
                    </div>
                  </div>
                </div>
              `;
            } else {
              // Regular document without images
              return `
                <div class="result-item vault-result" data-id="${result.id}" onclick="openVaultResult('${result.id}', '${encodeURIComponent(query)}', ${page})">
                  <div class="result-source">
                    <div class="result-icon">
                      <span class="file-type-badge" style="color: ${typeConfig.color}; background: ${typeConfig.bg};">${typeConfig.label}</span>
                    </div>
                    <div class="result-url">
                      <span class="source-indicator">${sourceIcon}</span>
                      <span class="domain">${sourceLabel}</span>
                      <span class="path"> › ${result.fileType.toUpperCase()} › ${formatFileSize(result.fileSize)}</span>
                    </div>
                  </div>
                  <div class="result-title">${result.filename} ${lockBadge} ${imageBadge}</div>
                  <p class="result-snippet">${snippet}</p>
                </div>
              `;
            }
          }
        } else {
          if (isImage) {
            return `
              <a href="/view/${result.id}?q=${encodeURIComponent(query)}&page=${page}" class="result-item image-result">
                <div class="result-source">
                  <div class="result-icon">
                    <span class="file-type-badge" style="color: ${typeConfig.color}; background: ${typeConfig.bg};">${typeConfig.label}</span>
                  </div>
                  <div class="result-url">
                    <span class="source-indicator">${sourceIcon}</span>
                    <span class="domain">${sourceLabel}</span>
                    <span class="path"> › ${result.fileType.toUpperCase()} › ${formatFileSize(result.fileSize)}</span>
                  </div>
                </div>
                <div class="image-thumbnail-container">
                  <img src="/api/thumbnail/${result.id}" alt="${result.filename}" class="image-thumbnail" loading="lazy" 
                       onload="console.log('Folder image loaded: ${result.id}')" 
                       onerror="console.error('Folder image failed: ${result.id}'); this.style.display='none'; this.nextElementSibling.style.display='block';">
                  <div class="image-error-placeholder" style="display: none; width: 120px; height: 120px; background: #30363d; border: 1px solid #484f58; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #8b949e; font-size: 12px; text-align: center;">
                    ⚠️ Image<br>Load Error
                  </div>
                  <div class="image-info">
                    <div class="result-title">${result.filename}</div>
                    <div class="image-meta">Image • ${result.fileType.toUpperCase()} • ${formatFileSize(result.fileSize)}</div>
                  </div>
                </div>
              </a>
            `;
          } else {
            // Check if document has images
            const hasImages = result.has_images || false;
            const firstImage = result.first_image || null;
            const imageCount = result.image_count || 0;
            const imageBadge = hasImages ? `<span class="image-count-badge" title="Contains ${imageCount} images">🖼️ ${imageCount}</span>` : '';
            
            if (hasImages && firstImage) {
              // Document with images - show thumbnail
              return `
                <a href="/view/${result.id}?q=${encodeURIComponent(query)}&page=${page}" class="result-item document-with-images">
                  <div class="result-source">
                    <div class="result-icon">
                      <span class="file-type-badge" style="color: ${typeConfig.color}; background: ${typeConfig.bg};">${typeConfig.label}</span>
                    </div>
                    <div class="result-url">
                      <span class="source-indicator">${sourceIcon}</span>
                      <span class="domain">${sourceLabel}</span>
                      <span class="path"> › ${result.fileType.toUpperCase()} › ${formatFileSize(result.fileSize)}</span>
                    </div>
                  </div>
                  <div class="document-thumbnail-container">
                    <img src="${firstImage}" alt="${result.filename}" class="document-thumbnail" loading="lazy">
                    <div class="document-info">
                      <div class="result-title">${result.filename} ${imageBadge}</div>
                      <p class="result-snippet">${snippet}</p>
                    </div>
                  </div>
                </a>
              `;
            } else {
              // Regular document without images
              return `
                <a href="/view/${result.id}?q=${encodeURIComponent(query)}&page=${page}" class="result-item">
                  <div class="result-source">
                    <div class="result-icon">
                      <span class="file-type-badge" style="color: ${typeConfig.color}; background: ${typeConfig.bg};">${typeConfig.label}</span>
                    </div>
                    <div class="result-url">
                      <span class="source-indicator">${sourceIcon}</span>
                      <span class="domain">${sourceLabel}</span>
                      <span class="path"> › ${result.fileType.toUpperCase()} › ${formatFileSize(result.fileSize)}</span>
                    </div>
                  </div>
                  <div class="result-title">${result.filename} ${imageBadge}</div>
                  <p class="result-snippet">${snippet}</p>
                </a>
              `;
            }
          }
        }
      }).join('');

      // Add pagination if more than one page
      if (totalPages > 1) {
        resultsList.innerHTML += renderPagination(page, totalPages);
      }
    }

    // Render pagination controls
    function renderPagination(currentPage, totalPages) {
      let paginationHTML = '<div class="pagination">';
      
      // Previous button
      paginationHTML += `
        <button class="pagination-btn nav-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Previous
        </button>
      `;

      // Page numbers (Google-style: show current page and nearby pages)
      const maxVisiblePages = 10;
      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      
      // Adjust start if we're near the end
      if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }

      // First page and ellipsis
      if (startPage > 1) {
        paginationHTML += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
          paginationHTML += `<span class="pagination-ellipsis">...</span>`;
        }
      }

      // Page numbers
      for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
          <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>
        `;
      }

      // Last page and ellipsis
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          paginationHTML += `<span class="pagination-ellipsis">...</span>`;
        }
        paginationHTML += `<button class="pagination-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
      }

      // Next button
      paginationHTML += `
        <button class="pagination-btn nav-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
          Next
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      `;

      paginationHTML += '</div>';
      return paginationHTML;
    }

    // Go to specific page
    function goToPage(page) {
      if (page < 1 || !currentQuery) return;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Update URL to reflect current page
      const newUrl = `/?q=${encodeURIComponent(currentQuery)}&page=${page}`;
      window.history.pushState({ query: currentQuery, page: page }, '', newUrl);
      
      performSearch(currentQuery, page);
    }

    // Syntax Highlighting Functions
    function updateSyntaxHighlighting(searchInput) {
      const query = searchInput.value;
      
      // Only validate if there's actual content
      if (!query.trim()) {
        searchInput.classList.remove('valid', 'invalid', 'incomplete');
        return;
      }
      
      const validation = validateSearchSyntax(query);
      
      // Update validation classes
      searchInput.classList.remove('valid', 'invalid', 'incomplete');
      searchInput.classList.add(validation.status);
      
      // Update syntax highlighting (this would require a more complex implementation)
      // For now, we'll just add validation feedback
    }

    function validateSearchSyntax(query) {
      if (!query.trim()) {
        return { status: '', message: '', errors: [] };
      }
      
      const errors = [];
      const allowedTypes = ['pdf', 'txt', 'docx', 'doc', 'md', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'image', 'torrent', 'vault', 'zim', 'zip'];
      
      // Check for incomplete operators
      if (query.endsWith('::&&') || query.endsWith('::||') || query.endsWith('::!')) {
        const operator = query.match(/(::&&|::\|\||::!)$/)[1];
        errors.push({
          type: 'incomplete',
          message: `Expected search terms after "${operator}"`,
          suggestion: `Add search terms after ${operator}`
        });
      }
      
      // Check for invalid file types
      const fileTypes = query.match(/::([a-zA-Z0-9]+)/g);
      if (fileTypes) {
        for (const fileType of fileTypes) {
          const type = fileType.substring(2);
          // Skip validation for ::image command (special case)
          if (type.toLowerCase() === 'image') {
            continue;
          }
          if (!allowedTypes.includes(type.toLowerCase()) && !['&&', '||', '!'].includes(type)) {
            errors.push({
              type: 'invalid_file_type',
              message: `Unknown file type: "${type}"`,
              suggestion: `Try: ${allowedTypes.slice(0, 5).join(', ')}...`
            });
          }
        }
      }
      
      // Check for malformed operators
      if (query.includes('::&&::') || query.includes('::||::') || query.includes('::!::')) {
        errors.push({
          type: 'malformed',
          message: 'Malformed operator syntax',
          suggestion: 'Remove extra :: between operators'
        });
      }
      
      // Check for operators without search terms
      const segments = query.split(/(::&&|::\|\||::!)/);
      for (let i = 0; i < segments.length; i++) {
        if (i % 2 === 1) { // This is an operator
          const prevSegment = segments[i-1];
          const nextSegment = segments[i+1];
          if (!prevSegment || !prevSegment.trim()) {
            errors.push({
              type: 'missing_terms',
              message: `Missing search terms before operator`,
              suggestion: 'Add search terms before the operator'
            });
          }
          if (!nextSegment || !nextSegment.trim()) {
            errors.push({
              type: 'missing_terms',
              message: `Missing search terms after operator`,
              suggestion: 'Add search terms after the operator'
            });
          }
        }
      }
      
      if (errors.length === 0) {
        return { status: 'valid', message: 'Syntax is valid', errors: [] };
      }
      
      return { 
        status: 'invalid', 
        message: `${errors.length} syntax issue${errors.length > 1 ? 's' : ''} found`, 
        errors: errors 
      };
    }

    function showSyntaxErrorModal(query, errors, searchInput, callback) {
      const modal = document.getElementById('syntax-error-modal');
      const queryText = document.getElementById('syntax-error-query-text');
      const errorList = document.getElementById('syntax-error-list');
      
      // Set query text
      queryText.textContent = query;
      
      // Build error list HTML
      let errorHTML = '';
      errors.forEach(error => {
        errorHTML += `
          <div class="syntax-error-item">
            <div class="syntax-error-icon">⚠️</div>
            <div class="syntax-error-details">
              <strong>${error.message}</strong>
              <small>💡 ${error.suggestion}</small>
            </div>
          </div>
        `;
      });
      errorList.innerHTML = errorHTML;
      
      // Show modal
      modal.classList.add('visible');
      
      // Handle button clicks
      const continueBtn = document.getElementById('syntax-error-continue');
      const fixBtn = document.getElementById('syntax-error-fix');
      const closeBtn = document.getElementById('syntax-error-close');
      
      const cleanup = () => {
        modal.classList.remove('visible');
        continueBtn.removeEventListener('click', onContinue);
        fixBtn.removeEventListener('click', onFix);
        closeBtn.removeEventListener('click', onClose);
      };
      
      const onContinue = () => {
        cleanup();
        callback(true); // Continue with search
      };
      
      const onFix = () => {
        cleanup();
        // Focus back to search input for manual fixing
        searchInput.focus();
        callback(false); // Don't continue
      };
      
      const onClose = () => {
        cleanup();
        callback(false); // Don't continue
      };
      
      continueBtn.addEventListener('click', onContinue);
      fixBtn.addEventListener('click', onFix);
      closeBtn.addEventListener('click', onClose);
      
      // Also close on backdrop click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup();
          callback(false);
        }
      });
    }

    // Event Listeners
    mainSearch.addEventListener('input', () => {
      updateClearButton(mainSearch, mainClear);
      updateSyntaxHighlighting(mainSearch);
    });
    
    headerSearch.addEventListener('input', () => {
      updateClearButton(headerSearch, headerClear);
      updateSyntaxHighlighting(headerSearch);
    });

    mainSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearchWithValidation(mainSearch.value, mainSearch);
    });

    headerSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearchWithValidation(headerSearch.value, headerSearch);
    });

    function performSearchWithValidation(query, searchInput) {
      if (!query.trim()) {
        showToast('info', 'Empty Search', 'Please enter a search query');
        return;
      }
      
      const validation = validateSearchSyntax(query);
      
      if (validation.status === 'invalid') {
        // Show syntax error modal
        showSyntaxErrorModal(query, validation.errors, searchInput, (shouldContinue) => {
          if (shouldContinue) {
            performSearch(query);
          }
        });
      } else {
        // No errors, proceed with search
        performSearch(query);
      }
    }

    searchBtn.addEventListener('click', () => performSearchWithValidation(mainSearch.value, mainSearch));

    // Image search button functionality
    const imageSearchBtn = document.getElementById('image-search-btn');
    imageSearchBtn.addEventListener('click', () => {
      const currentSearch = mainSearch.value.trim();
      if (currentSearch) {
        const imageQuery = `${currentSearch}::image`;
        performSearchWithValidation(imageQuery, mainSearch);
      } else {
        showToast('info', 'Empty Search', 'Please enter a search query before searching for images');
      }
    });

    // Magnifying glass click triggers search
    document.getElementById('main-search-icon').addEventListener('click', () => performSearchWithValidation(mainSearch.value, mainSearch));
    document.getElementById('header-search-icon').addEventListener('click', () => performSearchWithValidation(headerSearch.value, headerSearch));

    mainClear.addEventListener('click', () => {
      mainSearch.value = '';
      updateClearButton(mainSearch, mainClear);
      mainSearch.focus();
    });

    headerClear.addEventListener('click', () => {
      headerSearch.value = '';
      updateClearButton(headerSearch, headerClear);
      headerSearch.focus();
    });

    // Logo click returns to home
    document.querySelector('.logo-small')?.addEventListener('click', (e) => {
      e.preventDefault();
      mainSearch.value = '';
      headerSearch.value = '';
      showHomeView();
    });

    // Modal functionality
    const uploadModal = document.getElementById('upload-modal');
    const uploadBtn = document.getElementById('upload-btn');
    const headerUploadBtn = document.getElementById('header-upload-btn');
    const fabUploadBtn = document.getElementById('fab-upload-btn');
    const modalClose = document.getElementById('modal-close');
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const fileCount = document.getElementById('file-count');
    const emptyState = document.getElementById('empty-state');
    const browseLink = document.querySelector('.browse-link');

    // Store uploaded files
    let uploadedFiles = [];
    let vaultUnlocked = false;

    // Vault state elements
    const vaultNoPin = document.getElementById('vault-no-pin');
    const vaultLocked = document.getElementById('vault-locked');
    const vaultUnlockedEl = document.getElementById('vault-unlocked');
    const vaultPinBoxes = document.querySelectorAll('.vault-pin-box');
    const vaultPinStatus = document.getElementById('vault-pin-status');

    const documentsSection = document.getElementById('documents-section');

    async function checkVaultState() {
      try {
        const response = await fetch('/api/vault/status');
        const data = await response.json();
        
        if (!data.pin_set) {
          // No PIN set - hide everything
          vaultNoPin.style.display = 'flex';
          vaultLocked.style.display = 'none';
          vaultUnlockedEl.style.display = 'none';
          documentsSection.style.display = 'none';
        } else if (!vaultUnlocked) {
          // PIN set but not unlocked - hide documents
          vaultNoPin.style.display = 'none';
          vaultLocked.style.display = 'flex';
          vaultUnlockedEl.style.display = 'none';
          documentsSection.style.display = 'none';
          // Focus first PIN box
          setTimeout(() => vaultPinBoxes[0]?.focus(), 100);
        } else {
          // Unlocked - show everything
          vaultNoPin.style.display = 'none';
          vaultLocked.style.display = 'none';
          vaultUnlockedEl.style.display = 'block';
          documentsSection.style.display = 'block';
        }
      } catch (error) {
        console.error('Failed to check vault status:', error);
      }
    }

    // Vault PIN box handling
    vaultPinBoxes.forEach((box, index) => {
      box.addEventListener('input', (e) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = value;
        
        if (value && index < vaultPinBoxes.length - 1) {
          vaultPinBoxes[index + 1].focus();
        }
        
        // Check if all boxes filled
        const pin = Array.from(vaultPinBoxes).map(b => b.value).join('');
        if (pin.length === 4) {
          verifyVaultPin(pin);
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          vaultPinBoxes[index - 1].focus();
        }
      });
    });

    function clearVaultPinBoxes() {
      vaultPinBoxes.forEach(box => {
        box.value = '';
        box.classList.remove('filled', 'error');
      });
      vaultPinBoxes[0]?.focus();
    }

    async function verifyVaultPin(pin) {
      try {
        const response = await authFetch('/api/vault/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: pin })
        });
        
        if (response.ok) {
          vaultPinStatus.textContent = '✓ Unlocked';
          vaultPinStatus.className = 'vault-pin-status success';
          vaultUnlocked = true;
          setTimeout(() => {
            checkVaultState();
            vaultPinStatus.textContent = '';
          }, 500);
        } else {
          vaultPinStatus.textContent = 'Incorrect PIN';
          vaultPinStatus.className = 'vault-pin-status error';
          vaultPinBoxes.forEach(b => b.classList.add('error'));
          setTimeout(() => {
            clearVaultPinBoxes();
            vaultPinStatus.textContent = '';
          }, 1000);
        }
      } catch (error) {
        vaultPinStatus.textContent = 'Error verifying PIN';
        vaultPinStatus.className = 'vault-pin-status error';
      }
    }

    function openModal() {
      uploadModal.classList.add('visible');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      modalClose.focus();
      checkVaultState();
      loadDocuments();
      if (typeof checkForRunningArchiveJobs === 'function') checkForRunningArchiveJobs();
    }

    function closeModal() {
      uploadModal.classList.remove('visible');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    if (uploadBtn) uploadBtn.addEventListener('click', openModal);
    if (headerUploadBtn) headerUploadBtn.addEventListener('click', openModal);
    if (fabUploadBtn) fabUploadBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);

    // Close modal when clicking outside
    uploadModal.addEventListener('click', (e) => {
      if (e.target === uploadModal) {
        closeModal();
      }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && uploadModal.classList.contains('visible')) {
        closeModal();
      }
    });

    // Tab switching
    const modalTabs = document.querySelectorAll('.modal-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    modalTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        modalTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${targetTab}-tab`) {
            content.classList.add('active');
          }
        });

        // Show/hide documents section based on active tab
        const documentsSection = document.getElementById('documents-section');
        if (targetTab === 'vault') {
          // Check vault state to determine if documents should show
          checkVaultState();
        } else {
          documentsSection.style.display = 'none';
        }
      });
    });

    // Folder indexing
    const folderPathInput = document.getElementById('folder-path-input');
    const folderBrowseBtn = document.getElementById('folder-browse-btn');
    const indexFolderBtn = document.getElementById('index-folder-btn');
    const indexStatus = document.getElementById('index-status');

    // Browse button - uses File System Access API if available
    folderBrowseBtn.addEventListener('click', async () => {
      if ('showDirectoryPicker' in window) {
        try {
          const dirHandle = await window.showDirectoryPicker();
          // For local apps, we need the user to provide the full path
          // The API only gives us the folder name, not the full path
          const folderName = dirHandle.name;
          indexStatus.className = 'index-status';
          indexStatus.innerHTML = `Selected: <strong>${folderName}</strong><br><small>Enter the full path to this folder above</small>`;
          folderPathInput.focus();
        } catch (err) {
          // User cancelled the picker
          if (err.name !== 'AbortError') {
            console.error('Folder picker error:', err);
          }
        }
      } else {
        // Fallback for browsers without File System Access API
        indexStatus.className = 'index-status';
        indexStatus.textContent = 'Please type the full folder path manually (e.g., /home/user/Documents)';
        folderPathInput.focus();
      }
    });

    const indexBtnOriginalHTML = indexFolderBtn.innerHTML;

    indexFolderBtn.addEventListener('click', async () => {
      const folderPath = folderPathInput.value.trim();
      
      if (!folderPath) {
        indexStatus.className = 'index-status error';
        indexStatus.textContent = 'Please enter a folder path';
        return;
      }
      
      indexFolderBtn.disabled = true;
      indexFolderBtn.innerHTML = `<div class="spinner"></div> Indexing...`;
      indexStatus.className = 'index-status loading';
      indexStatus.textContent = 'Starting indexing job...';
      
      try {
        const response = await pinAuthFetch('/api/folder/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folderPath })
        });
        
        const data = await response.json();
        
        if (response.ok && data.job_id) {
          // Poll for progress
          const jobId = data.job_id;
          indexStatus.textContent = 'Scanning files...';

          const pollInterval = setInterval(async () => {
            try {
              const statusResp = await fetch(`/api/folder/index/status?job_id=${jobId}`);
              const statusData = await statusResp.json();

              if (statusData.total > 0) {
                const pct = Math.round((statusData.processed / statusData.total) * 100);
                indexStatus.textContent = `Indexing: ${statusData.processed}/${statusData.total} files (${pct}%) — ${statusData.indexed} indexed, ${statusData.failed} failed`;
              } else {
                indexStatus.textContent = 'Scanning files...';
              }

              if (statusData.status === 'completed') {
                clearInterval(pollInterval);
                indexStatus.className = 'index-status success';
                indexStatus.textContent = `Done! ${statusData.indexed} indexed, ${statusData.failed} failed, ${statusData.skipped} skipped`;
                folderPathInput.value = '';
                addNotification('success', 'Folder Indexed', `Indexed ${statusData.indexed} files${statusData.failed ? ` (${statusData.failed} failed)` : ''}`);
                indexFolderBtn.innerHTML = indexBtnOriginalHTML;
                indexFolderBtn.disabled = false;
                loadConnectedFolders();
                await loadDocuments();
              }
            } catch (pollErr) {
              // Keep polling on transient errors
              console.warn('Poll error:', pollErr);
            }
          }, 1500);
        } else if (!response.ok) {
          indexStatus.className = 'index-status error';
          indexStatus.textContent = data.error || 'Failed to index folder';
          addNotification('error', 'Indexing Failed', data.error || 'Failed to index folder');
          indexFolderBtn.innerHTML = indexBtnOriginalHTML;
          indexFolderBtn.disabled = false;
        }
      } catch (error) {
        indexStatus.className = 'index-status error';
        indexStatus.textContent = 'Error connecting to server';
        addNotification('error', 'Indexing Failed', 'Could not connect to server');
        indexFolderBtn.innerHTML = indexBtnOriginalHTML;
        indexFolderBtn.disabled = false;
      }
      
      loadConnectedFolders();
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

        const response = await pinAuthFetch('/api/folders/sync', { method: 'POST' });
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
          pinAuthFetch('/api/settings/last-sync-time', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: now })
          }).catch(e => console.error('Failed to save sync time:', e));
          updateLastSynced(now);
          
          // Show detailed results
          if (results.processed_files.length > 0) {
            console.log('Processed files:', results.processed_files);
          }
          
          // Refresh connected folders list and documents
          loadConnectedFolders();
          loadDocuments();
          
          const added = results.added || 0;
          const updated = results.updated || 0;
          const errCount = results.errors ? results.errors.length : 0;
          if (errCount > 0) {
            addNotification('warning', 'Sync Complete with Errors', `Added ${added}, updated ${updated} files. ${errCount} error(s) occurred.`);
          } else if (added > 0 || updated > 0) {
            addNotification('success', 'Sync Complete', `Added ${added} new, updated ${updated} files.`);
          } else {
            addNotification('info', 'Sync Complete', 'All folders are up to date — no changes found.', false);
          }
        } else {
          syncStatus.textContent = data.error || 'Sync failed';
          syncStatus.className = 'sync-status error';
          addNotification('error', 'Sync Failed', data.error || 'Folder sync failed');
        }
      } catch (error) {
        syncStatus.textContent = 'Error: ' + error.message;
        syncStatus.className = 'sync-status error';
        addNotification('error', 'Sync Failed', 'Error: ' + error.message);
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

    // Load connected folders
    const connectedFoldersList = document.getElementById('connected-folders-list');

    async function loadConnectedFolders() {
      try {
        const response = await fetch('/api/folders');
        const data = await response.json();
        
        if (data.folders && data.folders.length > 0) {
          connectedFoldersList.innerHTML = data.folders.map(folder => `
            <div class="connected-folder-item" data-path="${folder}">
              <div class="connected-folder-path">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>${folder}</span>
              </div>
              <button class="connected-folder-remove" onclick="removeConnectedFolder('${folder}')" title="Remove">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          `).join('');
        } else {
          connectedFoldersList.innerHTML = '<div class="no-connected-folders">No folders connected yet</div>';
        }
      } catch (error) {
        console.error('Failed to load connected folders:', error);
      }
    }

    async function removeConnectedFolder(folderPath) {
      if (!confirm(`Remove "${folderPath}" from index? Files will not be deleted.`)) {
        return;
      }
      
      try {
        const response = await pinAuthFetch('/api/folder/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folderPath })
        });
        
        if (response.ok) {
          loadConnectedFolders();
          loadDocuments();
          addNotification('success', 'Folder Removed', `Removed "${folderPath}" from index`);
        } else {
          addNotification('error', 'Remove Failed', 'Failed to remove folder from index');
        }
      } catch (error) {
        addNotification('error', 'Remove Failed', 'Error connecting to server');
      }
    }

    // Load connected folders on page load
    loadConnectedFolders();

    // ── ZIM/ZIP Archive indexing ──────────────────────────────────────────
    const archivePathInput = document.getElementById('archive-path-input');
    const archiveBrowseBtn = document.getElementById('archive-browse-btn');
    const indexArchiveBtn = document.getElementById('index-archive-btn');
    const archiveStatus = document.getElementById('archive-index-status');
    const indexedArchivesList = document.getElementById('indexed-archives-list');

    archiveBrowseBtn.addEventListener('click', () => {
      if (!_activeArchiveJobId) {
        archiveStatus.className = 'index-status';
        archiveStatus.textContent = 'Enter the full path to a .zim or .zip file above';
      }
      archivePathInput.focus();
    });

    const archiveBtnOriginalHTML = indexArchiveBtn.innerHTML;

    let _archivePollingInterval = null;
    let _activeArchiveJobId = null;

    function stopArchivePolling() {
      if (_archivePollingInterval) {
        clearInterval(_archivePollingInterval);
        _archivePollingInterval = null;
      }
      _activeArchiveJobId = null;
    }

    // Global banner elements
    const _globalBanner = document.getElementById('global-indexing-banner');
    const _globalBannerText = document.getElementById('global-indexing-text');
    let _bannerHideTimeout = null;

    function _showGlobalBanner(text, completed) {
      if (!_globalBanner) return;
      if (_bannerHideTimeout) { clearTimeout(_bannerHideTimeout); _bannerHideTimeout = null; }
      _globalBanner.style.display = 'block';
      _globalBanner.className = completed ? 'global-indexing-banner completed' : 'global-indexing-banner';
      if (_globalBannerText) _globalBannerText.textContent = text;
      if (completed) {
        _bannerHideTimeout = setTimeout(() => { _globalBanner.style.display = 'none'; }, 10000);
      }
    }

    function _hideGlobalBanner() {
      if (_globalBanner) _globalBanner.style.display = 'none';
      if (_bannerHideTimeout) { clearTimeout(_bannerHideTimeout); _bannerHideTimeout = null; }
    }

    function _applyArchivePollingUI(data) {
      const total = data.total || 0;
      const indexed = data.indexed || 0;
      const failed = data.failed || 0;
      const images = data.images || 0;
      const deferred = data.deferred || 0;
      const skippedIcon = data.skipped_icon || 0;
      const skippedNotfound = data.skipped_notfound || 0;
      const skipText = (skippedIcon > 0 || skippedNotfound > 0)
        ? ` (${skippedIcon} icons skipped, ${skippedNotfound} not found)`
        : '';

      if (data.status === 'running') {
        indexArchiveBtn.disabled = true;
        indexArchiveBtn.innerHTML = '<div class="spinner"></div> Indexing...';
        archiveStatus.className = 'index-status loading';
        archiveStatus.textContent = `Indexing: ${indexed.toLocaleString()} indexed, ${failed.toLocaleString()} failed, ${total.toLocaleString()} total articles | ${images.toLocaleString()} images${skipText}${deferred > 0 ? ` (${deferred} deferred)` : ''}`;
        _showGlobalBanner(`Archive indexing: ${indexed.toLocaleString()} / ${total.toLocaleString()} articles, ${images.toLocaleString()} images${skipText}`, false);
      } else if (data.status === 'completed') {
        stopArchivePolling();
        archiveStatus.className = 'index-status success';
        archiveStatus.textContent = `Indexed ${indexed.toLocaleString()} articles from archive (${failed.toLocaleString()} failed, ${images.toLocaleString()} images)`;
        archivePathInput.value = '';
        indexArchiveBtn.innerHTML = archiveBtnOriginalHTML;
        indexArchiveBtn.disabled = false;
        addNotification('success', 'Archive Indexed', `Indexed ${indexed.toLocaleString()} articles${failed ? ` (${failed} failed)` : ''}`);
        _showGlobalBanner(`Archive indexing complete: ${indexed.toLocaleString()} articles`, true);
        loadIndexedArchives();
        loadDocuments();
      } else if (data.status === 'failed') {
        stopArchivePolling();
        archiveStatus.className = 'index-status error';
        archiveStatus.textContent = data.error || 'Indexing failed';
        indexArchiveBtn.innerHTML = archiveBtnOriginalHTML;
        indexArchiveBtn.disabled = false;
        addNotification('error', 'Indexing Failed', data.error || 'Indexing failed');
        _hideGlobalBanner();
      }
    }

    function startArchivePolling(jobId) {
      stopArchivePolling();
      _activeArchiveJobId = jobId;
      _archivePollingInterval = setInterval(async () => {
        try {
          const resp = await fetch(`/api/zim/index/status?job_id=${jobId}`);
          const data = await resp.json();

          if (!data || data.error) {
            stopArchivePolling();
            archiveStatus.className = 'index-status error';
            archiveStatus.textContent = data?.error || 'Job not found';
            indexArchiveBtn.innerHTML = archiveBtnOriginalHTML;
            indexArchiveBtn.disabled = false;
            return;
          }

          _applyArchivePollingUI(data);
        } catch (e) {
          console.error('Archive polling error:', e);
        }
      }, 2000);
    }

    async function checkForRunningArchiveJobs() {
      try {
        const resp = await fetch('/api/zim/index/status');
        const data = await resp.json();
        if (data.jobs) {
          // First priority: find any running job and resume polling
          for (const [jobId, job] of Object.entries(data.jobs)) {
            if (job.status === 'running') {
              _applyArchivePollingUI(job);
              if (!_archivePollingInterval) {
                startArchivePolling(jobId);
              }
              return;
            }
          }
          // Second priority: show the most recent completed/failed job
          let latestJob = null;
          let latestId = null;
          for (const [jobId, job] of Object.entries(data.jobs)) {
            if (job.status === 'completed' || job.status === 'failed') {
              latestJob = job;
              latestId = jobId;
            }
          }
          if (latestJob) {
            _applyArchivePollingUI(latestJob);
          }
        }
      } catch (e) {
        console.error('Error checking archive jobs:', e);
      }
    }

    checkForRunningArchiveJobs();

    indexArchiveBtn.addEventListener('click', async () => {
      const archivePath = archivePathInput.value.trim();

      if (!archivePath) {
        archiveStatus.className = 'index-status error';
        archiveStatus.textContent = 'Please enter an archive file path';
        return;
      }

      const ext = archivePath.split('.').pop().toLowerCase();
      if (ext !== 'zim' && ext !== 'zip') {
        archiveStatus.className = 'index-status error';
        archiveStatus.textContent = 'Only .zim and .zip files are supported';
        return;
      }

      indexArchiveBtn.disabled = true;
      indexArchiveBtn.innerHTML = '<div class="spinner"></div> Indexing...';
      archiveStatus.className = 'index-status loading';
      archiveStatus.textContent = 'Starting archive indexing...';

      try {
        const response = await pinAuthFetch('/api/zim/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: archivePath })
        });

        const data = await response.json();

        if (response.ok && data.job_id) {
          showToast('info', 'Indexing Started', 'Archive indexing is running in the background. Progress will update automatically.');
          startArchivePolling(data.job_id);
        } else if (data.status === 'already_running') {
          archiveStatus.className = 'index-status loading';
          archiveStatus.textContent = 'This archive is already being indexed...';
          startArchivePolling(data.job_id);
        } else {
          archiveStatus.className = 'index-status error';
          archiveStatus.textContent = data.error || 'Failed to start indexing';
          addNotification('error', 'Indexing Failed', data.error || 'Failed to start indexing');
          indexArchiveBtn.innerHTML = archiveBtnOriginalHTML;
          indexArchiveBtn.disabled = false;
        }
      } catch (error) {
        archiveStatus.className = 'index-status error';
        archiveStatus.textContent = 'Error connecting to server';
        addNotification('error', 'Indexing Failed', 'Could not connect to server');
        indexArchiveBtn.innerHTML = archiveBtnOriginalHTML;
        indexArchiveBtn.disabled = false;
      }
    });

    async function loadIndexedArchives() {
      try {
        const response = await fetch('/api/zim/indexed');
        const data = await response.json();

        if (data.archives && data.archives.length > 0) {
          indexedArchivesList.innerHTML = data.archives.map(a => `
            <div class="connected-folder-item" data-path="${a.path}">
              <div class="connected-folder-path">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 8v13H3V8"></path>
                  <path d="M1 3h22v5H1z"></path>
                  <path d="M10 12h4"></path>
                </svg>
                <span>${a.name} <small style="color:#8b949e">(${a.type.toUpperCase()} · ${a.articles_indexed} items)</small></span>
              </div>
              <button class="connected-folder-remove" onclick="removeIndexedArchive('${a.path.replace(/'/g, "\\'")}')" title="Remove">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          `).join('');
        } else {
          indexedArchivesList.innerHTML = '<div class="no-connected-folders">No archives indexed yet</div>';
        }
      } catch (error) {
        console.error('Failed to load indexed archives:', error);
      }
    }

    async function removeIndexedArchive(archivePath) {
      if (!confirm(`Remove "${archivePath}" from index? The file will not be deleted.`)) {
        return;
      }

      // Find the archive item and show loading state
      const archiveItem = indexedArchivesList.querySelector(`[data-path="${CSS.escape(archivePath)}"]`);
      const removeBtn = archiveItem ? archiveItem.querySelector('.connected-folder-remove') : null;
      const originalBtnHTML = removeBtn ? removeBtn.innerHTML : '';

      // Disable all remove buttons to prevent concurrent deletes
      indexedArchivesList.querySelectorAll('.connected-folder-remove').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
      });

      // Show spinner on the clicked button
      if (removeBtn) {
        removeBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div>';
      }

      // Show "Removing..." label on the item
      if (archiveItem) {
        const nameSpan = archiveItem.querySelector('.connected-folder-path span');
        if (nameSpan) {
          nameSpan.dataset.originalText = nameSpan.innerHTML;
          nameSpan.innerHTML = `<span style="color:#f0883e">Removing...</span> ${nameSpan.innerHTML}`;
        }
      }

      // Show status text below the list
      archiveStatus.className = 'index-status loading';
      archiveStatus.textContent = 'Removing archive — this may take a while for large archives...';
      showToast('info', 'Removing Archive', 'Deleting documents from index. This may take a moment...');

      try {
        const response = await pinAuthFetch('/api/zim/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: archivePath })
        });

        if (response.ok) {
          const data = await response.json();
          archiveStatus.className = 'index-status success';
          archiveStatus.textContent = `Removed ${data.documents_removed} documents from index`;
          loadIndexedArchives();
          loadDocuments();
          addNotification('success', 'Archive Removed', `Removed ${data.documents_removed} documents from index`);
        } else {
          archiveStatus.className = 'index-status error';
          archiveStatus.textContent = 'Failed to remove archive from index';
          addNotification('error', 'Remove Failed', 'Failed to remove archive from index');
          // Restore buttons on failure
          loadIndexedArchives();
        }
      } catch (error) {
        archiveStatus.className = 'index-status error';
        archiveStatus.textContent = 'Error connecting to server';
        addNotification('error', 'Remove Failed', 'Error connecting to server');
        loadIndexedArchives();
      }
    }

    // Make removeIndexedArchive available globally for onclick handlers
    window.removeIndexedArchive = removeIndexedArchive;

    // Load indexed archives on page load
    loadIndexedArchives();

    // ── Sync Archives functionality ──────────────────────────────────────
    const syncArchivesBtn = document.getElementById('sync-archives-btn');
    const archiveSyncStatus = document.getElementById('archive-sync-status');
    const archiveLastSynced = document.getElementById('archive-last-synced');

    function updateArchiveLastSynced(timestamp) {
      if (timestamp) {
        archiveLastSynced.textContent = `Last synced: ${formatTimeAgo(timestamp)}`;
        archiveLastSynced.className = 'last-synced';
      } else {
        archiveLastSynced.textContent = 'Never synced';
        archiveLastSynced.className = 'last-synced never';
      }
    }

    async function loadArchiveLastSynced() {
      try {
        const resp = await fetch('/api/settings/last-archive-sync-time');
        const data = await resp.json();
        if (data.last_archive_sync_time) {
          updateArchiveLastSynced(data.last_archive_sync_time);
        } else {
          updateArchiveLastSynced(null);
        }
      } catch (e) {
        updateArchiveLastSynced(null);
      }
    }

    setInterval(loadArchiveLastSynced, 60000);
    loadArchiveLastSynced();

    syncArchivesBtn.addEventListener('click', async () => {
      try {
        syncArchivesBtn.disabled = true;
        syncArchivesBtn.classList.add('loading');
        archiveSyncStatus.textContent = 'Syncing archives...';
        archiveSyncStatus.className = 'sync-status loading';

        const spinnerIcon = syncArchivesBtn.querySelector('.spinner-icon');
        const syncIcon = syncArchivesBtn.querySelector('.sync-icon');
        const syncText = syncArchivesBtn.querySelector('.sync-text');

        if (spinnerIcon) spinnerIcon.style.display = 'inline-block';
        if (syncIcon) syncIcon.style.opacity = '0';
        if (syncText) syncText.textContent = 'Syncing...';

        showToast('info', 'Syncing Archives', 'Re-indexing all tracked archives. This may take a while...');

        const response = await pinAuthFetch('/api/zim/sync', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
          const r = data.results;
          let statusMessage = 'Sync complete! ';

          if (r.synced > 0) {
            statusMessage += `${r.synced} archive${r.synced > 1 ? 's' : ''} re-indexed. `;
          }
          if (r.skipped > 0) {
            statusMessage += `${r.skipped} skipped. `;
          }
          if (r.failed > 0) {
            statusMessage += `${r.failed} failed. `;
          }
          if (r.total === 0) {
            statusMessage = 'No archives to sync.';
          }

          archiveSyncStatus.textContent = statusMessage;
          archiveSyncStatus.className = 'sync-status success';

          const now = new Date().toISOString();
          pinAuthFetch('/api/settings/last-archive-sync-time', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: now })
          }).catch(e => console.error('Failed to save archive sync time:', e));
          updateArchiveLastSynced(now);

          loadIndexedArchives();
          loadDocuments();

          if (r.errors && r.errors.length > 0) {
            addNotification('warning', 'Archive Sync Complete with Errors', `Synced ${r.synced} archives. ${r.errors.length} error(s).`);
          } else if (r.synced > 0) {
            addNotification('success', 'Archive Sync Complete', `Re-indexed ${r.synced} archive${r.synced > 1 ? 's' : ''}.`);
          } else if (r.total > 0) {
            addNotification('info', 'Archive Sync Complete', 'All archives are up to date.', false);
          }
        } else {
          archiveSyncStatus.textContent = data.error || 'Sync failed';
          archiveSyncStatus.className = 'sync-status error';
          addNotification('error', 'Archive Sync Failed', data.error || 'Archive sync failed');
        }
      } catch (error) {
        archiveSyncStatus.textContent = 'Error: ' + error.message;
        archiveSyncStatus.className = 'sync-status error';
        addNotification('error', 'Archive Sync Failed', 'Error: ' + error.message);
      } finally {
        syncArchivesBtn.disabled = false;
        syncArchivesBtn.classList.remove('loading');

        const spinnerIcon = syncArchivesBtn.querySelector('.spinner-icon');
        const syncIcon = syncArchivesBtn.querySelector('.sync-icon');
        const syncText = syncArchivesBtn.querySelector('.sync-text');

        if (spinnerIcon) spinnerIcon.style.display = 'none';
        if (syncIcon) syncIcon.style.opacity = '1';
        if (syncText) syncText.textContent = 'Sync Archives';

        setTimeout(() => {
          archiveSyncStatus.textContent = '';
          archiveSyncStatus.className = 'sync-status';
        }, 5000);
      }
    });

    // File type config
    function getFileTypeConfig(filename) {
      const ext = filename.split('.').pop().toLowerCase();
      const config = {
        'pdf': { color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)', label: 'PDF' },
        'docx': { color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)', label: 'DOC' },
        'doc': { color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)', label: 'DOC' },
        'txt': { color: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)', label: 'TXT' },
        'md': { color: '#3fb950', bg: 'rgba(63, 185, 80, 0.15)', label: 'MD' }
      };
      return config[ext] || config['txt'];
    }

    // Render file list
    function renderFileList() {
      fileCount.textContent = `${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`;
      
      if (uploadedFiles.length === 0) {
        fileList.innerHTML = `
          <div class="empty-files">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
            <p>No documents uploaded yet</p>
            <p style="font-size: 0.8rem; margin-top: 4px;">Upload files to start searching</p>
          </div>
        `;
        return;
      }
      
      const filesHtml = uploadedFiles.map(doc => {
        const typeConfig = getFileTypeConfig(doc.filename);
        const uploadDate = new Date(doc.uploaded_at).toLocaleDateString();
        const isVault = doc.source === 'vault' || !doc.source;
        const isQBT = doc.source === 'qbittorrent';
        const isZim = doc.source === 'zim';
        const isZip = doc.source === 'zip';
        const sourceIcon = isVault 
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2" title="Vault"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
          : isQBT
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f0883e" stroke-width="2" title="qBittorrent"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`
          : isZim
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2" title="ZIM Archive"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`
          : isZip
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2" title="ZIP Archive"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" title="Folder"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        const sourceLabel = isVault ? 'Vault' : isQBT ? 'qBittorrent' : isZim ? 'ZIM Archive' : isZip ? 'ZIP Archive' : 'Folder';
        return `
          <div class="file-item" data-id="${doc.id}">
            <div class="file-icon">
              <span class="file-type-badge" style="color: ${typeConfig.color}; background: ${typeConfig.bg};">${typeConfig.label}</span>
            </div>
            <div class="file-info">
              <div class="file-name">${doc.filename}</div>
              <div class="file-meta">
                <span class="source-badge">${sourceIcon} ${sourceLabel}</span> • 
                ${formatFileSize(doc.file_size)} • ${uploadDate}
              </div>
            </div>
            <div class="file-actions">
              <button class="file-action-btn delete" title="Delete" aria-label="Delete ${doc.filename}" onclick="removeFile('${doc.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('');
      
      fileList.innerHTML = filesHtml;
    }

    // Remove file (delete from backend)
    window.removeFile = async function(docId) {
      try {
        const response = await pinAuthFetch(`/api/documents/${docId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          addNotification('success', 'File Removed', 'Document removed from index.');
          await loadDocuments();
        } else {
          addNotification('error', 'Delete Failed', 'Could not remove document from index.');
        }
      } catch (error) {
        addNotification('error', 'Delete Failed', 'Error: ' + error.message);
      }
    };

    // Upload file to backend
    async function uploadFile(file) {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await pinAuthFetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
          console.log('File uploaded:', data.document);
          addNotification('success', 'File Uploaded', `"${file.name}" has been indexed and is now searchable.`);
          return data.document;
        } else {
          console.error('Upload error:', data.error);
          addNotification('error', 'Upload Failed', `"${file.name}" could not be uploaded: ${data.error}`);
          return null;
        }
      } catch (error) {
        console.error('Upload error:', error);
        addNotification('error', 'Upload Failed', 'Could not connect to server. Is Meilisearch running?');
        return null;
      }
    }

    // Handle files - upload to backend
    async function handleFiles(files) {
      const validExtensions = ['.pdf', '.txt', '.docx', '.doc', '.md'];
      
      for (const file of Array.from(files)) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (validExtensions.includes(ext)) {
          uploadZone.innerHTML = `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="spinning">
              <path d="M21 12a9 9 0 11-6.219-8.56"></path>
            </svg>
            <p>Uploading ${file.name}...</p>
          `;
          await uploadFile(file);
        }
      }
      
      // Reset upload zone
      uploadZone.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <p>Drag and drop files here, or <span class="browse-link">browse</span></p>
        <p style="font-size: 0.75rem; margin-top: 8px; color: #6e7681;">Supports PDF, TXT, DOCX, MD files</p>
      `;
      
      // Re-attach browse link listener
      document.querySelector('.browse-link').addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
      
      // Reload documents list
      await loadDocuments();
    }

    // Load documents from backend
    async function loadDocuments() {
      console.log('Loading documents...');
      try {
        const response = await fetch('/api/documents');
        const data = await response.json();
        console.log('Documents response:', data);
        
        if (response.ok) {
          console.log('All documents:', data.documents);
          console.log('Sample document sources:', data.documents.slice(0, 5).map(doc => ({ id: doc.id, source: doc.source, filename: doc.filename })));
          
          // Check for any documents with vault in their source (case-insensitive)
          const vaultDocs = (data.documents || []).filter(doc => 
            doc.source && doc.source.toLowerCase() === 'vault'
          );
          console.log('Documents with vault source (case-insensitive):', vaultDocs.length);
          console.log('Vault documents found:', vaultDocs.slice(0, 3).map(doc => ({ id: doc.id, source: doc.source, filename: doc.filename })));
          
          // Check for any documents with vault anywhere in source
          const vaultContains = (data.documents || []).filter(doc => 
            doc.source && doc.source.toLowerCase().includes('vault')
          );
          console.log('Documents containing vault in source:', vaultContains.length);
          
          // Only show vault documents in the Vault tab (not folder-indexed files)
          uploadedFiles = vaultDocs;
          console.log('Loaded', uploadedFiles.length, 'vault documents');
          console.log('Vault documents:', uploadedFiles.slice(0, 3).map(doc => ({ id: doc.id, source: doc.source, filename: doc.filename })));
          renderFileList();
        } else {
          console.error('Failed to load documents:', data.error);
        }
      } catch (error) {
        console.error('Failed to load documents:', error);
      }
    }

    // Drag and drop handlers
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });

    // Click to browse
    uploadZone.addEventListener('click', () => fileInput.click());
    browseLink.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    // Keyboard support for upload zone
    uploadZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      fileInput.value = '';
    });

    // Check for URL parameters and restore search if present
    function restoreSearchFromURL() {
      const urlParams = new URLSearchParams(window.location.search);
      let searchQuery = urlParams.get('q');
      const searchPage = urlParams.get('page');
      
      if (searchQuery) {
        // Handle encoded URLs by decoding if still contains any percent-encoded characters
        if (searchQuery.includes('%')) {
          searchQuery = decodeURIComponent(searchQuery);
        }
        
        // Set search input value
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.value = searchQuery;
        }
        
        // Set page for search
        if (searchPage) {
          // Store page for pagination
          currentPage = parseInt(searchPage) || 1;
        }
        
        performSearch(searchQuery, currentPage);
        return true;
      }
      return false;
    }

    // Handle browser back/forward navigation
    window.addEventListener('popstate', (event) => {
      console.log('DEBUG: popstate event triggered', event.state);
      if (event.state && event.state.query) {
        // Restore search from browser history state
        performSearch(event.state.query, event.state.page || 1);
      } else {
        // No state in history, try to restore from URL
        restoreSearchFromURL();
      }
    });

    // Initial load
    if (!restoreSearchFromURL()) {
      loadDocuments();
    }

    // Two-Column Image Gallery Functionality
    const rightColumn = document.getElementById('right-column');
    const galleryImagesVertical = document.getElementById('gallery-images-vertical');

    // Collect images from search results
    function collectImagesFromResults(results) {
      const allImages = [];
      
      console.log('DEBUG: collectImagesFromResults called with', results.length, 'results');
      
      results.forEach(result => {
        console.log('DEBUG: Processing result:', result.filename, 'has_images:', result.has_images, 'image_count:', result.image_count);
        if (result.has_images && result.all_images && result.all_images.length > 0) {
          result.all_images.forEach((imagePath, index) => {
            // Use medium thumbnails for better quality in gallery
            const mediumImagePath = imagePath.includes('.jpg')
              ? imagePath.replace('_small.jpg', '_medium.jpg')
              : imagePath.replace('_small.webp', '_medium.webp');
            
            // Determine if this is a PDF page, DOCX image, or Markdown image
            const isPdfPage = imagePath.includes('_page_');
            const isMarkdownImage = imagePath.includes('_markdown_');
            let imageIndex;
            
            if (isPdfPage) {
              imageIndex = parseInt(imagePath.match(/_page_(\d+)_/)[1]) + 1;
            } else if (isMarkdownImage) {
              imageIndex = parseInt(imagePath.match(/_markdown_(\d+)_/)[1]) + 1;
            } else {
              imageIndex = index + 1; // DOCX images
            }
            
            allImages.push({
              src: mediumImagePath,
              docId: result.id,
              docName: result.filename,
              docType: result.fileType,
              imageIndex: imageIndex,
              isPdfPage: isPdfPage,
              isMarkdownImage: isMarkdownImage
            });
          });
        }
      });
      
      console.log('DEBUG: Collected', allImages.length, 'images total');
      return allImages;
    }

    // Render vertical image gallery
    function renderVerticalGallery(images) {
      if (images.length === 0) {
        rightColumn.style.display = 'none';
        return;
      }

      rightColumn.style.display = 'block';
      galleryImagesVertical.innerHTML = '';

      // Show only first 7 images
      const maxImages = 7;
      const imagesToShow = images.slice(0, maxImages);

      imagesToShow.forEach((image, index) => {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-image-vertical';
        galleryItem.onclick = () => handleImageClick(image);

        const img = document.createElement('img');
        img.src = image.src;
        img.alt = `${image.docName} - Image ${index + 1}`;
        img.loading = 'lazy';
        
        // Fallback to small thumbnail if medium fails
        img.onerror = () => {
          img.src = image.src.includes('.jpg')
            ? image.src.replace('_medium.jpg', '_small.jpg')
            : image.src.replace('_medium.webp', '_small.webp');
        };

        const overlay = document.createElement('div');
        overlay.className = 'gallery-image-overlay-vertical';
        overlay.innerHTML = `
          <div class="gallery-image-title-vertical">${image.docName}</div>
          <div class="gallery-image-meta-vertical">
            <span class="file-type">${image.docType.toUpperCase()}</span>
            <span>${image.isPdfPage ? 'Page' : image.isMarkdownImage ? 'Image' : 'Image'} ${image.imageIndex}</span>
          </div>
        `;

        galleryItem.appendChild(img);
        galleryItem.appendChild(overlay);
        galleryImagesVertical.appendChild(galleryItem);
      });

      // Add "View More" link if there are more images
      if (images.length > maxImages) {
        const viewMoreItem = document.createElement('div');
        viewMoreItem.className = 'gallery-view-more';
        viewMoreItem.innerHTML = `
          <div class="view-more-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 12h8"></path>
              <path d="M12 8v8"></path>
            </svg>
            <span>View More</span>
            <div class="more-count">+${images.length - maxImages}</div>
          </div>
        `;
        viewMoreItem.onclick = () => handleViewMore(images);
        galleryImagesVertical.appendChild(viewMoreItem);
      }
    }

    // Modal elements
    const imagePreviewModal = document.getElementById('image-preview-modal');
    const modalOverlay = document.getElementById('modal-overlay');
    const imageModalClose = document.getElementById('modal-close');
    const modalImage = document.getElementById('modal-image');
    const modalTitle = document.getElementById('modal-title');
    const modalFileType = document.getElementById('modal-file-type');
    const modalImageNumber = document.getElementById('modal-image-number');
    const viewDocumentBtn = document.getElementById('view-document-btn');

    let currentImage = null;

    // Handle image click - show modal
    function handleImageClick(image) {
      currentImage = image;
      
      // Show modal with loading state
      imagePreviewModal.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevent background scroll
      document.documentElement.style.overflow = 'hidden'; // Also prevent html scroll
      
      // Add loading state to image
      modalImage.style.opacity = '0';
      
      // Use high-quality modal thumbnail - handle both small and medium sources
      let modalImageSrc = image.src;
      if (modalImageSrc.includes('.jpg')) {
        if (modalImageSrc.includes('_small.jpg')) modalImageSrc = modalImageSrc.replace('_small.jpg', '_modal.jpg');
        else if (modalImageSrc.includes('_medium.jpg')) modalImageSrc = modalImageSrc.replace('_medium.jpg', '_modal.jpg');
        else if (modalImageSrc.includes('_large.jpg')) modalImageSrc = modalImageSrc.replace('_large.jpg', '_modal.jpg');
      } else {
        if (modalImageSrc.includes('_small.webp')) modalImageSrc = modalImageSrc.replace('_small.webp', '_modal.webp');
        else if (modalImageSrc.includes('_medium.webp')) modalImageSrc = modalImageSrc.replace('_medium.webp', '_modal.webp');
        else if (modalImageSrc.includes('_large.webp')) modalImageSrc = modalImageSrc.replace('_large.webp', '_modal.webp');
      }
      modalImage.src = modalImageSrc;
      modalImage.alt = `${image.docName} - ${image.isPdfPage ? 'Page' : image.isMarkdownImage ? 'Image' : 'Image'} ${image.imageIndex}`;
      
      // Set text content immediately
      modalTitle.textContent = image.docName;
      modalFileType.textContent = image.docType.toUpperCase();
      modalImageNumber.textContent = `${image.isPdfPage ? 'Page' : image.isMarkdownImage ? 'Image' : 'Image'} ${image.imageIndex}`;
      
      // Handle image load
      modalImage.onload = () => {
        modalImage.style.transition = 'opacity 0.3s ease';
        modalImage.style.opacity = '1';
      };
      
      modalImage.onerror = () => {
        // Smart fallback: try large, then medium, then small
        let fallbackSrc = modalImage.src;
        if (fallbackSrc.includes('.jpg')) {
          if (fallbackSrc.includes('_modal.jpg')) fallbackSrc = fallbackSrc.replace('_modal.jpg', '_large.jpg');
          else if (fallbackSrc.includes('_large.jpg')) fallbackSrc = fallbackSrc.replace('_large.jpg', '_medium.jpg');
          else if (fallbackSrc.includes('_medium.jpg')) fallbackSrc = fallbackSrc.replace('_medium.jpg', '_small.jpg');
        } else {
          if (fallbackSrc.includes('_modal.webp')) fallbackSrc = fallbackSrc.replace('_modal.webp', '_large.webp');
          else if (fallbackSrc.includes('_large.webp')) fallbackSrc = fallbackSrc.replace('_large.webp', '_medium.webp');
          else if (fallbackSrc.includes('_medium.webp')) fallbackSrc = fallbackSrc.replace('_medium.webp', '_small.webp');
        }
        modalImage.src = fallbackSrc;
        modalImage.style.opacity = '1';
        console.error('Failed to load modal thumbnail, falling back to:', fallbackSrc);
      };
    }

    // Close image modal
    function closeImageModal() {
      imagePreviewModal.classList.remove('active');
      document.body.style.overflow = ''; // Restore scroll
      document.documentElement.style.overflow = ''; // Also restore html scroll
      currentImage = null;
    }

    // Modal event listeners
    imageModalClose.addEventListener('click', closeImageModal);
    modalOverlay.addEventListener('click', closeImageModal);

    // View document button
    viewDocumentBtn.addEventListener('click', () => {
      if (currentImage) {
        const viewUrl = `/view/${currentImage.docId}?q=${encodeURIComponent(currentQuery || '')}&page=${currentPage || 1}`;
        window.location.href = viewUrl;
      }
    });

    // Close image modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && imagePreviewModal.classList.contains('active')) {
        closeImageModal();
      }
    });

    // Handle "View More" click - navigate to dedicated image search page
    function handleViewMore(allImages) {
      console.log('View More clicked - navigating to image search page');
      // Navigate to dedicated image search page
      const imageUrl = `/images?q=${encodeURIComponent(currentQuery)}&source=gallery`;
      window.location.href = imageUrl;
    }

    // Update vertical gallery when search results are rendered
    function updateVerticalGallery(results) {
      const images = collectImagesFromResults(results);
      renderVerticalGallery(images);
    }

    // Modify the existing renderResults function to update vertical gallery
    const originalRenderResults = renderResults;
    renderResults = function(results, query, totalHits, processingTime, page) {
      originalRenderResults(results, query, totalHits, processingTime, page);
      updateVerticalGallery(results);
    };

    // Search Recommendations Functions
    let recommendationsCache = null;
    let recommendationsCacheTime = 0;
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    async function fetchRecommendations() {
      try {
        // Never fetch recommendations when in results view
        if (resultsContainer.classList.contains('visible')) return;
        
        // Check cache first
        if (recommendationsCache && (Date.now() - recommendationsCacheTime) < CACHE_DURATION) {
          console.log('Using cached recommendations');
          updateRecommendationsUI(recommendationsCache);
          return;
        }

        console.log('Fetching recommendations from API...');
        
        // Show loading state
        showRecommendationsLoading();
        
        // Include search history if enhancement is enabled
        let url = '/api/ollama/recommendations';
        if (isHistoryEnhancementEnabled()) {
          const history = getSearchHistory();
          console.log('History enhancement enabled:', isHistoryEnhancementEnabled());
          console.log('Current search history:', history);
          if (history.length > 0) {
            const historyParam = encodeURIComponent(JSON.stringify(history));
            url = `/api/ollama/recommendations?history=${historyParam}`;
            console.log('Fetching enhanced recommendations with history:', history);
            console.log('API URL:', url);
          } else {
            console.log('No search history available');
          }
        } else {
          console.log('History enhancement disabled');
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
          recommendationsCache = data;
          recommendationsCacheTime = Date.now();
          
          if (data.enhanced) {
            console.log('Enhanced recommendations received using search history');
          }
          
          updateRecommendationsUI(data);
          console.log('Recommendations loaded successfully:', data);
        } else {
          console.log('Recommendations failed:', data.message);
          hideRecommendations();
        }
      } catch (error) {
        console.error('Error fetching recommendations:', error);
        hideRecommendations();
      }
    }

    function updateRecommendationsUI(data) {
      const recommendationsContainer = document.getElementById('search-recommendations');
      const recommendationsList = document.getElementById('recommendations-list');
      
      // Never show recommendations when in results view
      if (resultsContainer.classList.contains('visible')) {
        hideRecommendations();
        return;
      }
      
      if (!data.recommendations || data.recommendations.length === 0) {
        hideRecommendations();
        return;
      }

      // Clear existing recommendations
      recommendationsList.innerHTML = '';
      
      // Add recommendation items
      data.recommendations.forEach(rec => {
        const item = document.createElement('div');
        item.className = 'recommendation-item';
        item.setAttribute('data-query', rec.query);
        item.setAttribute('data-reason', rec.reason);
        item.setAttribute('data-category', rec.category);
        item.textContent = rec.query;
        
        // Add click handler
        item.addEventListener('click', () => handleRecommendationClick(rec.query));
        
        recommendationsList.appendChild(item);
      });
      
      // Show recommendations
      recommendationsContainer.style.display = 'block';
      console.log('Recommendations UI updated with', data.recommendations.length, 'items');
    }

    function handleRecommendationClick(query) {
      console.log('Recommendation clicked:', query);
      
      // Fill search bar
      const mainSearch = document.getElementById('main-search');
      mainSearch.value = query;
      
      // Trigger search
      performSearchWithValidation(query, mainSearch);
      
      // Hide recommendations after selection
      setTimeout(() => {
        hideRecommendations();
      }, 500);
    }

    function hideRecommendations() {
      const recommendationsContainer = document.getElementById('search-recommendations');
      recommendationsContainer.style.display = 'none';
    }

    function showRecommendations() {
      const recommendationsContainer = document.getElementById('search-recommendations');
      recommendationsContainer.style.display = 'block';
    }

    function showRecommendationsLoading() {
      const recommendationsContainer = document.getElementById('search-recommendations');
      const recommendationsList = document.getElementById('recommendations-list');
      
      // Never show recommendations when in results view
      if (resultsContainer.classList.contains('visible')) return;
      
      // Show the container
      recommendationsContainer.style.display = 'block';
      
      // Show loading state
      recommendationsList.innerHTML = `
        <div class="recommendations-loading">
          <div class="loading-spinner"></div>
          <span class="loading-text">Generating AI suggestions...</span>
        </div>
      `;
    }

    // Refresh recommendations
    async function refreshRecommendations() {
      const refreshBtn = document.getElementById('recommendations-refresh');
      
      // Show loading state
      refreshBtn.style.animation = 'spin 1s linear infinite';
      showRecommendationsLoading();
      
      try {
        // Clear cache
        recommendationsCache = null;
        recommendationsCacheTime = 0;
        
        // Fetch fresh recommendations
        await fetchRecommendations();
      } finally {
        // Stop loading animation
        refreshBtn.style.animation = '';
      }
    }

    // Auto-fetch recommendations when Ollama is connected
    async function checkOllamaAndFetchRecommendations() {
      try {
        // ✅ Check if we're in results view first
        if (resultsContainer.classList.contains('visible')) {
          console.log('In results view, skipping recommendations');
          return;
        }
        
        const response = await fetch('/api/ollama/status');
        const data = await response.json();
        
        if (data.enabled && data.connected) {
          console.log('Ollama is connected, fetching recommendations...');
          fetchRecommendations();
        } else {
          console.log('Ollama not connected, hiding recommendations');
          hideRecommendations();
        }
      } catch (error) {
        console.error('Error checking Ollama status:', error);
        hideRecommendations();
      }
    }

    // Event Listeners for Recommendations
    document.addEventListener('DOMContentLoaded', () => {
      // Add refresh button listener
      const refreshBtn = document.getElementById('recommendations-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshRecommendations);
      }
      
      // Check Ollama status and fetch recommendations after page load
      setTimeout(() => {
        checkOllamaAndFetchRecommendations();
      }, 2000); // Wait 2 seconds for page to fully load
      
      // Periodically refresh recommendations (every 5 minutes)
      setInterval(() => {
        if (recommendationsCache) {
          console.log('Periodic recommendation refresh...');
          checkOllamaAndFetchRecommendations();
        }
      }, 5 * 60 * 1000); // 5 minutes
    });

    // AI Summary Functions
    let currentSummaryData = null;
    let summaryCache = new Map(); // Cache for summaries

    async function generateAISummary(query, results) {
      try {
        // Check cache first
        const cacheKey = `${query}_${results.length}`;
        if (summaryCache.has(cacheKey)) {
          console.log('Using cached summary');
          updateSummaryUI(summaryCache.get(cacheKey));
          return;
        }

        console.log('Generating AI summary for:', query);
        
        // Show loading state
        showSummaryLoading();
        
        // Prepare request data
        const requestData = {
          query: query,
          results: results.slice(0, 8) // Send top 8 results for context
        };
        
        const response = await authFetch('/api/search/summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          // Cache the result
          summaryCache.set(cacheKey, data);
          
          // Update UI
          updateSummaryUI(data);
          console.log('AI summary generated successfully:', data);
        } else {
          console.log('AI summary failed:', data.error);
          showSummaryError(data.error || 'Failed to generate summary');
        }
        
      } catch (error) {
        console.error('Error generating AI summary:', error);
        showSummaryError('Failed to generate AI summary');
      }
    }

    function updateSummaryUI(data) {
      const summaryContainer = document.getElementById('ai-summary-container');
      const summaryContent = document.getElementById('ai-summary-content');
      const summaryFooter = document.getElementById('ai-summary-footer');
      const confidenceBadge = document.getElementById('confidence-badge');
      
      // Check if this is from cache
      const isFromCache = data.timestamp && (Date.now() - data.timestamp < 60000); // Less than 1 minute old
      const cacheAge = data.timestamp ? Math.round((Date.now() - data.timestamp) / 1000) : 0;
      
      // Build markdown content from structured data or plain summary
      let markdownSource = '';
      if (data.overview || data.detailed_analysis || (data.key_findings && data.key_findings.length)) {
        markdownSource = buildComprehensiveSummary(data);
      } else {
        markdownSource = data.summary || '';
      }

      // Render markdown to HTML
      let renderedSummary = '';
      try {
        if (typeof marked !== 'undefined') {
          marked.setOptions({ breaks: true, gfm: true });
          renderedSummary = marked.parse(markdownSource);
        } else {
          renderedSummary = escapeHtml(markdownSource).replace(/\n/g, '<br>');
        }
      } catch (e) {
        renderedSummary = escapeHtml(markdownSource).replace(/\n/g, '<br>');
      }

      // Build citations from current search results if not provided by backend
      const citations = (data.citations && data.citations.length > 0 && data.citations[0].url)
        ? data.citations
        : buildCitationsFromResults(currentResults, currentQuery);

      // Add clickable citations to the rendered HTML
      renderedSummary = addClickableCitations(renderedSummary, citations);

      // Determine if summary is long enough for truncation
      const shouldTruncate = renderedSummary.length > 1200;
      
      summaryContent.innerHTML = `
        <div class="ai-summary-wrapper ${shouldTruncate ? 'truncated' : 'expanded'}" id="ai-summary-wrapper">
          <div class="ai-summary-text" id="streaming-text">${renderedSummary}</div>
        </div>
        ${shouldTruncate ? `
          <div class="summary-view-more-inline">
            <button class="view-more-btn-inline" id="ai-summary-view-more" title="View more details">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              View more
            </button>
          </div>
        ` : ''}
      `;
      
      // Update metadata with cache indicator
      const metadataHTML = `
        <div class="summary-metadata">
          <span>${data.sources_used || 0} sources</span>
          <span>${data.generation_time ? `${data.generation_time}s` : ''}</span>
          <span>${data.model_used || 'AI'}</span>
          ${isFromCache ? `<span class="cache-indicator" title="Cached ${cacheAge}s ago">⚡ Cached</span>` : ''}
        </div>
      `;
      
      const citationsHTML = citations.length > 0 ? `
        <div class="summary-citations">
          ${citations.map(citation => {
            const metadata = `${citation.file_type} • ${citation.file_size}`;
            const safeTitle = (citation.title || '').replace(/"/g, '&quot;');
            return `
              <a href="${citation.url}" 
                 class="citation-link" 
                 title="${safeTitle} (${metadata})"
                 data-citation-id="${citation.id}">
                [${citation.id}]
              </a>
            `;
          }).join('')}
        </div>
      ` : '';
      
      summaryFooter.innerHTML = metadataHTML + citationsHTML;
      
      // Add click handler for View More button
      const viewMoreBtn = document.getElementById('ai-summary-view-more');
      const summaryWrapper = document.getElementById('ai-summary-wrapper');
      
      if (viewMoreBtn && summaryWrapper) {
        viewMoreBtn.addEventListener('click', (e) => {
          e.preventDefault();
          
          if (summaryWrapper.classList.contains('truncated')) {
            // Expand the summary
            summaryWrapper.classList.remove('truncated');
            summaryWrapper.classList.add('expanded');
            
            // Update button text and icon
            viewMoreBtn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
              View less
            `;
            viewMoreBtn.setAttribute('title', 'View less details');
            
            console.log('Summary expanded');
          } else {
            // Collapse the summary
            summaryWrapper.classList.remove('expanded');
            summaryWrapper.classList.add('truncated');
            
            // Update button text and icon
            viewMoreBtn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              View more
            `;
            viewMoreBtn.setAttribute('title', 'View more details');
            
            console.log('Summary collapsed');
          }
        });
      }
      
      // Update confidence badge
      confidenceBadge.textContent = data.confidence || 'medium';
      confidenceBadge.className = `confidence-badge ${data.confidence || 'medium'}`;
      
      // Build top sources sidebar from citation frequency
      const sourcesPanel = document.getElementById('ai-summary-sources');
      if (sourcesPanel && citations.length > 0) {
        // Count how many times each citation appears in the rendered summary
        const citeCounts = {};
        const citeMatches = renderedSummary.match(/data-citation-id="(\d+)"/g) || [];
        citeMatches.forEach(m => {
          const id = m.match(/(\d+)/)[1];
          citeCounts[id] = (citeCounts[id] || 0) + 1;
        });

        // Sort citations by frequency, take top 3
        const rankedSources = citations
          .map(c => ({ ...c, count: citeCounts[c.id] || 0 }))
          .filter(c => c.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        if (rankedSources.length > 0) {
          const fileTypeColors = {
            '.pdf': { color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)' },
            'pdf': { color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)' },
            '.docx': { color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)' },
            'docx': { color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)' },
            '.doc': { color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)' },
            'doc': { color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)' },
            '.txt': { color: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)' },
            'txt': { color: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)' },
            '.md': { color: '#3fb950', bg: 'rgba(63, 185, 80, 0.15)' },
            'md': { color: '#3fb950', bg: 'rgba(63, 185, 80, 0.15)' }
          };

          const cardsHTML = rankedSources.map(source => {
            const ft = (source.file_type || '').toLowerCase().replace('.', '');
            const colors = fileTypeColors[ft] || fileTypeColors['.' + ft] || { color: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)' };
            const safeTitle = (source.title || '').replace(/"/g, '&quot;');
            return `
              <a href="${source.url}" class="source-card" title="${safeTitle}">
                <div class="source-icon" style="background: ${colors.bg}; color: ${colors.color};">
                  ${ft.toUpperCase()}
                </div>
                <div class="source-details">
                  <div class="source-name">${source.title}</div>
                  <div class="source-meta">
                    <span class="source-cite-count">${source.count} citation${source.count > 1 ? 's' : ''}</span>
                    <span>${source.file_size || ''}</span>
                  </div>
                </div>
              </a>
            `;
          }).join('');

          sourcesPanel.innerHTML = `
            <div class="sources-title">Top Sources</div>
            ${cardsHTML}
          `;
          sourcesPanel.style.display = 'flex';
        } else {
          sourcesPanel.style.display = 'none';
        }
      }
      
      // Show the container
      summaryContainer.style.display = 'block';
    }

    function showSummaryLoading() {
      const summaryContainer = document.getElementById('ai-summary-container');
      const summaryContent = document.getElementById('ai-summary-content');
      const summaryFooter = document.getElementById('ai-summary-footer');
      const confidenceBadge = document.getElementById('confidence-badge');
      const sourcesPanel = document.getElementById('ai-summary-sources');
      
      // Show container
      summaryContainer.style.display = 'block';
      
      // Hide sources sidebar during loading
      if (sourcesPanel) sourcesPanel.style.display = 'none';
      
      // Show loading state
      summaryContent.innerHTML = `
        <div class="ai-summary-loading">
          <div class="loading-spinner"></div>
          <span>Generating AI summary...</span>
        </div>
      `;
      
      summaryFooter.innerHTML = '';
      confidenceBadge.textContent = 'loading';
      confidenceBadge.className = 'confidence-badge';
    }

    function showSummaryError(errorMessage) {
      const summaryContainer = document.getElementById('ai-summary-container');
      const summaryContent = document.getElementById('ai-summary-content');
      const summaryFooter = document.getElementById('ai-summary-footer');
      const confidenceBadge = document.getElementById('confidence-badge');
      const sourcesPanel = document.getElementById('ai-summary-sources');
      
      // Hide sources sidebar on error
      if (sourcesPanel) sourcesPanel.style.display = 'none';
      
      // Show error state
      summaryContent.innerHTML = `
        <div class="ai-summary-error">
          ${errorMessage || 'Failed to generate AI summary'}
        </div>
      `;
      
      summaryFooter.innerHTML = '';
      confidenceBadge.textContent = 'error';
      confidenceBadge.className = 'confidence-badge low';
      
      // Still show the container
      summaryContainer.style.display = 'block';
    }

    function hideSummary() {
      const summaryContainer = document.getElementById('ai-summary-container');
      summaryContainer.style.display = 'none';
    }

    // Search History Management Functions (backed by database API)
    let _searchHistoryCache = [];
    let _aiEnhancementCache = true;

    // Load initial caches from database
    fetch('/api/settings/search-history')
      .then(r => r.json())
      .then(data => { _searchHistoryCache = data.history || []; })
      .catch(() => {});
    fetch('/api/settings/ai-enhancement')
      .then(r => r.json())
      .then(data => { _aiEnhancementCache = data.enabled; })
      .catch(() => {});

    function addToSearchHistory(query) {
      if (!query || !query.trim()) return;

      // Optimistic local update
      _searchHistoryCache = _searchHistoryCache.filter(
        item => item.toLowerCase() !== query.toLowerCase()
      );
      _searchHistoryCache.unshift(query.trim());
      _searchHistoryCache = _searchHistoryCache.slice(0, 5);

      // Persist to database
      pinAuthFetch('/api/settings/search-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      }).then(r => r.json())
        .then(data => { _searchHistoryCache = data.history || _searchHistoryCache; })
        .catch(err => console.error('Failed to save search history:', err));

      if (CACHE_CONFIG.ENABLE_DEBUG) {
        console.log('Added to search history:', query);
        console.log('Current history:', _searchHistoryCache);
      }
    }

    function getSearchHistory() {
      return _searchHistoryCache;
    }

    function clearSearchHistory() {
      _searchHistoryCache = [];
      pinAuthFetch('/api/settings/search-history', { method: 'DELETE' })
        .catch(err => console.error('Failed to clear search history:', err));
      console.log('Search history cleared');
    }

    function isHistoryEnhancementEnabled() {
      return _aiEnhancementCache;
    }

    function setHistoryEnhancementEnabled(enabled) {
      _aiEnhancementCache = enabled;
      pinAuthFetch('/api/settings/ai-enhancement', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled })
      }).catch(err => console.error('Failed to save AI enhancement pref:', err));
    }

    function buildCitationsFromResults(results, query) {
      if (!results || results.length === 0) return [];
      return results.slice(0, 5).map((result, i) => ({
        id: i + 1,
        title: result.filename || `Document ${i + 1}`,
        url: `/view/${result.id}?q=${encodeURIComponent(query || '')}`,
        file_type: result.fileType || 'unknown',
        file_size: result.fileSize ? formatFileSize(result.fileSize) : 'Unknown'
      }));
    }

    function addClickableCitations(text, citations) {
      if (!citations || citations.length === 0) return text;
      
      // Create a map of citation numbers to citation data
      const citationMap = {};
      citations.forEach(citation => {
        citationMap[citation.id] = citation;
      });
      
      // Replace citation numbers with clickable links
      return text.replace(/\[(\d+)\]/g, (match, citationNum) => {
        const citation = citationMap[citationNum];
        if (citation) {
          const safeTitle = (citation.title || '').replace(/"/g, '&quot;');
          return `<a href="${citation.url}" class="citation-link" title="${safeTitle} (${citation.file_type} • ${citation.file_size})" data-citation-id="${citation.id}">[${citationNum}]</a>`;
        }
        return match; // Return original if citation not found
      });
    }

    // AI Summary Caching System
    const CACHE_CONFIG = {
      TTL: 3600000,        // 1 hour in milliseconds
      MAX_ENTRIES: 100,    // Maximum cached summaries
      CLEANUP_INTERVAL: 300000, // Cleanup every 5 minutes
      ENABLE_DEBUG: true   // Enable for testing
    };

    function generateCacheKey(query, searchResults) {
      const resultsHash = hashSearchResults(searchResults);
      const safeQuery = query.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 16);
      return `ai_summary_${safeQuery}_${resultsHash}`;
    }

    function hashSearchResults(results) {
      // Create hash from top 5 result IDs and content previews
      const keyData = results.slice(0, 5).map(r => ({
        id: r.id,
        filename: r.filename,
        contentPreview: r.content.substring(0, 100)
      }));
      
      try {
        return btoa(JSON.stringify(keyData)).substring(0, 16);
      } catch (error) {
        // Fallback for encoding issues
        const simpleHash = keyData.map(item => item.id).join('_').substring(0, 16);
        return simpleHash.replace(/[^a-zA-Z0-9]/g, '_');
      }
    }

    function saveSummaryToCache(query, searchResults, summaryData) {
      if (!isCacheSupported()) return;
      
      const key = generateCacheKey(query, searchResults);
      const entry = {
        ...summaryData,
        timestamp: Date.now(),
        query: query,
        resultsHash: hashSearchResults(searchResults)
      };
      
      try {
        localStorage.setItem(key, JSON.stringify(entry));
        
        if (CACHE_CONFIG.ENABLE_DEBUG) {
          console.log('Saved AI summary to cache:', key);
        }
        
        // Cleanup old entries
        cleanupOldCache();
      } catch (error) {
        console.warn('Failed to save summary to cache:', error);
      }
    }

    function loadSummaryFromCache(query, searchResults) {
      if (!isCacheSupported()) return null;
      
      const key = generateCacheKey(query, searchResults);
      
      try {
        const cached = localStorage.getItem(key);
        
        if (!cached) return null;
        
        const entry = JSON.parse(cached);
        const age = Date.now() - entry.timestamp;
        
        // Check if cache is still valid
        if (age > CACHE_CONFIG.TTL) {
          localStorage.removeItem(key);
          if (CACHE_CONFIG.ENABLE_DEBUG) {
            console.log('Cache entry expired:', key);
          }
          return null;
        }
        
        if (CACHE_CONFIG.ENABLE_DEBUG) {
          console.log('Loaded AI summary from cache:', key, `Age: ${Math.round(age/1000)}s`);
        }
        
        return entry;
      } catch (error) {
        console.warn('Failed to load summary from cache:', error);
        return null;
      }
    }

    function clearSummaryCache(query, searchResults) {
      if (!isCacheSupported()) return;
      
      const key = generateCacheKey(query, searchResults);
      localStorage.removeItem(key);
      
      if (CACHE_CONFIG.ENABLE_DEBUG) {
        console.log('Cleared AI summary cache:', key);
      }
    }

    function isCacheSupported() {
      try {
        const test = '__cache_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
      } catch {
        return false;
      }
    }

    function cleanupOldCache() {
      if (!isCacheSupported()) return;
      
      const now = Date.now();
      const keys = Object.keys(localStorage);
      let removedCount = 0;
      
      keys.forEach(key => {
        if (key.startsWith('ai_summary_')) {
          try {
            const entry = JSON.parse(localStorage.getItem(key));
            if (now - entry.timestamp > CACHE_CONFIG.TTL) {
              localStorage.removeItem(key);
              removedCount++;
            }
          } catch (error) {
            // Remove corrupted entries
            localStorage.removeItem(key);
            removedCount++;
          }
        }
      });
      
      if (removedCount > 0 && CACHE_CONFIG.ENABLE_DEBUG) {
        console.log(`Cleaned up ${removedCount} expired cache entries`);
      }
    }

    function clearAllSummaryCache() {
      if (!isCacheSupported()) return;
      
      const keys = Object.keys(localStorage);
      let removedCount = 0;
      
      keys.forEach(key => {
        if (key.startsWith('ai_summary_')) {
          localStorage.removeItem(key);
          removedCount++;
        }
      });
      
      if (CACHE_CONFIG.ENABLE_DEBUG) {
        console.log(`Cleared all ${removedCount} AI summary cache entries`);
      }
      
      return removedCount;
    }

    // Enhanced AI summary generation with caching
    async function generateAISummary(query, searchResults, forceRefresh = false) {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = loadSummaryFromCache(query, searchResults);
        if (cached) {
          console.log('Using cached AI summary');
          updateSummaryUI(cached);
          return cached;
        }
      }
      
      // Generate new summary
      console.log('Generating new AI summary');
      showSummaryLoading();
      
      try {
        const response = await authFetch('/api/search/summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: query,
            results: searchResults
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          console.log('AI summary generated successfully');
          updateSummaryUI(data);
          
          // Cache the summary
          saveSummaryToCache(query, searchResults, data);
          
          return data;
        } else {
          console.error('AI summary generation failed:', data.error);
          showSummaryError(data.error || 'Failed to generate AI summary');
          addNotification('error', 'AI Summary Failed', data.error || 'Could not generate summary for your search.', false);
          return null;
        }
        
      } catch (error) {
        console.error('Error generating AI summary:', error);
        showSummaryError('Failed to connect to AI service');
        addNotification('error', 'AI Summary Failed', 'Could not connect to AI service. Check Ollama settings.', false);
        return null;
      }
    }

    // Streaming AI summary generation with professional typing effects
    async function generateStreamingSummary(query, searchResults, forceRefresh = false) {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = loadSummaryFromCache(query, searchResults);
        if (cached) {
          console.log('Using cached AI summary');
          updateSummaryUI(cached);
          return cached;
        }
      }
      
      // Generate new streaming summary
      console.log('Generating new streaming AI summary');
      showSummaryStreaming();
      
      try {
        console.log('Starting streaming summary request');
        const response = await authFetch('/api/search/summary/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: query,
            results: searchResults
          })
        });
        
        console.log('Streaming response status:', response.status);
        console.log('Streaming response headers:', response.headers);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status_code}: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        let lineBuffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;
          
          // Split on newlines; last element may be incomplete
          const parts = lineBuffer.split('\n');
          lineBuffer = parts.pop(); // keep incomplete trailing fragment
          
          const lines = parts.filter(line => line.trim() !== '');
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              
              if (data.error) {
                throw new Error(data.error);
              }
              
              if (data.response) {
                accumulatedText += data.response;
                updateSummaryStreaming(accumulatedText);
              }
              
              if (data.done) {
                completeSummaryStreaming();
                // Clean accumulated text: strip ```json wrapper before parsing
                let cleanedAccumulated = accumulatedText.trim();
                cleanedAccumulated = cleanedAccumulated.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

                // Try to parse the accumulated text as JSON to extract structured data
                let summaryData;
                try {
                  const parsedData = JSON.parse(cleanedAccumulated);
                  summaryData = {
                    success: true,
                    summary: parsedData.summary || '',
                    overview: parsedData.overview || '',
                    detailed_analysis: parsedData.detailed_analysis || '',
                    key_findings: parsedData.key_findings || [],
                    context_connections: parsedData.context_connections || '',
                    specific_details: parsedData.specific_details || [],
                    key_points: parsedData.key_findings || parsedData.key_points || [],
                    confidence: parsedData.confidence || 'medium',
                    citations: parsedData.citations || [],
                    query: query,
                    sources_used: searchResults.length,
                    model_used: 'gemma3:12b',
                    generation_time: 0,
                    timestamp: Date.now()
                  };
                } catch (e) {
                  // If JSON parsing fails, use cleaned markdown as summary
                  summaryData = {
                    success: true,
                    summary: cleanStreamingText(accumulatedText),
                    query: query,
                    sources_used: searchResults.length,
                    model_used: 'gemma3:12b',
                    generation_time: 0,
                    timestamp: Date.now()
                  };
                }
                saveSummaryToCache(query, searchResults, summaryData);
                updateSummaryUI(summaryData);
              }
            } catch (parseError) {
              console.error('Error parsing streaming chunk:', parseError);
            }
          }
        }
        
        // Process any remaining data in the line buffer after stream ends
        if (lineBuffer.trim()) {
          try {
            const data = JSON.parse(lineBuffer);
            if (data.response) {
              accumulatedText += data.response;
              updateSummaryStreaming(accumulatedText);
            }
            if (data.done) {
              completeSummaryStreaming();
              let cleanedAccumulated = accumulatedText.trim();
              cleanedAccumulated = cleanedAccumulated.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
              let summaryData;
              try {
                const parsedData = JSON.parse(cleanedAccumulated);
                summaryData = {
                  success: true,
                  summary: parsedData.summary || '',
                  overview: parsedData.overview || '',
                  detailed_analysis: parsedData.detailed_analysis || '',
                  key_findings: parsedData.key_findings || [],
                  context_connections: parsedData.context_connections || '',
                  specific_details: parsedData.specific_details || [],
                  key_points: parsedData.key_findings || parsedData.key_points || [],
                  confidence: parsedData.confidence || 'medium',
                  citations: parsedData.citations || [],
                  query: query,
                  sources_used: searchResults.length,
                  model_used: 'gemma3:12b',
                  generation_time: 0,
                  timestamp: Date.now()
                };
              } catch (e) {
                summaryData = {
                  success: true,
                  summary: cleanStreamingText(accumulatedText),
                  query: query,
                  sources_used: searchResults.length,
                  model_used: 'gemma3:12b',
                  generation_time: 0,
                  timestamp: Date.now()
                };
              }
              saveSummaryToCache(query, searchResults, summaryData);
              updateSummaryUI(summaryData);
            }
          } catch (parseError) {
            console.error('Error parsing final streaming chunk:', parseError);
          }
        }
        
        return { success: true, summary: accumulatedText };
        
      } catch (error) {
        console.error('Streaming error:', error);
        console.log('Falling back to non-streaming summary generation');
        addNotification('warning', 'AI Summary Fallback', 'Streaming failed, retrying with standard generation.', false);
        // Fallback to non-streaming method
        return generateAISummary(query, searchResults, forceRefresh);
      }
    }

    // Show streaming summary state
    function showSummaryStreaming() {
      const summaryContainer = document.getElementById('ai-summary-container');
      const summaryContent = document.getElementById('ai-summary-content');
      const confidenceBadge = document.getElementById('confidence-badge');
      const sourcesPanel = document.getElementById('ai-summary-sources');
      
      // Show container
      summaryContainer.style.display = 'block';
      
      // Hide sources sidebar during streaming
      if (sourcesPanel) sourcesPanel.style.display = 'none';
      
      // Show streaming loading state
      summaryContent.innerHTML = `
        <div class="streaming-loading">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          Generating AI summary
          <div class="streaming-loading-dots">
            <div class="streaming-loading-dot"></div>
            <div class="streaming-loading-dot"></div>
            <div class="streaming-loading-dot"></div>
          </div>
        </div>
        <div class="streaming-text" id="streaming-text">
          <span class="streaming-cursor"></span>
        </div>
      `;
      
      // Hide confidence badge during streaming
      confidenceBadge.style.display = 'none';
    }

    // Helper: Simple HTML escaping
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Helper: Unescape JSON string content
    function unescapeJsonString(str) {
      return str.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\t/g, '\t');
    }

    // Build comprehensive summary from structured parsed data
    function buildComprehensiveSummary(parsedData) {
      let parts = [];
      if (parsedData.overview) parts.push('## Overview\n\n' + parsedData.overview);
      if (parsedData.detailed_analysis) parts.push('## Detailed Analysis\n\n' + parsedData.detailed_analysis);
      if (parsedData.key_findings && parsedData.key_findings.length) {
        parts.push('## Key Findings\n\n' + parsedData.key_findings.map(f => '- ' + f).join('\n'));
      }
      if (parsedData.context_connections) parts.push('## Context & Connections\n\n' + parsedData.context_connections);
      if (parsedData.specific_details && parsedData.specific_details.length) {
        parts.push('## Specific Details\n\n' + parsedData.specific_details.map(f => '- ' + f).join('\n'));
      }
      return parts.join('\n\n') || '';
    }

    // Build markdown from fully parsed JSON data
    function buildMarkdownFromParsed(parsed) {
      let sections = [];
      if (parsed.overview) sections.push('## Overview\n\n' + parsed.overview);
      if (parsed.detailed_analysis) sections.push('## Detailed Analysis\n\n' + parsed.detailed_analysis);
      if (parsed.key_findings && parsed.key_findings.length) {
        sections.push('## Key Findings\n\n' + parsed.key_findings.map(f => '- ' + f).join('\n'));
      }
      if (parsed.context_connections) sections.push('## Context & Connections\n\n' + parsed.context_connections);
      if (parsed.specific_details && parsed.specific_details.length) {
        sections.push('## Specific Details\n\n' + parsed.specific_details.map(d => '- ' + d).join('\n'));
      }
      if (sections.length > 0) return sections.join('\n\n');
      if (parsed.summary) return parsed.summary;
      return null;
    }

    // Clean streaming JSON text into readable prose for live display
    function cleanStreamingText(text) {
      // Remove ```json prefix and ``` suffix
      let cleaned = text.replace(/^[\s]*```json\s*/i, '').replace(/```[\s]*$/, '');

      // Try full JSON parse first
      try {
        const parsed = JSON.parse(cleaned);
        const md = buildMarkdownFromParsed(parsed);
        if (md) return md;
      } catch (e) { /* partial JSON, continue */ }

      // Strip leading { and trailing }
      cleaned = cleaned.replace(/^\s*\{\s*/, '').replace(/\s*\}\s*$/, '');

      // Replace JSON field labels with markdown headings
      const fieldMap = {
        'overview': '## Overview\n\n',
        'detailed_analysis': '## Detailed Analysis\n\n',
        'key_findings': '## Key Findings\n\n',
        'context_connections': '## Context & Connections\n\n',
        'specific_details': '## Specific Details\n\n',
        'confidence': '',
        'summary': ''
      };

      // Replace "field_name": with heading, handling the JSON key pattern
      for (const [field, heading] of Object.entries(fieldMap)) {
        // Match "field_name" : (with optional whitespace)
        const pattern = new RegExp('"' + field + '"\\s*:\\s*', 'g');
        cleaned = cleaned.replace(pattern, '\n\n' + heading);
      }

      // Clean up JSON array syntax: turn ["item1", "item2"] into bullet points
      cleaned = cleaned.replace(/\[\s*/g, '').replace(/\s*\]/g, '');

      // Remove remaining JSON artifacts
      cleaned = cleaned.replace(/,\s*$/gm, '');  // trailing commas
      cleaned = cleaned.replace(/^\s*,\s*/gm, ''); // leading commas

      // Unescape JSON strings
      cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\t/g, '\t');

      // Remove wrapping quotes from values (e.g. "some text" -> some text)
      // Match a quote at start of a line (after heading) and its closing quote
      cleaned = cleaned.replace(/^"([\s\S]*?)"\s*$/gm, '$1');
      // Also handle quotes that appear after headings
      cleaned = cleaned.replace(/(## [^\n]+\n\n)"([\s\S]*?)(?:"\s*$|"(?=\n\n##))/gm, '$1$2');
      // Clean any remaining orphan quotes at line boundaries
      cleaned = cleaned.replace(/^"/gm, '').replace(/"\s*$/gm, '');

      // Turn lines that start with "- text or just quoted strings in array context into bullets
      cleaned = cleaned.replace(/^\s*"([^"]+)"\s*$/gm, '- $1');

      // Clean up excessive blank lines
      cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
      cleaned = cleaned.trim();

      return cleaned || text;
    }

    // ChatGPT-style streaming markdown renderer
    function updateSummaryStreaming(text) {
      const streamingText = document.getElementById('streaming-text');
      if (!streamingText) return;

      // Clean the streaming text into readable markdown
      let displayText = cleanStreamingText(text);

      try {
        if (typeof marked !== 'undefined') {
          marked.setOptions({ breaks: true, gfm: true });

          // Parse markdown to HTML and append cursor
          let html = marked.parse(displayText);
          html += '<span class="streaming-cursor"></span>';
          streamingText.innerHTML = html;
        } else {
          streamingText.innerHTML = escapeHtml(displayText) + '<span class="streaming-cursor"></span>';
        }
      } catch (error) {
        streamingText.innerHTML = escapeHtml(displayText) + '<span class="streaming-cursor"></span>';
      }

      // Auto-scroll
      const container = streamingText.closest('.ai-summary-content, #ai-summary-content');
      if (container) container.scrollTop = container.scrollHeight;
      streamingText.scrollTop = streamingText.scrollHeight;
    }

    // Complete streaming summary - just remove cursor, content stays
    function completeSummaryStreaming() {
      const streamingText = document.getElementById('streaming-text');
      if (!streamingText) return;
      const cursor = streamingText.querySelector('.streaming-cursor');
      if (cursor) cursor.remove();
    }

    // Start periodic cleanup
    if (isCacheSupported()) {
      setInterval(cleanupOldCache, CACHE_CONFIG.CLEANUP_INTERVAL);
    }

    // Refresh summary with cache clearing
    async function refreshSummary() {
      if (!currentQuery || !currentResults) return;
      
      try {
        // Clear cache for this query and regenerate
        clearSummaryCache(currentQuery, currentResults);
        await generateStreamingSummary(currentQuery, currentResults, true);
      } catch (error) {
        console.error('Error refreshing summary:', error);
        showSummaryError('Failed to refresh summary');
      }
    }

    // Modify the existing renderResults function to include AI summary
    if (!window.originalRenderResults) {
      window.originalRenderResults = renderResults;
    }
    
    renderResults = function(results, query, totalHits, processingTime, page) {
      // Store current query and results for summary generation
      currentQuery = query;
      currentResults = results;
      
      // Call original renderResults
      window.originalRenderResults(results, query, totalHits, processingTime, page);
      
      // Generate AI summary if we have results and AI is enabled
      if (results.length > 0) {
        // Check if AI Search is enabled
        fetch('/api/ollama/status')
          .then(response => response.json())
          .then(data => {
            if (data.enabled && data.connected) {
              // Generate streaming summary in background (don't block UI)
              setTimeout(() => {
                generateStreamingSummary(query, results);
              }, 500); // Small delay to let results load first
            } else {
              hideSummary();
            }
          })
          .catch(error => {
            console.log('Could not check AI status:', error);
            hideSummary();
          });
      } else {
        hideSummary();
      }
    };

    // Add event listener for refresh button
    document.addEventListener('DOMContentLoaded', () => {
      const refreshBtn = document.getElementById('summary-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshSummary);
      }
    });

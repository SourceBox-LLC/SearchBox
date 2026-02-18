/* SearchBox — Document viewer page logic */

let documentData = null;
    
    // Get search context from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    let searchQuery = urlParams.get('q') || '';
    const searchPage = urlParams.get('page') || '1';
    
    // Handle encoded URLs by decoding if still contains any percent-encoded characters
    if (searchQuery.includes('%')) {
      searchQuery = decodeURIComponent(searchQuery);
    }

    async function loadDocument() {
      try {
        console.log('Loading document with docId:', docId);
        const response = await fetch(`/api/document/${docId}`);
        console.log('Document response status:', response.status);
        
        if (!response.ok) {
          console.error('Document fetch failed:', response.status, response.statusText);
          throw new Error('Document not found');
        }
        
        documentData = await response.json();
        console.log('Document data loaded:', documentData);
        renderDocument();
      } catch (error) {
        console.error('Error loading document:', error);
        renderError();
      }
    }

    function getFileTypeConfig(filename) {
      const ext = filename.split('.').pop().toLowerCase();
      const configs = {
        pdf: { icon: 'PDF', color: '#f85149', class: 'pdf' },
        docx: { icon: 'DOCX', color: '#58a6ff', class: 'docx' },
        doc: { icon: 'DOC', color: '#58a6ff', class: 'doc' },
        txt: { icon: 'TXT', color: '#d29922', class: 'txt' },
        md: { icon: 'MD', color: '#3fb950', class: 'md' },
        // Add image configurations
        jpg: { icon: 'IMG', color: '#3fb950', class: 'image' },
        jpeg: { icon: 'IMG', color: '#3fb950', class: 'image' },
        png: { icon: 'IMG', color: '#3fb950', class: 'image' },
        gif: { icon: 'IMG', color: '#3fb950', class: 'image' },
        webp: { icon: 'IMG', color: '#3fb950', class: 'image' },
        svg: { icon: 'IMG', color: '#3fb950', class: 'image' },
        bmp: { icon: 'IMG', color: '#3fb950', class: 'image' },
        zim: { icon: 'ZIM', color: '#2dd4bf', class: 'zim' },
        zip: { icon: 'ZIP', color: '#3fb950', class: 'zip' }
      };
      return configs[ext] || { icon: ext.toUpperCase(), color: '#8b949e', class: 'txt' };
    }

    function formatDate(dateStr) {
      if (!dateStr) return 'Unknown';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function renderDocument() {
      const main = document.getElementById('main-content');
      const config = getFileTypeConfig(documentData.filename);
      const isMarkdown = documentData.file_type === '.md';
      const isZim = documentData.file_type === '.zim';
      
      // Add image detection
      if (documentData.is_image) {
        renderImageDocument();
        return;
      }
      
      // ZIM article — render via dedicated function
      if (isZim) {
        renderZimArticle();
        return;
      }
      
      main.innerHTML = `
        <div class="document-container">
          <div class="document-card">
            <div class="document-header">
              <div class="document-header-left">
                <span class="document-type-badge ${config.class}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                  </svg>
                  ${config.icon}
                </span>
                <h1 class="document-title">${escapeHtml(documentData.filename)}</h1>
                <p class="document-path">${escapeHtml(documentData.file_path || 'Unknown path')}</p>
              </div>
              <button class="fullscreen-btn" id="fullscreen-btn" onclick="toggleFullscreen()" title="Toggle Fullscreen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="exit-fullscreen-icon" style="display: none;">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
              </button>
            </div>
            <div class="document-content" id="document-content">
              <!-- Dynamic content renderer based on file type -->
              ${documentData.file_type === '.pdf' ? `
                <div class="pdf-viewer">
                  <div class="pdf-controls">
                    <button id="prev-page" onclick="previousPage()">← Previous</button>
                    <button id="next-page" onclick="nextPage()">Next →</button>
                    <div class="pdf-zoom-controls">
                      <label>Zoom:</label>
                      <select id="zoom-select" onchange="updateZoom()">
                        <option value="0.5">50%</option>
                        <option value="0.75">75%</option>
                        <option value="1" selected>100%</option>
                        <option value="1.25">125%</option>
                        <option value="1.5">150%</option>
                        <option value="2">200%</option>
                        <option value="auto">Auto Fit</option>
                      </select>
                    </div>
                    <div class="pdf-page-info">
                      Page: <span id="page-num">1</span> / <span id="page-count">?</span>
                    </div>
                  </div>
                  <div class="pdf-canvas-container" id="pdf-canvas-container">
                    <div class="pdf-loading" id="pdf-loading">Loading PDF...</div>
                    <canvas id="pdf-canvas" style="display: none;"></canvas>
                  </div>
                </div>
              ` : documentData.file_type === '.docx' || documentData.file_type === '.doc' ? `
                <div class="docx-viewer">
                  <div class="docx-controls">
                    <div class="docx-zoom-controls">
                      <label>Zoom:</label>
                      <select id="docx-zoom-select" onchange="updateDOCXZoom()">
                        <option value="0.5">50%</option>
                        <option value="0.75">75%</option>
                        <option value="1" selected>100%</option>
                        <option value="1.25">125%</option>
                        <option value="1.5">150%</option>
                        <option value="2">200%</option>
                      </select>
                    </div>
                  </div>
                  <div class="docx-container" id="docx-container">
                    <div class="docx-loading" id="docx-loading">Loading document...</div>
                    <div id="docx-content" style="display: none;"></div>
                  </div>
                </div>
              ` : `
                ${isMarkdown ? `
                  <div class="markdown-content">${marked.parse(documentData.content || 'No content available')}</div>
                ` : `
                  <pre class="content-text">${escapeHtml(documentData.content || 'No content available')}</pre>
                `}
              `}
            </div>
          </div>
        </div>
        
        <aside class="sidebar">
          <div class="info-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Document Info
            </h3>
            <div class="info-row">
              <span class="info-label">Type</span>
              <span class="info-value">${documentData.file_type?.toUpperCase() || 'Unknown'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Size</span>
              <span class="info-value">${formatFileSize(documentData.file_size)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Source</span>
              <span class="info-value">
                <span class="source-badge ${documentData.source || 'folder'}">
                  ${documentData.source === 'vault' ? '🔒 Vault' : '📁 Folder'}
                </span>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Indexed</span>
              <span class="info-value">${formatDate(documentData.uploaded_at)}</span>
            </div>
          </div>
          
          <div class="info-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Quick Actions
            </h3>
            <div class="quick-actions">
              <button class="quick-action-btn" onclick="openFile()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in Default App
              </button>
              <button class="quick-action-btn" onclick="revealFile()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Show in File Manager
              </button>
              <button class="quick-action-btn" onclick="copyPath()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy File Path
              </button>
            </div>
          </div>
        </aside>
      `;
    }

    async function renderZimArticle() {
      const main = document.getElementById('main-content');
      const config = { icon: 'ZIM', color: '#2dd4bf', class: 'zim' };

      // Parse zim:// path to extract archive path and article URL
      const filePath = documentData.file_path || '';
      const zimMatch = filePath.match(/^zim:\/\/(.+?)#(.+)$/);
      const zimPath = zimMatch ? zimMatch[1] : '';
      const articleUrl = zimMatch ? zimMatch[2] : (documentData.zim_article_url || '');

      main.innerHTML = `
        <div class="document-container">
          <div class="document-card">
            <div class="document-header">
              <div class="document-header-left">
                <span class="document-type-badge" style="color: ${config.color}; border-color: ${config.color};">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  </svg>
                  ${config.icon}
                </span>
                <h1 class="document-title">${escapeHtml(documentData.filename)}</h1>
                <p class="document-path">${escapeHtml(filePath)}</p>
              </div>
              <button class="fullscreen-btn" id="fullscreen-btn" onclick="toggleFullscreen()" title="Toggle Fullscreen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="exit-fullscreen-icon" style="display: none;">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
              </button>
            </div>
            <div class="document-content" id="document-content">
              <div class="zim-loading" style="text-align:center; padding:40px; color:#8b949e;">Loading article...</div>
            </div>
          </div>
        </div>
        <aside class="sidebar">
          <div class="info-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Document Info
            </h3>
            <div class="info-row"><span class="info-label">Type</span><span class="info-value">ZIM Article</span></div>
            <div class="info-row"><span class="info-label">Size</span><span class="info-value">${formatFileSize(documentData.file_size)}</span></div>
            <div class="info-row"><span class="info-label">Source</span><span class="info-value">ZIM Archive</span></div>
            <div class="info-row"><span class="info-label">Indexed</span><span class="info-value">${formatDate(documentData.uploaded_at)}</span></div>
          </div>
        </aside>
      `;

      // Fetch and render the actual HTML article inside a sandboxed iframe
      if (zimPath && articleUrl) {
        try {
          const resp = await fetch(`/api/zim/article?path=${encodeURIComponent(zimPath)}&url=${encodeURIComponent(articleUrl)}`);
          if (resp.ok) {
            let html = await resp.text();
            // Rewrite image src to use our ZIM image proxy
            html = html.replace(/src=["']([^"']+)["']/g, (match, src) => {
              if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/')) return match;
              return `src="/api/zim/image?path=${encodeURIComponent(zimPath)}&img=${encodeURIComponent(src)}"`;
            });

            // Wrap in a full HTML document with dark-theme styling and link interception
            const iframeDoc = `<!DOCTYPE html>
<html><head><style>
  * { box-sizing: border-box; }
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.7; padding: 24px; margin: 0; word-wrap: break-word; }
  a { color: #2dd4bf; }
  img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #30363d; padding: 8px 12px; text-align: left; }
  th { background: #161b22; }
  h1, h2, h3, h4 { color: #f0f6fc; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
  pre, code { background: #161b22; padding: 2px 6px; border-radius: 4px; overflow-x: auto; }
  blockquote { border-left: 3px solid #2dd4bf; margin: 16px 0; padding: 8px 16px; color: #8b949e; }
  .mw-editsection, .noprint, .mw-jump-link, .navbox, .sistersitebox, .mw-authority-control { display: none !important; }
</style></head><body>${html}</body></html>`;

            const contentEl = document.getElementById('document-content');
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-same-origin';
            iframe.style.cssText = 'width:100%; border:none; min-height:600px;';
            iframe.srcdoc = iframeDoc;
            contentEl.innerHTML = '';
            contentEl.appendChild(iframe);

            // Auto-resize iframe to content height and intercept link clicks
            iframe.addEventListener('load', () => {
              try {
                const idoc = iframe.contentDocument;
                // Resize to fit content
                const resizeObserver = new ResizeObserver(() => {
                  iframe.style.height = idoc.documentElement.scrollHeight + 'px';
                });
                resizeObserver.observe(idoc.body);
                iframe.style.height = idoc.documentElement.scrollHeight + 'px';

                // Intercept all internal link clicks
                idoc.addEventListener('click', (e) => {
                  const link = e.target.closest('a');
                  if (!link) return;
                  e.preventDefault();
                  const href = link.getAttribute('href');
                  if (!href || href.startsWith('#')) return;
                  if (href.startsWith('http')) {
                    window.open(href, '_blank');
                  } else {
                    const articleName = href.split('#')[0].replace(/_/g, ' ').replace(/\.\.\//g, '');
                    window.location.href = `/?q=${encodeURIComponent(articleName)}::zim`;
                  }
                });
              } catch (err) {
                console.warn('Could not access iframe content:', err);
              }
            });
          } else {
            // Fallback to indexed text content
            document.getElementById('document-content').innerHTML = `
              <pre class="content-text">${escapeHtml(documentData.content || 'No content available')}</pre>`;
          }
        } catch (e) {
          console.error('Error loading ZIM article:', e);
          document.getElementById('document-content').innerHTML = `
            <pre class="content-text">${escapeHtml(documentData.content || 'No content available')}</pre>`;
        }
      } else {
        // No ZIM path info, show indexed text
        document.getElementById('document-content').innerHTML = `
          <pre class="content-text">${escapeHtml(documentData.content || 'No content available')}</pre>`;
      }
    }

    function renderImageDocument() {
      const main = document.getElementById('main-content');
      const config = getFileTypeConfig(documentData.filename);
      
      main.innerHTML = `
        <div class="image-container">
          <div class="image-header">
            <span class="document-type-badge ${config.class}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              ${config.icon}
            </span>
            <h1 class="document-title">${escapeHtml(documentData.filename)}</h1>
          </div>
          
          <div class="image-viewer">
            <div class="image-controls">
              <button class="control-btn" onclick="zoomImage(0.5)" title="Zoom Out">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <button class="control-btn" onclick="zoomImage(1)" title="Actual Size">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <button class="control-btn" onclick="zoomImage(2)" title="Zoom In">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </button>
              <button class="control-btn" onclick="fitToScreen()" title="Fit to Screen">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              </button>
            </div>
            <div class="image-display" id="image-display">
              <img src="/api/thumbnail/${documentData.id}" alt="${escapeHtml(documentData.filename)}" id="main-image" style="max-width: 100%; max-height: 70vh; object-fit: contain;">
            </div>
          </div>
        </div>
        
        <aside class="sidebar">
          <div class="info-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Image Info
            </h3>
            <div class="info-row">
              <span class="info-label">Type</span>
              <span class="info-value">${documentData.file_type?.toUpperCase() || 'Unknown'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Size</span>
              <span class="info-value">${formatFileSize(documentData.file_size)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Uploaded</span>
              <span class="info-value">${formatDate(documentData.uploaded_at)}</span>
            </div>
          </div>
          
          <div class="info-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Quick Actions
            </h3>
            <div class="quick-actions">
              <button class="quick-action-btn" onclick="openFile()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in Default App
              </button>
              <button class="quick-action-btn" onclick="revealFile()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Show in File Manager
              </button>
              <button class="quick-action-btn" onclick="copyPath()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy File Path
              </button>
            </div>
          </div>
        </aside>
      `;
    }

    function renderError() {
      const main = document.getElementById('main-content');
      main.innerHTML = `
        <div class="error-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <h2>Document Not Found</h2>
          <p>The document you're looking for doesn't exist or has been removed.</p>
          <a id="error-back-btn" href="/" class="action-btn primary" style="margin-top: 20px; text-decoration: none;">
            Back to Search
          </a>
        </div>
      `;
      
      // Update error back button too
      const errorBackBtn = document.getElementById('error-back-btn');
      if (searchQuery) {
        errorBackBtn.href = `/?q=${encodeURIComponent(searchQuery)}&page=${searchPage}`;
      } else {
        errorBackBtn.href = '/';
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    async function openFile() {
      try {
        const vaultPin = sessionStorage.getItem('vaultPin');
        await authFetch(`/api/document/${docId}/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: vaultPin || '' })
        });
      } catch (error) {
        console.error('Failed to open file:', error);
      }
    }

    async function revealFile() {
      try {
        await authFetch(`/api/document/${docId}/reveal`, { method: 'POST' });
      } catch (error) {
        console.error('Failed to reveal file:', error);
      }
    }

    function copyPath() {
      if (documentData?.file_path) {
        navigator.clipboard.writeText(documentData.file_path);
        // Brief visual feedback
        const btn = event.target.closest('.quick-action-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied!
        `;
        setTimeout(() => btn.innerHTML = originalText, 1500);
      }
    }

    // Image control functions
    function zoomImage(scale) {
      const img = document.getElementById('main-image');
      if (img) {
        img.style.transform = `scale(${scale})`;
        img.style.transformOrigin = 'center';
      }
    }

    function fitToScreen() {
      const img = document.getElementById('main-image');
      if (img) {
        img.style.transform = 'none';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '70vh';
      }
    }

    
    // Header button handlers
    document.getElementById('open-btn').addEventListener('click', openFile);
    document.getElementById('reveal-btn').addEventListener('click', revealFile);

    // Update back button link based on search context
    function updateBackButton() {
      const backBtn = document.getElementById('back-to-search');
      if (searchQuery) {
        const encodedQuery = encodeURIComponent(searchQuery);
        const backUrl = `/?q=${encodedQuery}&page=${searchPage}`;
        backBtn.href = backUrl;
      } else {
        backBtn.href = '/';
      }
    }

    // PDF Rendering Functions
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.0;
    let canvas = null;
    let ctx = null;

    function initPDFViewer() {
      if (documentData.file_type !== '.pdf') return;
      
      canvas = document.getElementById('pdf-canvas');
      ctx = canvas.getContext('2d');
      
      // Load PDF document
      loadPDF();
    }

    function loadPDF() {
      console.log('docId variable:', docId);
      console.log('docId type:', typeof docId);
      const vaultPin = sessionStorage.getItem('vaultPin');
      const url = `/api/pdf/${docId}`;
      const headers = {};
      if (vaultPin) {
        headers['X-Vault-PIN'] = vaultPin;
      }
      console.log('Loading PDF from:', url);
      console.log('Full URL should be:', window.location.origin + url);
      
      // Show loading
      showLoading();
      
      // Add timeout to detect stuck loading
      const loadingTimeout = setTimeout(() => {
        console.warn('PDF loading taking too long, showing timeout message');
        showPDFError('PDF loading timeout - the file might be too large or the server is busy');
      }, 30000); // 30 second timeout
      
      // Fetch PDF with PIN in header (not URL) then pass ArrayBuffer to pdf.js
      fetch(url, { headers }).then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.arrayBuffer();
      }).then(data => {
        return pdfjsLib.getDocument({ data }).promise;
      }).then(function(pdfDoc_) {
        clearTimeout(loadingTimeout);
        console.log('PDF loaded successfully, pages:', pdfDoc_.numPages);
        pdfDoc = pdfDoc_;
        document.getElementById('page-count').textContent = pdfDoc.numPages;
        
        // Initial/first page rendering
        renderPage(pageNum);
      }).catch(function(error) {
        clearTimeout(loadingTimeout);
        console.error('Error loading PDF:', error);
        console.error('PDF loading error details:', error.name, error.message);
        
        // Show more detailed error
        let errorMessage = 'Failed to load PDF';
        if (error.name === 'UnexpectedResponseException') {
          errorMessage = 'PDF file not found or server error';
        } else if (error.name === 'InvalidPDFException') {
          errorMessage = 'Invalid or corrupted PDF file';
        } else if (error.name === 'PasswordException') {
          errorMessage = 'PDF is password protected';
        } else if (error.name === 'MissingPDFException') {
          errorMessage = 'PDF file is missing';
        }
        
        showPDFError(errorMessage + ': ' + error.message);
      });
    }

    function renderPage(num) {
      pageRendering = true;
      
      pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({scale: scale});
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        
        const renderTask = page.render(renderContext);

        renderTask.promise.then(function() {
          pageRendering = false;
          
          if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
          }
          
          updatePageInfo();
          hideLoading();
        });
      });

      document.getElementById('page-num').textContent = num;
    }

    function queueRenderPage(num) {
      if (pageRendering) {
        pageNumPending = num;
      } else {
        renderPage(num);
      }
    }

    function previousPage() {
      if (pageNum <= 1) return;
      pageNum--;
      queueRenderPage(pageNum);
    }

    function nextPage() {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      queueRenderPage(pageNum);
    }

    function updateZoom() {
      const zoomSelect = document.getElementById('zoom-select');
      const newScale = zoomSelect.value;
      
      if (newScale === 'auto') {
        // Auto fit to container width
        const containerWidth = document.getElementById('pdf-canvas-container').clientWidth - 40;
        if (pdfDoc) {
          pdfDoc.getPage(pageNum).then(function(page) {
            const viewport = page.getViewport({scale: 1});
            scale = containerWidth / viewport.width;
            queueRenderPage(pageNum);
          });
        }
      } else {
        scale = parseFloat(newScale);
        queueRenderPage(pageNum);
      }
    }

    function updatePageInfo() {
      document.getElementById('prev-page').disabled = pageNum <= 1;
      document.getElementById('next-page').disabled = pageNum >= pdfDoc.numPages;
    }

    function showLoading() {
      document.getElementById('pdf-loading').style.display = 'block';
      document.getElementById('pdf-canvas').style.display = 'none';
    }

    function hideLoading() {
      document.getElementById('pdf-loading').style.display = 'none';
      document.getElementById('pdf-canvas').style.display = 'block';
    }

    function showPDFError(message) {
      document.getElementById('pdf-canvas-container').innerHTML = `
        <div class="pdf-error">
          <div>⚠️ PDF Error</div>
          <div>${message}</div>
        </div>
      `;
    }

    // DOCX Rendering Functions
    let docxScale = 1.0;

    function initDOCXViewer() {
      if (documentData.file_type !== '.docx' && documentData.file_type !== '.doc') return;
      
      loadDOCX();
    }

    function loadDOCX() {
      const vaultPin = sessionStorage.getItem('vaultPin');
      const url = `/api/docx/${docId}`;
      const headers = {};
      if (vaultPin) {
        headers['X-Vault-PIN'] = vaultPin;
      }
      
      // Show loading
      showDOCXLoading();
      
      // Add timeout to detect stuck loading
      const loadingTimeout = setTimeout(() => {
        showDOCXError('Document loading timeout - the file might be too large or the server is busy');
      }, 30000); // 30 second timeout
      
      // Fetch the actual binary DOCX file with PIN in header
      fetch(url, { headers })
        .then(response => {
          clearTimeout(loadingTimeout);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          renderDOCX(arrayBuffer);
        })
        .catch(error => {
          clearTimeout(loadingTimeout);
          
          let errorMessage = 'Failed to load document';
          if (error.message.includes('404')) {
            errorMessage = 'Document not found';
          } else if (error.message.includes('500')) {
            errorMessage = 'Server error';
          }
          
          showDOCXError(errorMessage + ': ' + error.message);
        });
    }

    
    function renderDOCX(arrayBuffer) {
      const docxContainer = document.getElementById('docx-content');
      
      try {
        // Clear container first
        docxContainer.innerHTML = '';
        
        // Render DOCX using docx-preview for true document rendering
        docx.renderAsync(arrayBuffer, docxContainer, null, {
          className: 'docx-preview-container',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: false,
          renderChanges: false,
          renderComments: false,
          renderFootnotes: true,
          renderEndnotes: true,
          renderHeaderFooter: true,
          debug: false,
          experimental: false,
          useMathMLPolyfill: false,
          showChanges: false,
          ignoreLastRenderedPageBreak: true
        }).then(() => {
          hideDOCXLoading();
          applyDOCXZoom();
        }).catch(function(error) {
          showDOCXError('Failed to render document: ' + error.message);
        });
      } catch (error) {
        showDOCXError('Document rendering failed: ' + error.message);
      }
    }

    function updateDOCXZoom() {
      const zoomSelect = document.getElementById('docx-zoom-select');
      const newScale = parseFloat(zoomSelect.value);
      
      docxScale = newScale;
      applyDOCXZoom();
    }

    function applyDOCXZoom() {
      const docxContent = document.getElementById('docx-content');
      if (docxContent) {
        docxContent.style.transform = `scale(${docxScale})`;
        docxContent.style.width = docxScale === 1 ? 'auto' : `${100 / docxScale}%`;
      }
    }

    function showDOCXLoading() {
      document.getElementById('docx-loading').style.display = 'block';
      document.getElementById('docx-content').style.display = 'none';
    }

    function hideDOCXLoading() {
      document.getElementById('docx-loading').style.display = 'none';
      document.getElementById('docx-content').style.display = 'block';
    }

    function showDOCXError(message) {
      document.getElementById('docx-container').innerHTML = `
        <div class="docx-error">
          <div>⚠️ Document Error</div>
          <div>${message}</div>
        </div>
      `;
    }

    // Load document on page load
    loadDocument().then(() => {
      updateBackButton();
      
      // Check if docx-preview library is loaded
      if (typeof docx === 'undefined') {
        const script = document.createElement('script');
        script.src = '/static/docx-preview.min.js';
        script.onload = () => {
          initializeViewer();
        };
        script.onerror = () => {
          showDOCXError('Failed to load document viewer library');
        };
        document.head.appendChild(script);
      } else {
        initializeViewer();
      }
      
      function initializeViewer() {
        // Initialize appropriate viewer based on file type
        if (documentData.file_type === '.pdf') {
          initPDFViewer();
        } else if (documentData.file_type === '.docx' || documentData.file_type === '.doc') {
          initDOCXViewer();
        }
      }
    });

    // Fullscreen functionality
    function toggleFullscreen() {
      const documentCard = document.querySelector('.document-card');
      const fullscreenBtn = document.getElementById('fullscreen-btn');
      const enterIcon = fullscreenBtn.querySelector('svg:not(.exit-fullscreen-icon)');
      const exitIcon = fullscreenBtn.querySelector('.exit-fullscreen-icon');
      
      if (documentCard.classList.contains('fullscreen-mode')) {
        // Exit fullscreen
        documentCard.classList.remove('fullscreen-mode');
        enterIcon.style.display = 'block';
        exitIcon.style.display = 'none';
        fullscreenBtn.title = 'Enter Fullscreen';
        
        // Restore scroll position
        if (window.originalScrollY) {
          window.scrollTo(0, window.originalScrollY);
          delete window.originalScrollY;
        }
      } else {
        // Enter fullscreen
        window.originalScrollY = window.scrollY;
        documentCard.classList.add('fullscreen-mode');
        enterIcon.style.display = 'none';
        exitIcon.style.display = 'block';
        fullscreenBtn.title = 'Exit Fullscreen';
        
        // Scroll to top in fullscreen mode
        window.scrollTo(0, 0);
      }
    }

    // Keyboard shortcut for fullscreen (F11 or Esc)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        const documentCard = document.querySelector('.document-card');
        if (documentCard.classList.contains('fullscreen-mode')) {
          toggleFullscreen();
        }
      }
    });

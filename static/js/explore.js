/* SearchBox — Explore page logic */

// Meilisearch client (config injected from backend via template)
const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY
});
const documentsIndex = meiliClient.index('documents');

// State
const BATCH_SIZE = 40;
let currentFilter = 'all';
let currentSort = 'recent';
let offset = 0;
let isLoading = false;
let allLoaded = false;

// File type icon SVGs
const FILE_ICONS = {
  pdf: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>`,
  doc: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
  </svg>`,
  text: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>`,
  image: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>`
};

// Image file types
const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];

// Build Meilisearch filter string
function buildFilter() {
  if (currentFilter === 'all') return undefined;
  if (currentFilter === 'image') {
    return IMAGE_TYPES.map(t => `file_type = "${t}"`).join(' OR ');
  }
  return `file_type = "${currentFilter}"`;
}

// Build sort array
function buildSort() {
  switch (currentSort) {
    case 'name': return ['filename:asc'];
    case 'size': return ['file_size:desc'];
    case 'recent':
    default: return ['uploaded_at:desc'];
  }
}

// Fetch documents from Meilisearch
async function fetchDocuments(append = false) {
  if (isLoading || (append && allLoaded)) return;

  isLoading = true;

  if (!append) {
    offset = 0;
    allLoaded = false;
    document.getElementById('explore-grid').innerHTML = '';
    document.getElementById('explore-loading').style.display = 'block';
    document.getElementById('explore-empty').style.display = 'none';
  } else {
    document.getElementById('scroll-loading').style.display = 'block';
  }

  try {
    const searchOptions = {
      limit: BATCH_SIZE,
      offset: offset,
      sort: buildSort()
    };

    const filter = buildFilter();
    if (filter) searchOptions.filter = filter;

    const results = await documentsIndex.search('', searchOptions);
    const hits = results.hits;
    const total = results.estimatedTotalHits;

    // Update count
    document.getElementById('doc-count').textContent = `${total.toLocaleString()} document${total !== 1 ? 's' : ''}`;

    if (!append && hits.length === 0) {
      document.getElementById('explore-empty').style.display = 'block';
    } else {
      renderCards(hits, append);
    }

    offset += hits.length;
    if (hits.length < BATCH_SIZE) {
      allLoaded = true;
    }
  } catch (error) {
    console.error('Error fetching documents:', error);
    if (!append) {
      document.getElementById('explore-grid').innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #f85149;">
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Failed to load documents</div>
          <div style="font-size: 14px; color: #8b949e;">${error.message || 'Check that Meilisearch is running.'}</div>
        </div>
      `;
    }
  } finally {
    isLoading = false;
    document.getElementById('explore-loading').style.display = 'none';
    document.getElementById('scroll-loading').style.display = 'none';
  }
}

// Get the first usable thumbnail for a document
function getThumbnail(doc) {
  if (doc.first_image) return doc.first_image;
  if (doc.all_images && doc.all_images.length > 0) {
    const img = doc.all_images[0];
    if (typeof img === 'string') return img;
    if (img.thumbnail || img.path) return img.thumbnail || img.path;
  }
  return null;
}

// Get source label
function getSourceInfo(doc) {
  const source = doc.source || '';
  if (source === 'vault') return { label: '🔒 Vault', cls: 'vault' };
  if (source === 'qbittorrent') return { label: '⬇ Torrent', cls: 'qbittorrent' };
  if (source === 'zim') return { label: '📚 ZIM', cls: 'zim' };
  if (source === 'zip') return { label: '📦 ZIP', cls: 'zip' };
  return { label: '📁 Folder', cls: 'folder' };
}

// Normalize file type for badge
function normalizeType(fileType) {
  if (!fileType) return 'default';
  const t = fileType.toLowerCase().replace('.', '');
  return t || 'default';
}

// Get a short content snippet
function getSnippet(content, maxLen) {
  if (!content) return '';
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '…';
}

// Render cards into the grid
function renderCards(docs, append) {
  const grid = document.getElementById('explore-grid');

  docs.forEach(doc => {
    const card = document.createElement('div');
    card.className = 'explore-card';
    card.onclick = () => {
      window.location.href = `/view/${doc.id}`;
    };

    const thumbnail = getThumbnail(doc);
    const type = normalizeType(doc.file_type);
    const sourceInfo = getSourceInfo(doc);
    const isImage = IMAGE_TYPES.includes(type);

    // Build card body
    let bodyHTML = '';

    if (thumbnail) {
      // Use medium thumbnail for better quality
      let thumbSrc = thumbnail;
      if (thumbSrc.includes('.jpg')) {
        if (thumbSrc.includes('_small.jpg')) thumbSrc = thumbSrc.replace('_small.jpg', '_large.jpg');
        else if (thumbSrc.includes('_medium.jpg')) thumbSrc = thumbSrc.replace('_medium.jpg', '_large.jpg');
      } else {
        if (thumbSrc.includes('_small.webp')) thumbSrc = thumbSrc.replace('_small.webp', '_large.webp');
        else if (thumbSrc.includes('_medium.webp')) thumbSrc = thumbSrc.replace('_medium.webp', '_large.webp');
      }
      bodyHTML = `
        <div class="card-thumbnail">
          <img src="${thumbSrc}" alt="${doc.filename || ''}" loading="lazy"
               onerror="if(this.src.includes('.jpg')){if(this.src.includes('_large.jpg')){this.src=this.src.replace('_large.jpg','_medium.jpg')}else if(this.src.includes('_medium.jpg')){this.src=this.src.replace('_medium.jpg','_small.jpg')}else{this.parentElement.innerHTML='<div class=\\'card-icon\\'><div class=\\'file-type-icon\\'><span class=\\'icon-ext ${type}\\'>${type.toUpperCase()}</span></div></div>'}}else{if(this.src.includes('_large.webp')){this.src=this.src.replace('_large.webp','_medium.webp')}else if(this.src.includes('_medium.webp')){this.src=this.src.replace('_medium.webp','_small.webp')}else{this.parentElement.innerHTML='<div class=\\'card-icon\\'><div class=\\'file-type-icon\\'><span class=\\'icon-ext ${type}\\'>${type.toUpperCase()}</span></div></div>'}}">
        </div>
      `;
    } else if (isImage && doc.file_path) {
      // Image file without extracted thumbnail — try to load via local-image endpoint
      bodyHTML = `
        <div class="card-thumbnail">
          <img src="/local-image/${encodeURIComponent(doc.file_path)}" alt="${doc.filename || ''}" loading="lazy"
               onerror="this.parentElement.innerHTML='<div class=\\'card-icon\\'><div class=\\'file-type-icon\\'><span class=\\'icon-ext ${type}\\'>${type.toUpperCase()}</span></div></div>'">
        </div>
      `;
    } else {
      // No thumbnail — show icon + snippet
      const icon = FILE_ICONS[isImage ? 'image' : (type === 'pdf' ? 'pdf' : (['docx', 'doc'].includes(type) ? 'doc' : 'text'))];
      const snippet = getSnippet(doc.content, 120);
      bodyHTML = `
        <div class="card-icon">
          <div class="file-type-icon">
            <span class="icon-ext ${type}">${icon}</span>
          </div>
        </div>
        ${snippet ? `<div class="card-snippet">${snippet}</div>` : ''}
      `;
    }

    // Card footer
    const sizeStr = doc.file_size ? formatFileSize(doc.file_size) : '';

    card.innerHTML = `
      ${bodyHTML}
      <div class="card-info">
        <div class="card-title" title="${doc.filename || ''}">${doc.filename || 'Untitled'}</div>
        <div class="card-meta">
          <span class="card-type-badge ${type}">${type.toUpperCase()}</span>
          ${sizeStr ? `<span class="card-size">${sizeStr}</span>` : ''}
          <span class="card-source ${sourceInfo.cls}">${sourceInfo.label}</span>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Filter pills
document.getElementById('filter-pills').addEventListener('click', (e) => {
  const pill = e.target.closest('.filter-pill');
  if (!pill) return;

  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');

  currentFilter = pill.dataset.filter;
  fetchDocuments(false);
});

// Sort select
document.getElementById('sort-select').addEventListener('change', (e) => {
  currentSort = e.target.value;
  fetchDocuments(false);
});

// Infinite scroll
window.addEventListener('scroll', () => {
  if (allLoaded || isLoading) return;
  const scrollBottom = window.innerHeight + window.scrollY;
  const docHeight = document.documentElement.scrollHeight;
  if (scrollBottom >= docHeight - 400) {
    fetchDocuments(true);
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchDocuments(false);
});

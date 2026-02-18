/* SearchBox — Image search page logic */

// Meilisearch client (config injected from backend via template)
    const meiliClient = new MeiliSearch({
      host: MEILI_HOST,
      apiKey: MEILI_API_KEY
    });
    const documentsIndex = meiliClient.index('documents');

    // Global variables
    let currentQuery = '';
    let currentPage = 1;
    let totalHits = 0;
    let isLoading = false;

    // Get URL parameters
    function getUrlParams() {
      const params = new URLSearchParams(window.location.search);
      return {
        query: params.get('q') || '',
        source: params.get('source') || 'search',
        page: parseInt(params.get('page')) || 1
      };
    }

    // Update page title based on search source
    function updatePageTitle(query, source) {
      const title = document.querySelector('title');
      if (source === 'direct') {
        title.textContent = `Image Search: ${query} - SearchBox`;
      } else {
        title.textContent = `Image Search - SearchBox`;
      }
    }

    // Update URL
    function updateUrl(query, page) {
      const url = `/images?q=${encodeURIComponent(query)}&source=gallery&page=${page}`;
      window.history.pushState({ query, page }, '', url);
    }

    // Search images function
    async function searchImages(query, page = 1) {
      if (isLoading) return;
      
      isLoading = true;
      showLoading();
      
      try {
        const searchOptions = {
          limit: 50, // More images per page for gallery view
          offset: (page - 1) * 50,
          filter: 'has_images = true',
          attributesToHighlight: ['filename', 'content']
        };
        
        const searchResults = await documentsIndex.search(query, searchOptions);
        const images = collectImagesFromResults(searchResults.hits);
        
        totalHits = searchResults.estimatedTotalHits;
        currentQuery = query;
        currentPage = page;
        
        renderImages(images);
        renderPagination();
        updateResultsInfo(images.length, totalHits);
        
        if (images.length === 0) {
          showEmptyState();
        } else {
          hideEmptyState();
        }
        
      } catch (error) {
        console.error('Error searching images:', error);
        showError('Failed to search images. Please try again.');
      } finally {
        isLoading = false;
        hideLoading();
      }
    }

    // Collect images from results (reuse existing function)
    function collectImagesFromResults(results) {
      const allImages = [];
      
      results.forEach(result => {
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
              docType: result.file_type || result.fileType,
              imageIndex: imageIndex,
              isPdfPage: isPdfPage,
              isMarkdownImage: isMarkdownImage
            });
          });
        }
      });
      
      return allImages;
    }

    // Render images
    function renderImages(images) {
      const gallery = document.getElementById('image-gallery');
      gallery.innerHTML = '';
      
      images.forEach((image, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item';
        imageItem.onclick = () => handleImageClick(image);
        
        const img = document.createElement('img');
        img.src = image.src;
        img.alt = `${image.docName} - ${image.isPdfPage ? 'Page' : image.isMarkdownImage ? 'Image' : 'Image'} ${image.imageIndex}`;
        img.loading = 'lazy';
        
        const overlay = document.createElement('div');
        overlay.className = 'image-overlay';
        overlay.innerHTML = `
          <div class="image-title">${image.docName}</div>
          <div class="image-meta">
            <span class="file-type-badge">${image.docType.toUpperCase().replace('.', '')}</span>
            <span>${image.isPdfPage ? 'Page' : image.isMarkdownImage ? 'Image' : 'Image'} ${image.imageIndex}</span>
          </div>
        `;
        
        imageItem.appendChild(img);
        imageItem.appendChild(overlay);
        gallery.appendChild(imageItem);
      });
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

      imagePreviewModal.classList.add('active');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      modalImage.style.opacity = '0';

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
      modalImage.alt = `${image.docName} - ${image.isPdfPage ? 'Page' : 'Image'} ${image.imageIndex}`;

      modalTitle.textContent = image.docName;
      modalFileType.textContent = (image.docType || '').toUpperCase().replace('.', '');
      modalImageNumber.textContent = `${image.isPdfPage ? 'Page' : 'Image'} ${image.imageIndex}`;

      modalImage.onload = () => {
        modalImage.style.transition = 'opacity 0.3s ease';
        modalImage.style.opacity = '1';
      };

      modalImage.onerror = () => {
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
      };
    }

    // Close image modal
    function closeImageModal() {
      imagePreviewModal.classList.remove('active');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
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

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && imagePreviewModal.classList.contains('active')) {
        closeImageModal();
      }
    });

    // Render pagination
    function renderPagination() {
      const pagination = document.getElementById('pagination');
      const totalPages = Math.ceil(totalHits / 50);
      
      if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
      }
      
      let paginationHTML = '';
      
      // Previous button
      paginationHTML += `
        <button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      `;
      
      // Page numbers
      const maxVisiblePages = 10;
      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      
      for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
          <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>
        `;
      }
      
      // Next button
      paginationHTML += `
        <button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
          Next
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      `;
      
      pagination.innerHTML = paginationHTML;
    }

    // Go to page
    function goToPage(page) {
      if (page < 1 || page > Math.ceil(totalHits / 50) || isLoading) return;
      
      updateUrl(currentQuery, page);
      searchImages(currentQuery, page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update results info
    function updateResultsInfo(count, total) {
      const resultsInfo = document.getElementById('results-info');
      const resultsCount = document.getElementById('results-count');
      
      resultsCount.textContent = total.toLocaleString();
      resultsInfo.style.display = 'flex';
    }

    // Loading states
    function showLoading() {
      document.getElementById('loading').style.display = 'block';
      document.getElementById('image-gallery').style.display = 'none';
    }

    function hideLoading() {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('image-gallery').style.display = 'grid';
    }

    // Empty state
    function showEmptyState() {
      document.getElementById('empty-state').style.display = 'block';
      document.getElementById('image-gallery').style.display = 'none';
    }

    function hideEmptyState() {
      document.getElementById('empty-state').style.display = 'none';
      document.getElementById('image-gallery').style.display = 'grid';
    }

    // Error handling
    function showError(message) {
      const gallery = document.getElementById('image-gallery');
      gallery.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #f85149;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Error</div>
          <div style="font-size: 14px;">${message}</div>
        </div>
      `;
    }

    // Search input handling
    const searchInput = document.getElementById('search-input');
    
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          updateUrl(query, 1);
          searchImages(query, 1);
        }
      }
    });

    // Initialize page
    function initializePage() {
      const params = getUrlParams();
      
      // Update page title based on source
      updatePageTitle(params.query, params.source);
      
      if (params.query) {
        searchInput.value = params.query;
        searchImages(params.query, params.page);
      } else {
        showEmptyState();
      }
    }

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      const params = getUrlParams();
      searchInput.value = params.query;
      searchImages(params.query, params.page);
    });

    // Initialize when page loads
    document.addEventListener('DOMContentLoaded', initializePage);

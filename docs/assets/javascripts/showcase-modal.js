(() => {
  let activeDetails = null;
  let modalElement = null;
  let modalContent = null;

  // Zoom/pan state variables
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  function initShowcaseModal() {
    const grid = document.querySelector('.fc-showcase-grid');
    if (!grid) return;

    // Create the modal element if it doesn't exist yet
    modalElement = document.getElementById('fc-showcase-modal');
    if (!modalElement) {
      modalElement = document.createElement('div');
      modalElement.id = 'fc-showcase-modal';
      modalElement.className = 'fc-modal';
      modalElement.innerHTML = `
        <div class="fc-modal-overlay"></div>
        <div class="fc-modal-container">
          <button class="fc-modal-close" aria-label="Close modal">&times;</button>
          <div class="fc-modal-content"></div>
        </div>
      `;
      document.body.appendChild(modalElement);

      // Event listeners for closing the modal
      modalElement.querySelector('.fc-modal-close').addEventListener('click', closeModal);
      modalElement.querySelector('.fc-modal-overlay').addEventListener('click', closeModal);
    }

    modalContent = modalElement.querySelector('.fc-modal-content');

    // Attach click listeners to all showcase cards, avoiding duplicates
    const cards = grid.querySelectorAll('.fc-showcase-card');
    cards.forEach(card => {
      if (card.dataset.showcaseBound) return;
      card.dataset.showcaseBound = "true";

      card.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(card);
      });
    });
  }

  function openModal(card) {
    const index = card.getAttribute('data-index');
    const details = document.getElementById(`fc-showcase-detail-${index}`);
    if (!details || !modalElement || !modalContent) return;

    // Save active state reference
    activeDetails = details;

    // Extract compiled image source from the preview container
    const previewImg = card.querySelector('.fc-showcase-card-preview img');
    const imgSrc = previewImg ? previewImg.getAttribute('src') : '';
    const imgAlt = previewImg ? previewImg.getAttribute('alt') : '';

    // Build the image column
    const imgCol = document.createElement('div');
    imgCol.className = 'fc-modal-image-col';
    
    let img = null;
    if (imgSrc) {
      img = document.createElement('img');
      img.src = imgSrc;
      img.alt = imgAlt;
      imgCol.appendChild(img);
    }

    // Build the information/code column - include 'md-typeset' class for theme styling
    const infoCol = document.createElement('div');
    infoCol.className = 'fc-modal-info-col md-typeset';

    // Move all compiled markdown children from details into infoCol
    while (details.firstChild) {
      infoCol.appendChild(details.firstChild);
    }

    // Clear modal and append new layout columns
    modalContent.innerHTML = '';
    modalContent.appendChild(imgCol);
    modalContent.appendChild(infoCol);

    // Open modal and lock page scroll on both html and body
    modalElement.classList.add('is-active');
    document.documentElement.classList.add('fc-modal-open');
    document.body.classList.add('fc-modal-open');

    // Initialize zoom/pan controls on the modal image
    if (img) {
      initZoomPan(img, imgCol);
    }
  }

  function closeModal() {
    if (!activeDetails || !modalElement || !modalContent) return;

    const infoCol = modalContent.querySelector('.fc-modal-info-col');
    if (infoCol) {
      // Move all elements back to the original hidden details container
      while (infoCol.firstChild) {
        activeDetails.appendChild(infoCol.firstChild);
      }
    }

    // Clear modal
    modalContent.innerHTML = '';

    // Close modal and unlock page scroll
    modalElement.classList.remove('is-active');
    document.documentElement.classList.remove('fc-modal-open');
    document.body.classList.remove('fc-modal-open');

    // Reset references and zoom state
    activeDetails = null;
    resetZoomState();
  }

  // Zoom and Pan interaction logic
  function resetZoomState() {
    scale = 1;
    panX = 0;
    panY = 0;
    isDragging = false;
  }

  function initZoomPan(img, container) {
    resetZoomState();
    
    img.style.transform = 'translate(0px, 0px) scale(1)';
    img.style.cursor = 'zoom-in';

    // 1. Mouse Wheel Zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const zoomFactor = 0.15;
      const oldScale = scale;
      
      if (e.deltaY < 0) {
        scale = Math.min(scale + zoomFactor, 5);
      } else {
        scale = Math.max(scale - zoomFactor, 1);
      }

      if (scale === 1) {
        panX = 0;
        panY = 0;
        img.style.cursor = 'zoom-in';
      } else {
        img.style.cursor = 'grab';
        
        // Keep zoom centered on cursor location (approximate)
        if (scale !== oldScale) {
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left - rect.width / 2;
          const mouseY = e.clientY - rect.top - rect.height / 2;
          panX -= mouseX * (scale - oldScale) / oldScale;
          panY -= mouseY * (scale - oldScale) / oldScale;
        }
      }

      updateTransform(img, true);
    }, { passive: false });

    // 2. Drag to Pan
    container.addEventListener('mousedown', (e) => {
      if (scale <= 1) return; // Only pan when zoomed in
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      img.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform(img, false); // Instant tracking, no transition delay
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        img.style.cursor = 'grab';
      }
    });

    // 3. Double click to toggle full zoom
    container.addEventListener('dblclick', (e) => {
      if (scale > 1) {
        resetZoomState();
        img.style.cursor = 'zoom-in';
      } else {
        scale = 2.5;
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;
        panX = -mouseX * 1.5;
        panY = -mouseY * 1.5;
        img.style.cursor = 'grab';
      }
      updateTransform(img, true);
    });
  }

  function updateTransform(img, smooth) {
    if (!img) return;
    img.style.transition = smooth ? 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none';
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  // Handle Escape keypress to close active modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalElement && modalElement.classList.contains('is-active')) {
      closeModal();
    }
  });

  // Integrates with MkDocs Material's SPA navigation lifecycle
  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(() => {
      initShowcaseModal();
    });
  }

  // Fallback for standard load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShowcaseModal);
  } else {
    initShowcaseModal();
  }
})();

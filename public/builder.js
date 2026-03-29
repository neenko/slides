// ===================== STATE =====================
let slideshow = { id: null, title: 'Untitled Slideshow', slides: [] };
let dragInfo = null; // { type: 'slide'|'asset', slideId, assetId? }
let dirty = false;

// ===================== UTILS =====================
function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function assetType(url) {
  const clean = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|ogg|mov|avi|mkv)$/.test(clean)) return 'video';
  return 'image';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setDirty() {
  dirty = true;
  document.getElementById('save-status').textContent = 'Unsaved changes';
}

function clearAllDropClasses() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-target').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-target');
  });
  document.querySelectorAll('.drop-indicator-before, .drop-indicator-after').forEach(el => {
    el.classList.remove('drop-indicator-before', 'drop-indicator-after');
  });
}

// ===================== INIT =====================
async function init() {
  // Determine if editing existing or creating new
  const pathParts = location.pathname.split('/');
  // /builder/:id  → last part is the id
  // /builder.html → no id
  const lastPart = pathParts[pathParts.length - 1];
  const isNewPage = lastPart === 'builder.html' || lastPart === 'builder' || lastPart === '';

  const titleInput = document.getElementById('title-input');

  if (!isNewPage && lastPart) {
    // Try to load existing slideshow
    try {
      const res = await fetch(`/api/slideshows/${lastPart}`);
      if (res.ok) {
        const data = await res.json();
        slideshow = data;
        titleInput.value = slideshow.title;
        showSavedUI(slideshow.id);
        document.title = `${slideshow.title} – Builder`;
      } else {
        // Not found, start fresh
        slideshow = { id: null, title: 'Untitled Slideshow', slides: [] };
      }
    } catch (e) {
      console.error('Failed to load slideshow:', e);
    }
  }

  // Wire up title input
  titleInput.addEventListener('input', () => {
    slideshow.title = titleInput.value;
    setDirty();
  });

  render();
}

// ===================== ADD URLS =====================
function addUrls() {
  const textarea = document.getElementById('url-input');
  const raw = textarea.value;
  const urls = raw
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/')));

  if (!urls.length) return;

  urls.forEach(url => {
    const slide = {
      id: uid(),
      assets: [
        { id: uid(), url, type: assetType(url) }
      ]
    };
    slideshow.slides.push(slide);
  });

  textarea.value = '';
  setDirty();
  render();
}

// ===================== REMOVE ASSET =====================
function removeAsset(slideId, assetId) {
  const slide = slideshow.slides.find(s => s.id === slideId);
  if (!slide) return;
  slide.assets = slide.assets.filter(a => a.id !== assetId);
  cleanSlides();
  setDirty();
  render();
}

// ===================== DELETE SLIDE =====================
function deleteSlide(slideId) {
  slideshow.slides = slideshow.slides.filter(s => s.id !== slideId);
  setDirty();
  render();
}

// ===================== MOVE ASSET =====================
// Moves asset from fromSlideId to toSlideId, inserting before beforeAssetId (or at end if null)
function moveAsset(assetId, fromSlideId, toSlideId, beforeAssetId) {
  const fromSlide = slideshow.slides.find(s => s.id === fromSlideId);
  const toSlide = slideshow.slides.find(s => s.id === toSlideId);
  if (!fromSlide || !toSlide) return;

  const asset = fromSlide.assets.find(a => a.id === assetId);
  if (!asset) return;

  // Remove from source
  fromSlide.assets = fromSlide.assets.filter(a => a.id !== assetId);

  // Insert into destination
  if (beforeAssetId && beforeAssetId !== assetId) {
    const idx = toSlide.assets.findIndex(a => a.id === beforeAssetId);
    if (idx === -1) {
      toSlide.assets.push(asset);
    } else {
      toSlide.assets.splice(idx, 0, asset);
    }
  } else {
    toSlide.assets.push(asset);
  }

  cleanSlides();
  setDirty();
  render();
}

// ===================== REORDER SLIDE =====================
function reorderSlide(slideId, targetSlideId, position) {
  if (slideId === targetSlideId) return;

  const idx = slideshow.slides.findIndex(s => s.id === slideId);
  if (idx === -1) return;

  const [slide] = slideshow.slides.splice(idx, 1);

  const targetIdx = slideshow.slides.findIndex(s => s.id === targetSlideId);
  if (targetIdx === -1) {
    slideshow.slides.push(slide);
    return;
  }

  if (position === 'before') {
    slideshow.slides.splice(targetIdx, 0, slide);
  } else {
    slideshow.slides.splice(targetIdx + 1, 0, slide);
  }

  setDirty();
  render();
}

// ===================== CLEAN SLIDES =====================
function cleanSlides() {
  slideshow.slides = slideshow.slides.filter(s => s.assets && s.assets.length > 0);
}

// ===================== SAVE =====================
async function save() {
  const btn = document.querySelector('.btn-primary[onclick="save()"]');
  const status = document.getElementById('save-status');

  btn.disabled = true;
  status.textContent = 'Saving…';

  try {
    const payload = {
      title: slideshow.title,
      slides: slideshow.slides,
    };

    let res;
    if (slideshow.id) {
      res = await fetch(`/api/slideshows/${slideshow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/slideshows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    slideshow.id = data.id;
    dirty = false;
    status.textContent = 'Saved';
    setTimeout(() => { if (status.textContent === 'Saved') status.textContent = ''; }, 2000);

    // Update URL if newly created
    if (location.pathname === '/builder.html' || location.pathname.endsWith('/builder')) {
      history.replaceState({}, '', `/builder/${data.id}`);
    }

    showSavedUI(data.id);
    document.title = `${slideshow.title} – Builder`;
  } catch (e) {
    console.error('Save failed:', e);
    status.textContent = 'Save failed';
  } finally {
    btn.disabled = false;
  }
}

function showSavedUI(id) {
  const copyBtn = document.getElementById('copy-btn');
  const viewBtn = document.getElementById('view-btn');
  copyBtn.style.display = 'inline-flex';
  viewBtn.style.display = 'inline-flex';
  viewBtn.href = `/view/${id}`;
}

// ===================== COPY LINK =====================
function copyLink() {
  if (!slideshow.id) return;
  const url = `${location.origin}/view/${slideshow.id}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copy-btn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

// ===================== RENDER =====================
function render() {
  const grid = document.getElementById('slides-grid');
  const countEl = document.getElementById('slides-count');

  countEl.textContent = slideshow.slides.length
    ? `(${slideshow.slides.length})`
    : '';

  if (!slideshow.slides.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:12px 0;">No slides yet. Add some URLs above.</div>';
    return;
  }

  grid.innerHTML = '';

  slideshow.slides.forEach((slide, slideIndex) => {
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.dataset.slideId = slide.id;
    card.draggable = true;

    // Handle bar
    const handle = document.createElement('div');
    handle.className = 'slide-handle';
    handle.innerHTML = `<span class="slide-num">Slide ${slideIndex + 1}</span><button class="slide-delete" title="Delete slide" onclick="deleteSlide('${slide.id}')">✕</button>`;
    card.appendChild(handle);

    // Assets list
    const assetsContainer = document.createElement('div');
    assetsContainer.className = 'slide-assets';
    assetsContainer.dataset.slideId = slide.id;

    slide.assets.forEach(asset => {
      const thumb = document.createElement('div');
      thumb.className = 'asset-thumb';
      thumb.dataset.assetId = asset.id;
      thumb.dataset.slideId = slide.id;
      thumb.draggable = true;

      if (asset.type === 'video') {
        thumb.innerHTML = `
          <video src="${escHtml(asset.url)}" muted preload="metadata"></video>
          <span class="asset-type-badge">video</span>
          <button class="asset-remove" title="Remove" onclick="removeAsset('${slide.id}','${asset.id}')">✕</button>
        `;
      } else {
        thumb.innerHTML = `
          <img src="${escHtml(asset.url)}" alt="" loading="lazy" onerror="this.style.display='none'">
          <span class="asset-type-badge">img</span>
          <button class="asset-remove" title="Remove" onclick="removeAsset('${slide.id}','${asset.id}')">✕</button>
        `;
      }

      // Asset drag events
      thumb.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        dragInfo = { type: 'asset', slideId: slide.id, assetId: asset.id };
        thumb.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', asset.id);
      });

      thumb.addEventListener('dragend', (e) => {
        e.stopPropagation();
        thumb.classList.remove('dragging');
        clearAllDropClasses();
        dragInfo = null;
      });

      thumb.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragInfo || dragInfo.type !== 'asset') return;
        if (dragInfo.assetId === asset.id) return;

        const rect = thumb.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        thumb.classList.remove('drop-indicator-before', 'drop-indicator-after');
        if (e.clientY < midY) {
          thumb.classList.add('drop-indicator-before');
        } else {
          thumb.classList.add('drop-indicator-after');
        }
      });

      thumb.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        thumb.classList.remove('drop-indicator-before', 'drop-indicator-after');
      });

      thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragInfo || dragInfo.type !== 'asset') return;
        if (dragInfo.assetId === asset.id) return;

        const rect = thumb.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        // If dropping before this asset, insert before it; if after, insert after it
        // We insert before the "next" asset in the latter case
        const insertBeforeId = e.clientY < midY ? asset.id : null;

        if (e.clientY >= midY) {
          // Insert after this asset: find next asset in this slide
          const currentSlideAssets = slideshow.slides.find(s => s.id === slide.id)?.assets || [];
          const thisIdx = currentSlideAssets.findIndex(a => a.id === asset.id);
          const nextAsset = currentSlideAssets[thisIdx + 1];
          moveAsset(dragInfo.assetId, dragInfo.slideId, slide.id, nextAsset ? nextAsset.id : null);
        } else {
          moveAsset(dragInfo.assetId, dragInfo.slideId, slide.id, insertBeforeId);
        }

        clearAllDropClasses();
        dragInfo = null;
      });

      assetsContainer.appendChild(thumb);
    });

    card.appendChild(assetsContainer);

    // Slide-level drag events
    card.addEventListener('dragstart', (e) => {
      // Only trigger if not starting from an asset thumb
      if (dragInfo && dragInfo.type === 'asset') return;
      dragInfo = { type: 'slide', slideId: slide.id };
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', slide.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      clearAllDropClasses();
      dragInfo = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragInfo) return;

      if (dragInfo.type === 'slide') {
        if (dragInfo.slideId === slide.id) return;
        const rect = card.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        card.classList.remove('drop-before', 'drop-after', 'drop-target');
        if (e.clientX < midX) {
          card.classList.add('drop-before');
        } else {
          card.classList.add('drop-after');
        }
      } else if (dragInfo.type === 'asset') {
        if (dragInfo.slideId !== slide.id) {
          card.classList.add('drop-target');
        }
      }
    });

    card.addEventListener('dragleave', (e) => {
      // Only clear if leaving the card itself (not a child)
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove('drop-before', 'drop-after', 'drop-target');
      }
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragInfo) return;

      if (dragInfo.type === 'slide') {
        if (dragInfo.slideId === slide.id) return;
        const rect = card.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const position = e.clientX < midX ? 'before' : 'after';
        reorderSlide(dragInfo.slideId, slide.id, position);
      } else if (dragInfo.type === 'asset') {
        if (dragInfo.slideId !== slide.id) {
          // Move asset to end of this slide
          moveAsset(dragInfo.assetId, dragInfo.slideId, slide.id, null);
        }
      }

      clearAllDropClasses();
      dragInfo = null;
    });

    grid.appendChild(card);
  });
}

// ===================== BOOT =====================
init();

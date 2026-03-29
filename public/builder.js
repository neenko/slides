// ===================== STATE =====================
let slideshow = { id: null, title: 'Untitled Slideshow', slides: [] };
let dragInfo = null; // { type: 'slide'|'asset', slideId, assetId? }
let dirty = false;

// DOM element caches — reused across renders to avoid image reloads
const slideEls = new Map(); // slideId → card element
const assetEls = new Map(); // assetId → thumb element

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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  const pathParts = location.pathname.split('/');
  const lastPart = pathParts[pathParts.length - 1];
  const isNewPage = lastPart === 'builder.html' || lastPart === 'builder' || lastPart === '';

  const titleInput = document.getElementById('title-input');

  if (!isNewPage && lastPart) {
    try {
      const res = await fetch(`/api/slideshows/${lastPart}`);
      if (res.ok) {
        const data = await res.json();
        slideshow = data;
        titleInput.value = slideshow.title;
        showSavedUI(slideshow.id);
        document.title = `${slideshow.title} – Builder`;
      }
    } catch (e) {
      console.error('Failed to load slideshow:', e);
    }
  }

  titleInput.addEventListener('input', () => {
    slideshow.title = titleInput.value;
    setDirty();
  });

  render();
}

// ===================== ADD URLS =====================
function addUrls() {
  const textarea = document.getElementById('url-input');
  const urls = textarea.value
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/')));

  if (!urls.length) return;

  urls.forEach(url => {
    slideshow.slides.push({ id: uid(), assets: [{ id: uid(), url, type: assetType(url) }] });
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

  // Remove from cache
  const el = assetEls.get(assetId);
  if (el) { el.remove(); assetEls.delete(assetId); }

  cleanSlides();
  setDirty();
  render();
}

// ===================== DELETE SLIDE =====================
function deleteSlide(slideId) {
  slideshow.slides = slideshow.slides.filter(s => s.id !== slideId);

  // Remove from cache
  const el = slideEls.get(slideId);
  if (el) { el.remove(); slideEls.delete(slideId); }

  setDirty();
  render();
}

// ===================== MOVE ASSET =====================
function moveAsset(assetId, fromSlideId, toSlideId, beforeAssetId) {
  const fromSlide = slideshow.slides.find(s => s.id === fromSlideId);
  const toSlide = slideshow.slides.find(s => s.id === toSlideId);
  if (!fromSlide || !toSlide) return;

  const asset = fromSlide.assets.find(a => a.id === assetId);
  if (!asset) return;

  fromSlide.assets = fromSlide.assets.filter(a => a.id !== assetId);

  if (beforeAssetId && beforeAssetId !== assetId) {
    const idx = toSlide.assets.findIndex(a => a.id === beforeAssetId);
    if (idx === -1) toSlide.assets.push(asset);
    else toSlide.assets.splice(idx, 0, asset);
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
  if (targetIdx === -1) { slideshow.slides.push(slide); return; }

  slideshow.slides.splice(position === 'before' ? targetIdx : targetIdx + 1, 0, slide);
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
    const payload = { title: slideshow.title, slides: slideshow.slides };
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

    if (location.pathname === '/builder.html' || location.pathname.endsWith('/builder')) {
      history.replaceState({}, '', `/builder/${data.id}`);
    }

    showSavedUI(data.id);
    document.title = `${slideshow.title} – Builder`;
  } catch (e) {
    console.error('Save failed:', e);
    document.getElementById('save-status').textContent = 'Save failed';
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

// ===================== CREATE ASSET THUMB =====================
// Event handlers use thumb.closest('.slide-card') for the current slide ID
// so they stay correct even after an asset is moved to a different slide.
function createAssetThumb(asset) {
  const thumb = document.createElement('div');
  thumb.className = 'asset-thumb';
  thumb.dataset.assetId = asset.id;
  thumb.draggable = true;

  if (asset.type === 'video') {
    const video = document.createElement('video');
    video.src = asset.url;
    video.muted = true;
    video.preload = 'metadata';
    thumb.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = asset.url;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => { img.style.display = 'none'; };
    thumb.appendChild(img);
  }

  const badge = document.createElement('span');
  badge.className = 'asset-type-badge';
  badge.textContent = asset.type === 'video' ? 'video' : 'img';
  thumb.appendChild(badge);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'asset-remove';
  removeBtn.title = 'Remove';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const currentSlideId = thumb.closest('.slide-card').dataset.slideId;
    removeAsset(currentSlideId, asset.id);
  });
  thumb.appendChild(removeBtn);

  thumb.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    const currentSlideId = thumb.closest('.slide-card').dataset.slideId;
    dragInfo = { type: 'asset', slideId: currentSlideId, assetId: asset.id };
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
    if (!dragInfo || dragInfo.type !== 'asset' || dragInfo.assetId === asset.id) return;
    const rect = thumb.getBoundingClientRect();
    thumb.classList.remove('drop-indicator-before', 'drop-indicator-after');
    thumb.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-indicator-before' : 'drop-indicator-after');
  });

  thumb.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    thumb.classList.remove('drop-indicator-before', 'drop-indicator-after');
  });

  thumb.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragInfo || dragInfo.type !== 'asset' || dragInfo.assetId === asset.id) return;

    const targetSlideId = thumb.closest('.slide-card').dataset.slideId;
    const targetSlide = slideshow.slides.find(s => s.id === targetSlideId);
    const rect = thumb.getBoundingClientRect();

    if (e.clientY >= rect.top + rect.height / 2) {
      // Insert after this asset
      const thisIdx = targetSlide?.assets.findIndex(a => a.id === asset.id) ?? -1;
      const nextAsset = targetSlide?.assets[thisIdx + 1];
      moveAsset(dragInfo.assetId, dragInfo.slideId, targetSlideId, nextAsset?.id ?? null);
    } else {
      moveAsset(dragInfo.assetId, dragInfo.slideId, targetSlideId, asset.id);
    }

    clearAllDropClasses();
    dragInfo = null;
  });

  return thumb;
}

// ===================== CREATE SLIDE CARD =====================
function createSlideCard(slide) {
  const card = document.createElement('div');
  card.className = 'slide-card';
  card.dataset.slideId = slide.id;
  card.draggable = true;

  const handle = document.createElement('div');
  handle.className = 'slide-handle';

  const numSpan = document.createElement('span');
  numSpan.className = 'slide-num';
  handle.appendChild(numSpan);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'slide-delete';
  deleteBtn.title = 'Delete slide';
  deleteBtn.textContent = '✕';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteSlide(slide.id);
  });
  handle.appendChild(deleteBtn);
  card.appendChild(handle);

  const assetsContainer = document.createElement('div');
  assetsContainer.className = 'slide-assets';
  assetsContainer.dataset.slideId = slide.id;
  card.appendChild(assetsContainer);

  card.addEventListener('dragstart', (e) => {
    if (dragInfo?.type === 'asset') return;
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
      card.classList.remove('drop-before', 'drop-after', 'drop-target');
      card.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drop-before' : 'drop-after');
    } else if (dragInfo.type === 'asset' && dragInfo.slideId !== slide.id) {
      card.classList.add('drop-target');
    }
  });

  card.addEventListener('dragleave', (e) => {
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
      reorderSlide(dragInfo.slideId, slide.id, e.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
    } else if (dragInfo.type === 'asset' && dragInfo.slideId !== slide.id) {
      moveAsset(dragInfo.assetId, dragInfo.slideId, slide.id, null);
    }

    clearAllDropClasses();
    dragInfo = null;
  });

  return card;
}

// ===================== RENDER =====================
// Reuses existing DOM elements by moving them with appendChild (no image reloads).
function render() {
  const grid = document.getElementById('slides-grid');
  const countEl = document.getElementById('slides-count');

  countEl.textContent = slideshow.slides.length ? `(${slideshow.slides.length})` : '';

  if (!slideshow.slides.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:12px 0;">No slides yet. Add some URLs above.</div>';
    slideEls.clear();
    assetEls.clear();
    return;
  }

  const activeSlideIds = new Set(slideshow.slides.map(s => s.id));
  const activeAssetIds = new Set(slideshow.slides.flatMap(s => s.assets.map(a => a.id)));

  // Prune stale cache entries
  for (const id of slideEls.keys()) { if (!activeSlideIds.has(id)) slideEls.delete(id); }
  for (const id of assetEls.keys()) { if (!activeAssetIds.has(id)) assetEls.delete(id); }

  slideshow.slides.forEach((slide, slideIndex) => {
    let card = slideEls.get(slide.id);
    if (!card) {
      card = createSlideCard(slide);
      slideEls.set(slide.id, card);
    }

    // Update slide number label
    card.querySelector('.slide-num').textContent = `Slide ${slideIndex + 1}`;

    const assetsContainer = card.querySelector('.slide-assets');

    // Append (or reposition) asset thumbs in correct order
    slide.assets.forEach(asset => {
      let thumb = assetEls.get(asset.id);
      if (!thumb) {
        thumb = createAssetThumb(asset);
        assetEls.set(asset.id, thumb);
      }
      assetsContainer.appendChild(thumb); // moves existing node, no reload
    });

    // Remove any orphaned asset elements left in this container
    Array.from(assetsContainer.children).forEach(child => {
      if (!activeAssetIds.has(child.dataset.assetId)) child.remove();
    });

    grid.appendChild(card); // reposition card in grid
  });

  // Remove any orphaned slide cards left in the grid
  Array.from(grid.children).forEach(child => {
    if (child.dataset.slideId && !activeSlideIds.has(child.dataset.slideId)) child.remove();
  });
}

// ===================== BOOT =====================
init();

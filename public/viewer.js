// ===================== STATE =====================
let slideshow = null;
let currentIndex = 0;
let saveTimer = null;
const isShareMode = location.pathname.startsWith('/share/');

// ===================== INIT =====================
async function init() {
  const pathParts = location.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id || id === 'view.html') { showError('No slideshow ID provided.'); return; }

  try {
    const apiUrl = isShareMode ? `/api/share/${id}` : `/api/slideshows/${id}`;
    const res = await fetch(apiUrl);
    if (!res.ok) { showError('Slideshow not found.'); return; }
    slideshow = await res.json();

    slideshow.slides = (slideshow.slides || []).filter(s => s.assets?.length > 0);
    if (!slideshow.slides.length) { showError('This slideshow has no slides.'); return; }

    document.title = slideshow.title;
    const editLink = document.getElementById('edit-link');
    if (isShareMode) {
      editLink.style.display = 'none';
    } else {
      editLink.href = `/builder/${id}`;
    }

    document.getElementById('slide-area').addEventListener('click', () => next());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    });

    const hash = location.hash ? parseInt(location.hash.slice(1)) - 1 : 0;
    const startIndex = Math.min(Math.max(hash || 0, 0), slideshow.slides.length - 1);
    showSlide(startIndex);
  } catch (err) {
    console.error('Failed to load slideshow:', err);
    showError('Failed to load slideshow.');
  }
}

// ===================== SHOW SLIDE =====================
async function showSlide(index) {
  if (!slideshow || index < 0 || index >= slideshow.slides.length) return;

  currentIndex = index;
  const slide = slideshow.slides[index];
  const area = document.getElementById('slide-area');

  // Pause and detach existing videos
  area.querySelectorAll('video').forEach(v => { v.pause(); v.src = ''; });

  if (slide.assets.length === 1) {
    renderSingle(slide.assets[0], area);
  } else {
    const layout = slide.layout || 'smart';
    await renderMulti(slide, area, layout);
  }

  // Update URL hash (1-based)
  history.replaceState(null, '', '#' + (index + 1));

  // Sync layout select (only for multi-asset slides in non-share mode)
  const layoutSelect = document.getElementById('layout-select');
  const isMulti = slide.assets.length > 1;
  layoutSelect.style.display = isMulti && !isShareMode ? '' : 'none';
  if (isMulti) layoutSelect.value = slide.layout || 'smart';

  // Update counter
  document.getElementById('counter').textContent = `${index + 1} / ${slideshow.slides.length}`;

  // Update nav buttons
  const isFirst = index === 0;
  const isLast = index === slideshow.slides.length - 1;
  document.getElementById('prev-btn').style.display = isFirst ? 'none' : 'flex';
  document.getElementById('next-btn').style.display = isLast ? 'none' : 'flex';
  document.getElementById('ctrl-prev').disabled = isFirst;
  document.getElementById('ctrl-next').disabled = isLast;
}

// ===================== NAVIGATION =====================
function next() { if (slideshow && currentIndex < slideshow.slides.length - 1) showSlide(currentIndex + 1); }
function prev() { if (slideshow && currentIndex > 0) showSlide(currentIndex - 1); }

// ===================== SINGLE ASSET =====================
function renderSingle(asset, area) {
  const content = document.createElement('div');
  content.className = 'slide-content single';
  content.appendChild(makeMediaEl(asset, 'contain', true));
  area.innerHTML = '';
  area.appendChild(content);
}

// ===================== MULTI-ASSET ROUTER =====================
async function renderMulti(slide, area, layout) {
  switch (layout) {
    case 'cover':    renderCover(slide, area);          break;
    case 'contain':  renderContain(slide, area);        break;
    case 'freeflow': renderFreeflow(slide, area);       break;
    case 'mosaic':   await renderMosaic(slide, area);   break;
    case 'smart':
    default:         await renderSmart(slide, area);    break;
  }
}

// ===================== LAYOUT: COVER =====================
// Fixed grid, object-fit: cover. Nothing letterboxed but edges may be cropped.
function renderCover(slide, area) {
  area.innerHTML = '';
  area.appendChild(buildGrid(slide.assets, 'cover'));
}

// ===================== LAYOUT: CONTAIN =====================
// Fixed grid, object-fit: contain. Full image visible; black bars fill gaps.
function renderContain(slide, area) {
  area.innerHTML = '';
  area.appendChild(buildGrid(slide.assets, 'contain'));
}

// ===================== LAYOUT: SMART =====================
// Loads image dimensions, picks grid columns based on orientation.
// Portrait-heavy → more columns; landscape-heavy → fewer columns.
// Uses object-fit: contain so nothing is cropped.
async function renderSmart(slide, area) {
  const ratios = await loadRatios(slide.assets);
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const count = slide.assets.length;

  let cols;
  if (count === 2)      cols = avg > 1.2 ? 1 : 2;           // landscape → stack; portrait → side-by-side
  else if (count === 3) cols = avg < 0.85 ? 3 : 2;           // portrait → 3 cols; landscape → 2
  else if (count === 4) cols = 2;                             // always 2×2
  else                  cols = avg < 0.85 ? Math.min(count, 3) : 2;

  area.innerHTML = '';
  area.appendChild(buildGrid(slide.assets, 'contain', cols));
}

// ===================== LAYOUT: FREE FLOW =====================
// Flex-wrap. Images keep natural aspect ratios, scale to fit available space.
// Layout wraps naturally — useful for varied mixes.
function renderFreeflow(slide, area) {
  const content = document.createElement('div');
  content.style.cssText = 'width:100%;height:100%;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;align-content:center;gap:8px;padding:8px;background:#000;box-sizing:border-box;';

  slide.assets.forEach(asset => {
    const el = makeMediaEl(asset, 'contain', false);
    el.style.maxHeight = '46vh';
    el.style.maxWidth = '46vw';
    el.style.width = 'auto';
    el.style.height = 'auto';
    el.style.flex = '0 1 auto';
    content.appendChild(el);
  });

  area.innerHTML = '';
  area.appendChild(content);
}

// ===================== LAYOUT: MOSAIC =====================
// Single-row mosaic: each item's flex-grow equals its aspect ratio,
// so widths are proportional to image dimensions. All images same height.
async function renderMosaic(slide, area) {
  const ratios = await loadRatios(slide.assets);

  const content = document.createElement('div');
  content.style.cssText = 'width:100%;height:100%;display:flex;gap:24px;padding:12px;background:#000;box-sizing:border-box;align-items:stretch;';

  slide.assets.forEach((asset, i) => {
    const ratio = ratios[i];
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `flex:${ratio} 1 0;min-width:0;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;`;
    const el = makeMediaEl(asset, 'contain', false);
    el.style.width = '100%';
    el.style.height = '100%';
    wrapper.appendChild(el);
    content.appendChild(wrapper);
  });

  area.innerHTML = '';
  area.appendChild(content);
}

// ===================== HELPERS =====================

// Build a standard CSS grid of asset thumbnails.
function buildGrid(assets, objectFit, colsOverride) {
  const count = assets.length;
  const cols = colsOverride ?? (count <= 2 ? count : count === 3 ? 2 : Math.min(count, 3));

  const grid = document.createElement('div');
  grid.style.cssText = `width:100%;height:100%;display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px;padding:12px;background:#000;box-sizing:border-box;`;

  assets.forEach(asset => {
    const cell = document.createElement('div');
    cell.style.cssText = 'overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;min-height:0;';
    cell.appendChild(makeMediaEl(asset, objectFit, false));
    grid.appendChild(cell);
  });

  return grid;
}

// Create an <img> or <video> element.
function makeMediaEl(asset, objectFit, isSingle) {
  let el;
  if (asset.type === 'video') {
    el = document.createElement('video');
    el.src = asset.url;
    el.autoplay = true;
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
  } else {
    el = document.createElement('img');
    el.src = asset.url;
    el.alt = '';
  }

  if (isSingle) {
    el.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;';
  } else {
    el.style.cssText = `width:100%;height:100%;object-fit:${objectFit};display:block;`;
  }

  return el;
}

// Load aspect ratios for a list of assets. Videos default to 16:9.
function loadRatios(assets) {
  return Promise.all(assets.map(asset => {
    if (asset.type === 'video') return Promise.resolve(16 / 9);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
      img.onerror = () => resolve(1);
      img.src = asset.url;
    });
  }));
}

// ===================== LAYOUT CHANGE =====================
function changeLayout(value) {
  slideshow.slides[currentIndex].layout = value;
  showSlide(currentIndex);

  if (isShareMode) return; // shared views are read-only

  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const id = location.pathname.split('/').pop();
    await fetch(`/api/slideshows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: slideshow.slides }),
    });
  }, 1000);
}

// ===================== ERROR =====================
function showError(message) {
  document.getElementById('slide-area').innerHTML = `
    <div class="viewer-error">
      <div style="font-size:48px;">⚠</div>
      <div>${message}</div>
      <a href="/" style="color:rgba(255,255,255,0.5);font-size:13px;">← Back to slideshows</a>
    </div>
  `;
}

// ===================== BOOT =====================
init();

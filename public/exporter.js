// ===================== SCRIPT LOADER =====================
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ===================== ASSET FETCHERS =====================
async function fetchDataUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function videoFrameDataUrl(url) {
  // ImageKit serves video thumbnails at <videoUrl>/ik-thumbnail.jpg — use that first.
  if (url.includes('ik.imagekit.io')) {
    const thumbUrl = url.split('?')[0] + '/ik-thumbnail.jpg';
    const data = await fetchDataUrl(thumbUrl);
    if (data) return data;
  }

  // Generic fallback: load video without crossOrigin (allows loading from any source)
  // then capture a frame. Canvas may be tainted (SecurityError) for cross-origin videos —
  // we catch that and return the placeholder.
  return new Promise(resolve => {
    const placeholder = () => {
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = 'bold 140px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶', 640, 360);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };

    const video = document.createElement('video');
    // No crossOrigin — lets the video load even without CORS headers.
    // Canvas will throw SecurityError if cross-origin; we catch it below.
    video.muted = true;
    video.preload = 'metadata';

    const timeout = setTimeout(placeholder, 10000);

    video.addEventListener('error', () => { clearTimeout(timeout); placeholder(); });
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1, video.duration * 0.1 || 0);
    });
    video.addEventListener('seeked', () => {
      clearTimeout(timeout);
      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth || 1280;
        c.height = video.videoHeight || 720;
        c.getContext('2d').drawImage(video, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.85));
      } catch { placeholder(); }
    });

    video.src = url;
    video.load();
  });
}

function loadImg(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ===================== CANVAS DRAWING =====================
const CW = 1280, CH = 720;

function drawContain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
  ctx.restore();
}

function gridCols(count, layout, ratios) {
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  if (layout === 'smart' || layout === 'mosaic') {
    if (count === 2) return avg > 1.2 ? 1 : 2;
    if (count === 3) return avg < 0.85 ? 3 : 2;
    if (count === 4) return 2;
    return avg < 0.85 ? Math.min(count, 3) : 2;
  }
  // cover / contain / freeflow
  if (count <= 2) return count;
  if (count <= 4) return 2;
  return Math.min(count, 3);
}

async function renderSlideToCanvas(slide) {
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CW, CH);

  // Fetch all assets
  const dataUrls = await Promise.all(slide.assets.map(a =>
    a.type === 'video' ? videoFrameDataUrl(a.url) : fetchDataUrl(a.url)
  ));
  const imgs = await Promise.all(dataUrls.map(u => u ? loadImg(u).catch(() => null) : null));
  const ratios = imgs.map(img => img ? img.naturalWidth / img.naturalHeight : 16 / 9);

  const count = slide.assets.length;
  const layout = slide.layout || 'smart';
  const GAP = 4, PAD = 4;

  if (count === 1) {
    if (imgs[0]) drawContain(ctx, imgs[0], 0, 0, CW, CH);
    return canvas;
  }

  if (layout === 'mosaic') {
    const total = ratios.reduce((s, r) => s + r, 0);
    const availW = CW - PAD * 2 - GAP * (count - 1);
    let x = PAD;
    imgs.forEach((img, i) => {
      if (!img) return;
      const w = (ratios[i] / total) * availW;
      drawContain(ctx, img, x, PAD, w, CH - PAD * 2);
      x += w + GAP;
    });
    return canvas;
  }

  if (layout === 'freeflow') {
    // approximate: 2-up rows, contain each cell
    const cols = count <= 2 ? count : 2;
    const rows = Math.ceil(count / cols);
    const cw = (CW - PAD * 2 - GAP * (cols - 1)) / cols;
    const ch = (CH - PAD * 2 - GAP * (rows - 1)) / rows;
    imgs.forEach((img, i) => {
      if (!img) return;
      const c = i % cols, r = Math.floor(i / cols);
      drawContain(ctx, img, PAD + c * (cw + GAP), PAD + r * (ch + GAP), cw, ch);
    });
    return canvas;
  }

  // cover / contain / smart → grid
  const cols = gridCols(count, layout, ratios);
  const rows = Math.ceil(count / cols);
  const cw = (CW - PAD * 2 - GAP * (cols - 1)) / cols;
  const ch = (CH - PAD * 2 - GAP * (rows - 1)) / rows;
  const draw = layout === 'cover' ? drawCover : drawContain;

  imgs.forEach((img, i) => {
    if (!img) return;
    const c = i % cols, r = Math.floor(i / cols);
    draw(ctx, img, PAD + c * (cw + GAP), PAD + r * (ch + GAP), cw, ch);
  });

  return canvas;
}

// ===================== PDF EXPORT =====================
async function exportPDF(slideshow, onProgress) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [CW, CH] });

  for (let i = 0; i < slideshow.slides.length; i++) {
    onProgress(i + 1, slideshow.slides.length);
    if (i > 0) doc.addPage([CW, CH], 'landscape');
    const canvas = await renderSlideToCanvas(slideshow.slides[i]);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, CW, CH);
  }

  doc.save(`${slideshow.title || 'Slideshow'}.pdf`);
}

// ===================== PPTX EXPORT =====================
// Slide dimensions in inches (16:9)
const SW = 10, SH = 5.625;

function containDims(imgW, imgH) {
  const imgRatio = imgW / imgH, slideRatio = SW / SH;
  let w, h;
  if (imgRatio > slideRatio) { w = SW; h = SW / imgRatio; }
  else { h = SH; w = SH * imgRatio; }
  return { x: (SW - w) / 2, y: (SH - h) / 2, w, h };
}

async function exportPPTX(slideshow, onProgress) {
  await loadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = slideshow.title || 'Slideshow';

  for (let i = 0; i < slideshow.slides.length; i++) {
    onProgress(i + 1, slideshow.slides.length);
    const slide = slideshow.slides[i];
    const pSlide = pptx.addSlide();
    pSlide.background = { color: '000000' };

    if (slide.assets.length === 1) {
      const asset = slide.assets[0];
      const isVideo = asset.type === 'video';
      const dataUrl = isVideo ? await videoFrameDataUrl(asset.url) : await fetchDataUrl(asset.url);

      if (dataUrl) {
        const img = await loadImg(dataUrl).catch(() => null);
        if (img) {
          const { x, y, w, h } = containDims(img.naturalWidth, img.naturalHeight);
          pSlide.addImage({ data: dataUrl, x, y, w, h });
        }
      }

      if (isVideo) {
        // Notes include the video URL so recipients can access the original
        pSlide.addNotes(`Video: ${asset.url}`);
      }
    } else {
      // Multi-asset: composite to canvas for reliability across all layouts
      const canvas = await renderSlideToCanvas(slide);
      pSlide.addImage({ data: canvas.toDataURL('image/jpeg', 0.92), x: 0, y: 0, w: SW, h: SH });

      // If any videos, note their URLs
      const videoUrls = slide.assets.filter(a => a.type === 'video').map(a => a.url);
      if (videoUrls.length) pSlide.addNotes(`Videos:\n${videoUrls.join('\n')}`);
    }
  }

  await pptx.writeFile({ fileName: `${slideshow.title || 'Slideshow'}.pptx` });
}

// ===================== UI ENTRY POINT =====================
async function exportAs(format) {
  if (!slideshow?.slides?.length) { alert('No slides to export.'); return; }
  if (!slideshow.id) { alert('Save the slideshow before exporting.'); return; }

  toggleExportMenu(false);

  const trigger = document.getElementById('export-trigger');
  const orig = trigger.textContent;
  trigger.disabled = true;

  const onProgress = (cur, total) => {
    trigger.textContent = `${cur}/${total}…`;
  };

  try {
    trigger.textContent = 'Loading…';
    if (format === 'pdf') await exportPDF(slideshow, onProgress);
    else if (format === 'pptx') await exportPPTX(slideshow, onProgress);
  } catch (e) {
    console.error('Export failed:', e);
    alert('Export failed — check the browser console for details.');
  } finally {
    trigger.textContent = orig;
    trigger.disabled = false;
  }
}

function toggleExportMenu(force) {
  const menu = document.getElementById('export-menu');
  const show = force !== undefined ? force : menu.style.display === 'none';
  menu.style.display = show ? '' : 'none';
  if (show) {
    const close = (e) => {
      if (!document.getElementById('export-dropdown').contains(e.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

// ===================== STATE =====================
let slideshow = null;
let currentIndex = 0;

// ===================== INIT =====================
async function init() {
  const pathParts = location.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id || id === 'view.html') {
    showError('No slideshow ID provided.');
    return;
  }

  try {
    const res = await fetch(`/api/slideshows/${id}`);
    if (!res.ok) {
      showError('Slideshow not found.');
      return;
    }
    slideshow = await res.json();

    if (!slideshow.slides || !slideshow.slides.length) {
      showError('This slideshow has no slides.');
      return;
    }

    document.title = slideshow.title;
    document.getElementById('edit-link').href = `/builder/${id}`;

    // Click on slide area advances to next slide
    document.getElementById('slide-area').addEventListener('click', () => next());

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    });

    showSlide(0);
  } catch (err) {
    console.error('Failed to load slideshow:', err);
    showError('Failed to load slideshow.');
  }
}

// ===================== SHOW SLIDE =====================
function showSlide(index) {
  if (!slideshow || index < 0 || index >= slideshow.slides.length) return;

  currentIndex = index;
  const slide = slideshow.slides[index];
  const area = document.getElementById('slide-area');

  // Pause and remove any existing videos
  area.querySelectorAll('video').forEach(v => {
    v.pause();
    v.src = '';
  });

  const content = document.createElement('div');
  const isSingle = slide.assets.length === 1;
  content.className = `slide-content ${isSingle ? 'single' : 'multi'}`;

  if (!isSingle) {
    // Determine grid layout based on asset count
    const count = slide.assets.length;
    if (count === 2) {
      content.style.gridTemplateColumns = '1fr 1fr';
      content.style.gridTemplateRows = '1fr';
      content.style.width = '100%';
      content.style.height = '100%';
    } else if (count === 3) {
      content.style.gridTemplateColumns = '1fr 1fr';
      content.style.gridTemplateRows = '1fr 1fr';
      content.style.width = '100%';
      content.style.height = '100%';
    } else if (count === 4) {
      content.style.gridTemplateColumns = '1fr 1fr';
      content.style.gridTemplateRows = '1fr 1fr';
      content.style.width = '100%';
      content.style.height = '100%';
    } else {
      // 5+ assets: 3 columns
      const cols = Math.min(count, 3);
      content.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      content.style.width = '100%';
      content.style.height = '100%';
    }
  }

  slide.assets.forEach(asset => {
    const wrapper = document.createElement('div');
    wrapper.style.overflow = 'hidden';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.backgroundColor = '#000';

    if (!isSingle) {
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
    }

    if (asset.type === 'video') {
      const video = document.createElement('video');
      video.src = asset.url;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = false;
      if (isSingle) {
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        video.style.objectFit = 'contain';
      } else {
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
      }
      wrapper.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = asset.url;
      img.alt = '';
      if (isSingle) {
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
      } else {
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
      }
      wrapper.appendChild(img);
    }

    if (isSingle) {
      content.appendChild(wrapper.firstChild);
    } else {
      content.appendChild(wrapper);
    }
  });

  area.innerHTML = '';
  area.appendChild(content);

  // Update counter
  const counter = document.getElementById('counter');
  counter.textContent = `${index + 1} / ${slideshow.slides.length}`;

  // Update arrow button states
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const ctrlPrev = document.getElementById('ctrl-prev');
  const ctrlNext = document.getElementById('ctrl-next');

  const isFirst = index === 0;
  const isLast = index === slideshow.slides.length - 1;

  prevBtn.disabled = isFirst;
  nextBtn.disabled = isLast;
  ctrlPrev.disabled = isFirst;
  ctrlNext.disabled = isLast;

  if (isFirst) {
    prevBtn.style.display = 'none';
  } else {
    prevBtn.style.display = 'flex';
  }

  if (isLast) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = 'flex';
  }
}

// ===================== NAVIGATION =====================
function next() {
  if (!slideshow) return;
  if (currentIndex < slideshow.slides.length - 1) {
    showSlide(currentIndex + 1);
  }
}

function prev() {
  if (!slideshow) return;
  if (currentIndex > 0) {
    showSlide(currentIndex - 1);
  }
}

// ===================== ERROR =====================
function showError(message) {
  const area = document.getElementById('slide-area');
  area.innerHTML = `
    <div class="viewer-error">
      <div style="font-size:48px;">⚠</div>
      <div>${message}</div>
      <a href="/" style="color:rgba(255,255,255,0.5);font-size:13px;">← Back to slideshows</a>
    </div>
  `;
}

// ===================== BOOT =====================
init();

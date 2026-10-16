import { state, BASE_SCALE, $ } from './state.js';
import { enc } from './api.js';

// Inverse-sync callback registered by synctex.js to avoid circular import
let _onPageClick = null;
export function setPageClickHandler(fn) { _onPageClick = fn; }

export function resetPdfPanel() {
  $('pdf-placeholder').classList.remove('hidden');
  $('pdf-canvas-container').classList.add('hidden');
  $('pdf-canvas-container').innerHTML = '';
  $('pdf-total-pages').textContent = '—';
  $('pdf-page-input').value = 1;
  if (state.pdfDoc) { try { state.pdfDoc.destroy(); } catch (_) {} }
  state.pdfDoc = null; state.pdfPageInfo = {};
}

export async function loadPdfDoc(url) {
  if (typeof pdfjsLib === 'undefined') { console.warn('pdf.js not loaded'); return; }
  if (state.pdfDoc) { try { state.pdfDoc.destroy(); } catch (_) {} }
  state.pdfDoc = null; state.pdfPageInfo = {};

  const container = $('pdf-canvas-container');
  container.innerHTML = '<div class="pdf-loading">Rendering PDF…</div>';
  container.classList.remove('hidden');
  $('pdf-placeholder').classList.add('hidden');

  try {
    state.pdfDoc = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
    const total  = state.pdfDoc.numPages;
    $('pdf-total-pages').textContent = total;
    $('pdf-page-input').max = total;

    container.innerHTML = '';
    for (let i = 1; i <= total; i++) {
      const wrapper = document.createElement('div');
      wrapper.className  = 'pdf-page-wrapper';
      wrapper.dataset.page = i;
      container.appendChild(wrapper);
      await renderPdfPage(i, wrapper);
    }

    setupPageObserver();
    autoFitPdf();
  } catch (e) {
    container.innerHTML =
      `<div class="pdf-loading" style="color:#f66">Error loading PDF: ${e.message}</div>`;
  }
}

async function renderPdfPage(pageNum, wrapper) {
  const page = await state.pdfDoc.getPage(pageNum);
  const vp1  = page.getViewport({ scale: 1 });
  const vp   = page.getViewport({ scale: BASE_SCALE });

  const canvas       = document.createElement('canvas');
  canvas.width       = Math.floor(vp.width);
  canvas.height      = Math.floor(vp.height);
  canvas.style.width  = Math.floor(vp.width  * state.pdfZoom) + 'px';
  canvas.style.height = Math.floor(vp.height * state.pdfZoom) + 'px';
  canvas.title = 'Click to jump to source line';
  wrapper.appendChild(canvas);

  state.pdfPageInfo[pageNum] = { canvas, width_pt: vp1.width, height_pt: vp1.height };

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  page.cleanup();

  canvas.addEventListener('click', e => {
    if (!_onPageClick) return;
    const rect = canvas.getBoundingClientRect();
    const x_pt = ((e.clientX - rect.left) / rect.width)  * vp1.width;
    const y_pt = ((e.clientY - rect.top)  / rect.height) * vp1.height;
    _onPageClick(pageNum, x_pt, y_pt);
  });
}

export function autoFitPdf() {
  const container = $('pdf-canvas-container');
  const info      = state.pdfPageInfo[1];
  if (!info) return;
  const avail   = container.clientWidth - 24;
  const natural = info.canvas.width;
  if (natural > 0) {
    state.pdfZoom = Math.max(0.25, Math.min(3, avail / natural));
    updatePdfZoom();
  }
}

export function updatePdfZoom() {
  $('pdf-zoom-label').textContent = Math.round(state.pdfZoom * 100) + '%';
  Object.values(state.pdfPageInfo).forEach(info => {
    if (!info?.canvas) return;
    info.canvas.style.width  = Math.floor(info.canvas.width  * state.pdfZoom) + 'px';
    info.canvas.style.height = Math.floor(info.canvas.height * state.pdfZoom) + 'px';
  });
}

export function scrollPdfToPage(pageNum) {
  const wrapper = $('pdf-canvas-container').querySelector(`[data-page="${pageNum}"]`);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupPageObserver() {
  if (window._pageObs) window._pageObs.disconnect();
  const container = $('pdf-canvas-container');
  window._pageObs = new IntersectionObserver(entries => {
    let top = null;
    entries.forEach(e => {
      if (e.isIntersecting) {
        const p = parseInt(e.target.dataset.page);
        if (top === null || p < top) top = p;
      }
    });
    if (top !== null) $('pdf-page-input').value = top;
  }, { root: container, threshold: 0.1 });
  container.querySelectorAll('.pdf-page-wrapper').forEach(w => window._pageObs.observe(w));
}

export function initPdfControls() {
  $('pdf-zoom-in') .addEventListener('click', () => {
    state.pdfZoom = Math.min(3, state.pdfZoom + 0.25); updatePdfZoom();
  });
  $('pdf-zoom-out').addEventListener('click', () => {
    state.pdfZoom = Math.max(0.25, state.pdfZoom - 0.25); updatePdfZoom();
  });
  $('pdf-prev-page').addEventListener('click', () => {
    const cur = parseInt($('pdf-page-input').value) || 1;
    if (cur > 1) scrollPdfToPage(cur - 1);
  });
  $('pdf-next-page').addEventListener('click', () => {
    const cur   = parseInt($('pdf-page-input').value) || 1;
    const total = parseInt($('pdf-total-pages').textContent) || 1;
    if (cur < total) scrollPdfToPage(cur + 1);
  });
  $('pdf-page-input').addEventListener('change', () => {
    const p = parseInt($('pdf-page-input').value);
    if (p >= 1) scrollPdfToPage(p);
  });
  $('download-btn').addEventListener('click', () => {
    if (!state.project) return;
    import('./state.js').then(({ getMainFile }) => {
      const a = document.createElement('a');
      a.href     = `/api/pdf?project=${enc(state.project)}&mainFile=${enc(getMainFile())}&t=${Date.now()}`;
      a.download = `${state.project}.pdf`;
      a.click();
    });
  });
}

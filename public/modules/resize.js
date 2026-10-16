import { state, $ } from './state.js';

export function initResize() {
  const sidebar  = $('sidebar');
  const pdfPanel = $('pdf-panel');

  const sw = localStorage.getItem('sidebarW');
  const pw = localStorage.getItem('pdfW');
  if (sw) sidebar.style.width  = sw + 'px';
  if (pw) pdfPanel.style.width = pw + 'px';

  makeColHandle($('rh-left'),  sidebar,  true,  120, 500);
  makeColHandle($('rh-right'), pdfPanel, false, 200, 900);
  makeRowHandle($('rh-log'));
  makeOutlineHandle($('rh-outline'));
}

function makeColHandle(handle, panel, isLeft, min, max) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const startX = e.clientX, startW = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const delta = isLeft ? (e.clientX - startX) : (startX - e.clientX);
      panel.style.width = Math.max(min, Math.min(max, startW + delta)) + 'px';
      if (state.editor) state.editor.refresh();
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      localStorage.setItem(isLeft ? 'sidebarW' : 'pdfW', panel.offsetWidth);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

function makeRowHandle(handle) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const startY = e.clientY, lp = $('log-panel'), startH = lp.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const newH = Math.max(32, Math.min(400, startH - (e.clientY - startY)));
      lp.style.height = newH + 'px';
      if (newH > 36) { lp.classList.add('expanded'); $('compile-log').classList.remove('hidden'); }
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

function makeOutlineHandle(handle) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const startY = e.clientY, ol = $('sb-outline'), startH = ol.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const newH = Math.max(60, Math.min(500, startH - (e.clientY - startY)));
      ol.style.height = newH + 'px';
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

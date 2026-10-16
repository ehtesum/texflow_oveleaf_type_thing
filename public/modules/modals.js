import { state, $ } from './state.js';
import { S, saveSettings } from './settings.js';

// ── Generic input modal ───────────────────────────────────────────────────────
let modalCb = null;

export function showModal(title, placeholder, cb) {
  $('modal-title').textContent       = title;
  $('modal-input').placeholder       = placeholder;
  $('modal-input').value             = '';
  modalCb = cb;
  $('modal-overlay').classList.remove('hidden');
  setTimeout(() => $('modal-input').focus(), 40);
}

function closeModal() {
  $('modal-overlay').classList.add('hidden');
  modalCb = null;
}

// ── Settings modal ────────────────────────────────────────────────────────────
function populateSettings() {
  document.querySelectorAll('input[name="s-compiler"]').forEach(r => r.checked = r.value === S.compiler);
  const fs = $('s-fontsize'), as = $('s-autosave');
  fs.value = S.fontSize; $('s-fontsize-val').textContent = S.fontSize + 'px';
  as.value = S.autosave; $('s-autosave-val').textContent = (S.autosave / 1000).toFixed(1) + ' s';
  $('s-wrap').checked   = S.wordWrap;
  $('s-lines').checked  = S.lineNumbers;
  $('s-double').checked = S.doubleCompile;
  fs.oninput = () => $('s-fontsize-val').textContent = fs.value + 'px';
  as.oninput = () => $('s-autosave-val').textContent = (as.value / 1000).toFixed(1) + ' s';
}

// ── Init all modals ───────────────────────────────────────────────────────────
export function initModals() {
  // Generic modal
  $('modal-cancel') .addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });
  $('modal-input')  .addEventListener('keydown', e => {
    if (e.key === 'Enter')  $('modal-confirm').click();
    if (e.key === 'Escape') closeModal();
  });
  $('modal-confirm').addEventListener('click', () => {
    const v = $('modal-input').value.trim(); if (!v) return;
    closeModal(); if (modalCb) modalCb(v);
  });

  // Settings modal
  $('settings-btn').addEventListener('click', () => {
    populateSettings(); $('settings-overlay').classList.remove('hidden');
  });
  $('settings-close') .addEventListener('click', () => $('settings-overlay').classList.add('hidden'));
  $('settings-cancel').addEventListener('click', () => $('settings-overlay').classList.add('hidden'));
  $('settings-overlay').addEventListener('click', e => {
    if (e.target === $('settings-overlay')) $('settings-overlay').classList.add('hidden');
  });
  $('settings-save').addEventListener('click', () => {
    const comp = document.querySelector('input[name="s-compiler"]:checked');
    if (comp) S.compiler = comp.value;
    S.fontSize      = +$('s-fontsize').value;
    S.wordWrap      = $('s-wrap').checked;
    S.lineNumbers   = $('s-lines').checked;
    S.doubleCompile = $('s-double').checked;
    S.autosave      = +$('s-autosave').value;
    saveSettings();
    if (state.editor) {
      state.editor.setOption('lineWrapping', S.wordWrap);
      state.editor.setOption('lineNumbers',  S.lineNumbers);
      $('editor-container').style.fontSize = S.fontSize + 'px';
      state.editor.refresh();
    }
    $('compiler-select').value = S.compiler;
    $('settings-overlay').classList.add('hidden');
  });

  // Help modal
  $('help-btn')    .addEventListener('click',  () => $('help-overlay').classList.remove('hidden'));
  $('help-close')  .addEventListener('click',  () => $('help-overlay').classList.add('hidden'));
  $('help-overlay').addEventListener('click', e => {
    if (e.target === $('help-overlay')) $('help-overlay').classList.add('hidden');
  });
}

import { state, $ }                          from './modules/state.js';
import { api }                               from './modules/api.js';
import { S, saveSettings }                   from './modules/settings.js';
import { hideContextMenu }                   from './modules/api.js';
import { initEditor, initToolbar,
         initSidebarToggles, initFullscreen } from './modules/editor.js';
import { initFind }                          from './modules/find.js';
import { initPdfControls }                   from './modules/pdfviewer.js';
import { initSynctex }                       from './modules/synctex.js';
import { initFileOps }                       from './modules/filetree.js';
import { initCompile }                       from './modules/compile.js';
import { initModals }                        from './modules/modals.js';
import { loadHomeView, enterProject, initHome } from './modules/home.js';

// ── pdf.js worker ─────────────────────────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Theme ─────────────────────────────────────────────────────────────────────
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  $('home-theme-toggle').checked   = isLight;
  $('editor-theme-toggle').checked = isLight;
  if (state.editor) state.editor.setOption('theme', isLight ? 'default' : 'dracula');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  // One-time migration: clear stale cached main file entries
  if (localStorage.getItem('mainFilesVer') !== '2') {
    localStorage.removeItem('mainFiles');
    localStorage.removeItem('manualMainFiles');
    localStorage.setItem('mainFilesVer', '2');
    state.mainFiles       = {};
    state.manualMainFiles = {};
  }
  // Always reset manual overrides on page load so auto-detect runs
  state.manualMainFiles = {};
  localStorage.setItem('manualMainFiles', JSON.stringify(state.manualMainFiles));

  // Init all subsystems
  initEditor();
  initToolbar();
  initSidebarToggles();
  initFullscreen();
  initFind();
  initCompile();
  initPdfControls();
  initSynctex();
  initFileOps();
  initModals();
  initHome();

  // Global context menu dismiss
  document.addEventListener('click', () => hideContextMenu());

  // Theme toggles
  $('home-theme-toggle').addEventListener('change', e => {
    S.theme = e.target.checked ? 'light' : 'dark';
    saveSettings(); applyTheme(S.theme);
  });
  $('editor-theme-toggle').addEventListener('change', e => {
    S.theme = e.target.checked ? 'light' : 'dark';
    saveSettings(); applyTheme(S.theme);
  });

  applyTheme(S.theme);
  $('compiler-select').value = S.compiler;

  // Load home view, then re-enter last open project
  const projects = await loadHomeView();
  const last = localStorage.getItem('currentProject');
  if (last && Array.isArray(projects) && projects.includes(last)) {
    await enterProject(last);
  }
}

init();

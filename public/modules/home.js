import { state, getMainFile, $ } from './state.js';
import { api, enc, esc, flatTree } from './api.js';
import { S } from './settings.js';
import { openTab } from './tabs.js';
import { refreshTree, loadBibKeys } from './filetree.js';
import { loadPdfDoc, resetPdfPanel } from './pdfviewer.js';
import { initResize } from './resize.js';
import { showModal } from './modals.js';

// ── Home view ─────────────────────────────────────────────────────────────────
export async function loadHomeView() {
  const projects = await api('GET', '/api/projects');
  const grid = $('project-grid');
  grid.innerHTML = '';

  if (!projects.length) {
    grid.innerHTML = '<div class="home-empty">No projects yet. Create one to get started.</div>';
    return projects;
  }

  projects.forEach(name => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-actions">
        <button class="pc-btn" data-action="export" title="Export ZIP">⬇</button>
        <button class="pc-btn danger" data-action="delete" title="Delete">🗑</button>
      </div>
      <span class="project-card-icon">📄</span>
      <span class="project-card-name">${esc(name)}</span>`;

    card.addEventListener('click', e => {
      if (e.target.closest('.project-card-actions')) return;
      enterProject(name);
    });
    card.querySelector('[data-action="export"]').addEventListener('click', e => {
      e.stopPropagation();
      const a = document.createElement('a');
      a.href = `/api/export/${enc(name)}`; a.download = `${name}.zip`; a.click();
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Permanently delete project "${name}" and all its files?`)) return;
      await api('DELETE', `/api/projects/${enc(name)}`);
      await loadHomeView();
    });
    grid.appendChild(card);
  });

  return projects;
}

// ── Enter project ─────────────────────────────────────────────────────────────
export async function enterProject(name) {
  state.project   = name;
  state.tabs      = [];
  state.activeIdx = -1;

  $('view-home').classList.add('hidden');
  $('view-editor').classList.remove('hidden');
  $('project-name-label').textContent = name;
  $('compiler-select').value = S.compiler;

  state.suppress = true; state.editor.setValue(''); state.suppress = false;

  const { renderTabs } = await import('./tabs.js');
  renderTabs();
  resetPdfPanel();
  localStorage.setItem('currentProject', name);

  // Validate / auto-detect the correct main file (one with \documentclass)
  if (!state.manualMainFiles[name]) {
    const current = state.mainFiles[name] || '';
    const det = await api('GET', `/api/detect-main?project=${enc(name)}&current=${enc(current)}`);
    if (det.mainFile) {
      state.mainFiles[name] = det.mainFile;
      localStorage.setItem('mainFiles', JSON.stringify(state.mainFiles));
    }
  }

  await refreshTree();
  await loadBibKeys();
  initResize();

  // Show pre-compiled PDF if one exists
  const mf      = getMainFile();
  const pdfRes  = await fetch(`/api/pdf?project=${enc(name)}&mainFile=${enc(mf)}`, { method: 'HEAD' });
  if (pdfRes.ok) await loadPdfDoc(`/api/pdf?project=${enc(name)}&mainFile=${enc(mf)}&t=${Date.now()}`);

  // Auto-open main .tex file
  const tree     = await api('GET', `/api/files?project=${enc(name)}`);
  const allFiles = flatTree(tree);
  const mainF    = allFiles.find(f => f.path === getMainFile()) ||
                   allFiles.find(f => f.path.endsWith('.tex'));
  if (mainF) openTab(mainF.path);
}

// ── Export / import ───────────────────────────────────────────────────────────
export async function doImportZip(file) {
  const form = new FormData(); form.append('file', file);
  const r = await fetch('/api/import', { method: 'POST', body: form });
  const d = await r.json();
  if (d.error) return alert('Import failed: ' + d.error);
  await loadHomeView();
  enterProject(d.project);
}

// ── Template modal ────────────────────────────────────────────────────────────
let chosenTemplate = null;

async function openTemplateModal() {
  const list = await api('GET', '/api/templates');
  const grid = $('template-grid');
  grid.innerHTML = ''; chosenTemplate = null;
  list.forEach(t => {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `<div class="tpl-icon">${t.icon}</div><div class="tpl-name">${t.name}</div><div class="tpl-desc">${t.description}</div>`;
    card.addEventListener('click', () => {
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('chosen'));
      card.classList.add('chosen'); chosenTemplate = t.id;
    });
    grid.appendChild(card);
  });
  $('template-overlay').classList.remove('hidden');
  $('template-name').value = '';
  setTimeout(() => $('template-name').focus(), 50);
}

async function createFromTemplate() {
  const name = $('template-name').value.trim();
  if (!name) return alert('Enter a project name.');
  if (!chosenTemplate) return alert('Pick a template.');
  const r = await api('POST', `/api/templates/${chosenTemplate}`, { project: name });
  if (r.error) return alert(r.error);
  $('template-overlay').classList.add('hidden');
  enterProject(name);
}

// ── Init home wiring ──────────────────────────────────────────────────────────
export function initHome() {
  // Home header buttons
  $('home-new-btn').addEventListener('click', () => {
    showModal('New Project', 'project-name', async name => {
      const r = await api('POST', '/api/projects', { name });
      if (r.error) return alert(r.error);
      enterProject(name);
    });
  });
  $('home-template-btn').addEventListener('click', openTemplateModal);
  $('home-import-btn').addEventListener('click', () => {
    $('import-input').value = ''; $('import-input').click();
  });
  $('import-input').addEventListener('change', async () => {
    const f = $('import-input').files[0];
    if (f) await doImportZip(f);
  });

  // Back button
  $('back-btn').addEventListener('click', async () => {
    const { saveActiveTab } = await import('./tabs.js');
    await saveActiveTab();
    $('view-editor').classList.add('hidden');
    $('view-home').classList.remove('hidden');
    await loadHomeView();
  });

  // Editor header export
  $('export-btn').addEventListener('click', () => {
    if (!state.project) return;
    const a = document.createElement('a');
    a.href = `/api/export/${enc(state.project)}`; a.download = `${state.project}.zip`; a.click();
  });

  // Template overlay
  $('template-close').addEventListener('click', () => $('template-overlay').classList.add('hidden'));
  $('template-overlay').addEventListener('click', e => {
    if (e.target === $('template-overlay')) $('template-overlay').classList.add('hidden');
  });
  $('template-grid').addEventListener('dblclick', async e => {
    if (e.target.closest('.template-card') && chosenTemplate) await createFromTemplate();
  });
  document.addEventListener('keydown', async e => {
    if (e.key === 'Enter' && !$('template-overlay').classList.contains('hidden') && chosenTemplate)
      await createFromTemplate();
  });
}

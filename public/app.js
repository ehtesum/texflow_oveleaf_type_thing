'use strict';

// ── Settings ───────────────────────────────────────────────────────────────────
const DEFAULTS = {
  theme: 'dark', fontSize: 14, compiler: 'pdflatex',
  wordWrap: true, lineNumbers: true, doubleCompile: false, autosave: 1200,
};
let S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
function saveSettings() { localStorage.setItem('settings', JSON.stringify(S)); }

// ── State ──────────────────────────────────────────────────────────────────────
let project   = null;
let tabs      = [];
let activeIdx = -1;
let editor    = null;
let bibKeys   = [];
let pdfZoom   = 1.0;
let autoTimer = null;
let suppress  = false;
let mainFiles       = JSON.parse(localStorage.getItem('mainFiles')       || '{}');
let manualMainFiles = JSON.parse(localStorage.getItem('manualMainFiles') || '{}');

// pdf.js state
const BASE_SCALE = 1.5;
let pdfDoc      = null;
let pdfPageInfo = {};   // { pageNum: { canvas, width_pt, height_pt } }

// Setup pdf.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── DOM refs ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── API ────────────────────────────────────────────────────────────────────────
const enc = encodeURIComponent;
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r  = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

// ── Theme ──────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  $('home-theme-toggle').checked   = isLight;
  $('editor-theme-toggle').checked = isLight;
  if (editor) editor.setOption('theme', isLight ? 'default' : 'dracula');
}

$('home-theme-toggle').addEventListener('change', e => {
  S.theme = e.target.checked ? 'light' : 'dark';
  saveSettings(); applyTheme(S.theme);
});
$('editor-theme-toggle').addEventListener('change', e => {
  S.theme = e.target.checked ? 'light' : 'dark';
  saveSettings(); applyTheme(S.theme);
});

// ── Main file per project ──────────────────────────────────────────────────────
function getMainFile() { return mainFiles[project] || 'main.tex'; }
function setMainFile(path) {
  mainFiles[project] = path;
  manualMainFiles[project] = true;
  localStorage.setItem('mainFiles', JSON.stringify(mainFiles));
  localStorage.setItem('manualMainFiles', JSON.stringify(manualMainFiles));
  refreshTree();
}

// ── Context menu ───────────────────────────────────────────────────────────────
let ctxMenu = null;
function showContextMenu(x, y, items) {
  hideContextMenu();
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  items.forEach(({ label, action }) => {
    const el = document.createElement('div');
    el.className = 'ctx-item';
    el.textContent = label;
    el.addEventListener('click', e => { e.stopPropagation(); hideContextMenu(); action(); });
    ctxMenu.appendChild(el);
  });
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  document.body.appendChild(ctxMenu);
  const r = ctxMenu.getBoundingClientRect();
  if (r.right  > window.innerWidth)  ctxMenu.style.left = (x - r.width)  + 'px';
  if (r.bottom > window.innerHeight) ctxMenu.style.top  = (y - r.height) + 'px';
}
function hideContextMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
document.addEventListener('click', () => hideContextMenu());

// ══════════════════════════════════════════════════════════════════════════════
//  HOME VIEW
// ══════════════════════════════════════════════════════════════════════════════
async function loadHomeView() {
  const projects = await api('GET', '/api/projects');
  const grid = $('project-grid');
  grid.innerHTML = '';

  if (!projects.length) {
    grid.innerHTML = '<div class="home-empty">No projects yet. Create one to get started.</div>';
    return;
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
}

// ── Home view buttons ──────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
//  EDITOR ENTRY / EXIT
// ══════════════════════════════════════════════════════════════════════════════
async function enterProject(name) {
  project   = name;
  tabs      = [];
  activeIdx = -1;
  pdfDoc    = null;
  pdfPageInfo = {};

  $('view-home').classList.add('hidden');
  $('view-editor').classList.remove('hidden');
  $('project-name-label').textContent = name;
  $('compiler-select').value = S.compiler;

  suppress = true; editor.setValue(''); suppress = false;
  renderTabs();
  resetPdfPanel();

  localStorage.setItem('currentProject', name);

  // Always validate the stored main file against the server.
  // Server checks if it has \documentclass — if it's a chapter file, auto-corrects.
  // Right-click "Set as main file" marks it manual for the session, skipping this.
  if (!manualMainFiles[name]) {
    const current = mainFiles[name] || '';
    const det = await api('GET', `/api/detect-main?project=${enc(name)}&current=${enc(current)}`);
    if (det.mainFile) {
      mainFiles[name] = det.mainFile;
      localStorage.setItem('mainFiles', JSON.stringify(mainFiles));
    }
  }

  await refreshTree();
  await loadBibKeys();
  initResize();

  // Try to show pre-compiled PDF
  const mf = getMainFile();
  const pdfRes = await fetch(`/api/pdf?project=${enc(name)}&mainFile=${enc(mf)}`, { method: 'HEAD' });
  if (pdfRes.ok) {
    await loadPdfDoc(`/api/pdf?project=${enc(name)}&mainFile=${enc(mf)}&t=${Date.now()}`);
  }

  // Auto-open main file or first .tex
  const tree    = await api('GET', `/api/files?project=${enc(name)}`);
  const allFiles = flatTree(tree);
  const mainF   = allFiles.find(f => f.path === getMainFile()) ||
                   allFiles.find(f => f.path.endsWith('.tex'));
  if (mainF) openTab(mainF.path);
}

$('back-btn').addEventListener('click', async () => {
  await saveActiveTab();
  $('view-editor').classList.add('hidden');
  $('view-home').classList.remove('hidden');
  await loadHomeView();
});

// ══════════════════════════════════════════════════════════════════════════════
//  EDITOR INIT
// ══════════════════════════════════════════════════════════════════════════════
function initEditor() {
  editor = CodeMirror($('editor-container'), {
    value: '',
    mode: 'stex',
    theme: S.theme === 'light' ? 'default' : 'dracula',
    lineNumbers: S.lineNumbers,
    lineWrapping: S.wordWrap,
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      'Ctrl-S':     () => saveActiveTab(),
      'Ctrl-Enter': () => compile(),
      'F5':         () => compile(),
      'Ctrl-F':     () => openFindBar(),
      'Ctrl-H':     () => openFindBar(),
      'Escape':     () => closeFindBar(),
      'Ctrl-Alt-F': () => doForwardSync(),
    },
    hintOptions: { completeSingle: false },
  });

  editor.on('change', () => {
    if (suppress) return;
    const tab = activeTab();
    if (!tab) return;
    tab.content  = editor.getValue();
    tab.modified = true;
    renderTabs();
    buildOutline(tab.content);
    clearTimeout(autoTimer);
    autoTimer = setTimeout(saveActiveTab, S.autosave);
    updateStatus();
  });

  editor.on('cursorActivity', updateStatus);

  editor.on('inputRead', (_cm, change) => {
    if (!change.text[0] || change.text[0].length !== 1) return;
    const cur    = editor.getCursor();
    const before = editor.getLine(cur.line).substring(0, cur.ch);
    const m = before.match(/\\cite\{([^}]*)$/);
    if (m && bibKeys.length) {
      const prefix   = m[1];
      const filtered = bibKeys.filter(k => k.toLowerCase().startsWith(prefix.toLowerCase()));
      if (!filtered.length) return;
      CodeMirror.showHint(editor, () => ({
        list: filtered,
        from: CodeMirror.Pos(cur.line, cur.ch - prefix.length),
        to:   cur,
      }), { completeSingle: false });
    }
  });

  applyFontSize(S.fontSize);

  // Alt+click → forward sync
  editor.getWrapperElement().addEventListener('click', e => {
    if (e.altKey) { e.preventDefault(); doForwardSync(); }
  });
}

function applyFontSize(px) {
  $('editor-container').style.fontSize = px + 'px';
  if (editor) editor.refresh();
}

function setEditorMode(path) {
  editor.setOption('mode', path.endsWith('.md') ? 'markdown' : 'stex');
}

// ── Formatting toolbar ─────────────────────────────────────────────────────────
function wrapSelection(before, after) {
  const sel = editor.getSelection();
  if (sel) {
    editor.replaceSelection(before + sel + after);
  } else {
    const cur = editor.getCursor();
    editor.replaceRange(before + after, cur);
    editor.setCursor({ line: cur.line, ch: cur.ch + before.length });
  }
  editor.focus();
}

$('tb-undo').addEventListener('click',   () => editor.undo());
$('tb-redo').addEventListener('click',   () => editor.redo());
$('tb-bold').addEventListener('click',   () => wrapSelection('\\textbf{', '}'));
$('tb-italic').addEventListener('click', () => wrapSelection('\\textit{', '}'));
$('tb-uline').addEventListener('click',  () => wrapSelection('\\underline{', '}'));
$('tb-math-i').addEventListener('click', () => wrapSelection('$', '$'));
$('tb-math-d').addEventListener('click', () => wrapSelection('\\[\n', '\n\\]'));
$('tb-find').addEventListener('click',   openFindBar);

// ── File outline ───────────────────────────────────────────────────────────────
function buildOutline(text) {
  const el = $('file-outline');
  const cmds = [
    { re: /^\\chapter\*?\s*\{([^}]+)\}/,        lv: 'lv0' },
    { re: /^\\section\*?\s*\{([^}]+)\}/,         lv: 'lv1' },
    { re: /^\\subsection\*?\s*\{([^}]+)\}/,      lv: 'lv2' },
    { re: /^\\subsubsection\*?\s*\{([^}]+)\}/,   lv: 'lv3' },
  ];
  const items = [];
  text.split('\n').forEach((line, lineNum) => {
    const stripped = line.trimStart();
    for (const { re, lv } of cmds) {
      const m = stripped.match(re);
      if (m) { items.push({ title: m[1], lv, line: lineNum }); break; }
    }
  });

  if (!items.length) {
    el.innerHTML = '<div class="outline-empty">No sections found.</div>';
    return;
  }
  el.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = `outline-item ${item.lv}`;
    div.textContent = item.title;
    div.addEventListener('click', () => {
      editor.setCursor({ line: item.line, ch: 0 });
      editor.scrollIntoView({ line: item.line, ch: 0 }, 100);
      editor.focus();
    });
    el.appendChild(div);
  });
}

// Collapse / expand sidebar sections
$('sb-ft-head').addEventListener('click', () => {
  const tree = $('file-tree');
  const caret = $('ft-caret');
  const collapsed = tree.style.display === 'none';
  tree.style.display = collapsed ? '' : 'none';
  caret.classList.toggle('collapsed', !collapsed);
});
$('sb-ol-head').addEventListener('click', () => {
  const outline = $('file-outline');
  const caret = $('ol-caret');
  const collapsed = outline.style.display === 'none';
  outline.style.display = collapsed ? '' : 'none';
  caret.classList.toggle('collapsed', !collapsed);
});

// ── Tabs ───────────────────────────────────────────────────────────────────────
function activeTab() { return tabs[activeIdx] || null; }

async function openTab(path) {
  const existing = tabs.findIndex(t => t.path === path);
  if (existing >= 0) { await switchTab(existing); return; }
  tabs.push({ path, content: undefined, modified: false, cursor: null, scroll: null });
  renderTabs();
  await switchTab(tabs.length - 1);
}

async function switchTab(idx) {
  if (activeIdx >= 0 && tabs[activeIdx]) {
    tabs[activeIdx].content = editor.getValue();
    tabs[activeIdx].cursor  = editor.getCursor();
    tabs[activeIdx].scroll  = editor.getScrollInfo();
  }
  activeIdx = idx;
  const tab = tabs[idx];
  if (!tab) return;

  if (tab.content === undefined) {
    const text = await api('GET', `/api/file?project=${enc(project)}&file=${enc(tab.path)}`);
    tab.content = typeof text === 'string' ? text : '';
    tab.savedContent = tab.content;
  }

  suppress = true;
  editor.setValue(tab.content);
  suppress = false;
  editor.clearHistory();
  if (tab.cursor) editor.setCursor(tab.cursor);
  if (tab.scroll) editor.scrollTo(tab.scroll.left, tab.scroll.top);
  setEditorMode(tab.path);
  buildOutline(tab.content);
  renderTabs();
  updateStatus();
}

function closeTab(idx) {
  const tab = tabs[idx];
  if (!tab) return;
  if (tab.modified && !confirm(`${tab.path} has unsaved changes. Close anyway?`)) return;
  tabs.splice(idx, 1);
  if (!tabs.length) {
    activeIdx = -1;
    suppress = true; editor.setValue(''); suppress = false;
    buildOutline('');
    renderTabs(); updateStatus(); return;
  }
  const newIdx = Math.min(idx, tabs.length - 1);
  activeIdx = newIdx - 1;
  switchTab(newIdx);
}

function renderTabs() {
  const tabsEl = $('tabs');
  tabsEl.innerHTML = '';
  tabs.forEach((tab, i) => {
    const name = tab.path.split('/').pop();
    const div  = document.createElement('div');
    div.className = 'tab' + (i === activeIdx ? ' active' : '');
    div.innerHTML = `
      <span class="tab-name" title="${tab.path}">${esc(name)}</span>
      ${tab.modified ? '<span class="tab-modified">•</span>' : ''}
      <button class="tab-close" title="Close">✕</button>`;
    div.addEventListener('click', e => {
      if (e.target.classList.contains('tab-close')) return;
      switchTab(i);
    });
    div.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation(); closeTab(i);
    });
    tabsEl.appendChild(div);
  });
}

// ── Find / Replace ─────────────────────────────────────────────────────────────
function openFindBar()  { $('find-bar').classList.remove('hidden'); $('find-input').focus(); $('find-input').select(); }
function closeFindBar() { $('find-bar').classList.add('hidden'); editor.focus(); }

function buildQuery() {
  const raw = $('find-input').value;
  if (!raw) return null;
  if ($('find-regex').checked) {
    try { return new RegExp(raw, $('find-case').checked ? '' : 'i'); } catch { return null; }
  }
  return raw;
}

let searchMatches = [], matchIdx = -1;
function computeMatches() {
  const q = buildQuery(); searchMatches = [];
  if (!q) { $('find-count').textContent = ''; return; }
  const cur = editor.getSearchCursor(q, { line: 0, ch: 0 }, !$('find-case').checked);
  while (cur.findNext()) searchMatches.push({ from: cur.from(), to: cur.to() });
  $('find-count').textContent = searchMatches.length ? `${searchMatches.length} matches` : 'No results';
}

function findDir(reverse) {
  const q = buildQuery(); if (!q) return;
  computeMatches(); if (!searchMatches.length) return;
  const cur = editor.getCursor();
  if (reverse) {
    matchIdx = searchMatches.findLastIndex(m =>
      m.from.line < cur.line || (m.from.line === cur.line && m.from.ch < cur.ch));
    if (matchIdx < 0) matchIdx = searchMatches.length - 1;
  } else {
    matchIdx = searchMatches.findIndex(m =>
      m.from.line > cur.line || (m.from.line === cur.line && m.from.ch >= cur.ch));
    if (matchIdx < 0) matchIdx = 0;
  }
  const m = searchMatches[matchIdx];
  editor.setSelection(m.from, m.to);
  editor.scrollIntoView({ from: m.from, to: m.to }, 60);
}

function doReplaceOne() {
  const q = buildQuery(), r = $('replace-input').value; if (!q) return;
  const cur = editor.getSearchCursor(q, editor.getCursor('from'), !$('find-case').checked);
  if (cur.findNext()) { cur.replace(r); editor.setSelection(cur.from(), cur.to()); }
}

function doReplaceAll() {
  const q = buildQuery(), r = $('replace-input').value; if (!q) return;
  const cur = editor.getSearchCursor(q, { line: 0, ch: 0 }, !$('find-case').checked);
  let count = 0;
  editor.operation(() => { while (cur.findNext()) { cur.replace(r); count++; } });
  $('find-count').textContent = `Replaced ${count}`;
}

$('find-close').addEventListener('click', closeFindBar);
$('find-next') .addEventListener('click', () => findDir(false));
$('find-prev') .addEventListener('click', () => findDir(true));
$('replace-one').addEventListener('click', doReplaceOne);
$('replace-all').addEventListener('click', doReplaceAll);
$('find-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.shiftKey ? findDir(true) : findDir(false); }
  if (e.key === 'Escape') closeFindBar();
});
$('find-input').addEventListener('input', computeMatches);

// ── File tree ──────────────────────────────────────────────────────────────────
async function refreshTree() {
  if (!project) return;
  const tree = await api('GET', `/api/files?project=${enc(project)}`);
  const el = $('file-tree');
  el.innerHTML = '';
  if (!Array.isArray(tree) || !tree.length) {
    el.innerHTML = '<div style="padding:10px;color:#666;font-size:11px;">No files.</div>';
    return;
  }
  renderTree(tree, el);
}

function renderTree(nodes, container) {
  nodes.forEach(node => {
    const item = document.createElement('div');
    item.className = 'tree-item';
    if (node.type === 'directory') {
      const kids = document.createElement('div');
      kids.className = 'tree-children';
      item.innerHTML = `<span class="tree-icon">📂</span><span class="tree-name">${esc(node.name)}</span>`;
      item.addEventListener('click', e => {
        e.stopPropagation();
        const open = kids.style.display !== 'none';
        kids.style.display = open ? 'none' : 'block';
        item.querySelector('.tree-icon').textContent = open ? '📁' : '📂';
      });
      renderTree(node.children || [], kids);
      container.appendChild(item);
      container.appendChild(kids);
    } else {
      const del = document.createElement('button');
      del.className = 'tree-del'; del.textContent = '✕'; del.title = 'Delete';
      del.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete ${node.name}?`)) return;
        await api('DELETE', `/api/file?project=${enc(project)}&file=${enc(node.path)}`);
        const ti = tabs.findIndex(t => t.path === node.path);
        if (ti >= 0) closeTab(ti);
        await refreshTree(); await loadBibKeys();
      });
      const isMain = node.path === getMainFile();
      item.innerHTML = `
        <span class="tree-icon">${fileIcon(node.name)}</span>
        <span class="tree-name" title="${esc(node.path)}">${esc(node.name)}</span>
        ${isMain ? '<span class="main-badge" title="Main file">M</span>' : ''}`;
      item.appendChild(del);
      if (tabs[activeIdx]?.path === node.path) item.classList.add('active');
      item.addEventListener('click', () => openTab(node.path));
      if (node.name.endsWith('.tex')) {
        item.addEventListener('contextmenu', e => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            { label: isMain ? '✓ Main file (current)' : 'Set as main file', action: () => setMainFile(node.path) },
            { label: 'Open', action: () => openTab(node.path) },
          ]);
        });
      }
      container.appendChild(item);
    }
  });
}

function fileIcon(name) {
  if (name.endsWith('.tex'))                        return '📄';
  if (name.endsWith('.bib'))                        return '📚';
  if (name.endsWith('.pdf'))                        return '📕';
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(name))  return '🖼';
  if (/\.(cls|sty)$/.test(name))                   return '🔧';
  return '📃';
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Open / save ────────────────────────────────────────────────────────────────
const EDITABLE = new Set(['.tex','.bib','.txt','.cls','.sty','.md','.cfg','.def']);

async function saveActiveTab() {
  const tab = activeTab();
  if (!tab || !project) return;
  clearTimeout(autoTimer);
  tab.content = editor.getValue();
  await api('POST', '/api/file', { project, file: tab.path, content: tab.content });
  tab.modified = false;
  tab.savedContent = tab.content;
  renderTabs();
  $('save-status').textContent = '✓ Saved';
  setTimeout(() => { $('save-status').textContent = ''; }, 1400);
  if (tab.path.endsWith('.bib')) await loadBibKeys();
}

// ── BibTeX keys ────────────────────────────────────────────────────────────────
function flatTree(nodes) {
  const r = [];
  (nodes || []).forEach(n => {
    if (n.type === 'file') r.push(n);
    else r.push(...flatTree(n.children));
  });
  return r;
}

async function loadBibKeys() {
  bibKeys = [];
  if (!project) return;
  const tree = await api('GET', `/api/files?project=${enc(project)}`);
  const bibs = flatTree(tree).filter(f => f.path.endsWith('.bib'));
  for (const b of bibs) {
    const text = await api('GET', `/api/file?project=${enc(project)}&file=${enc(b.path)}`);
    if (typeof text !== 'string') continue;
    for (const m of text.matchAll(/@\w+\{([^,\s]+)/g))
      if (!bibKeys.includes(m[1])) bibKeys.push(m[1]);
  }
}

// ── New file / folder ──────────────────────────────────────────────────────────
$('new-file-btn').addEventListener('click', () => {
  if (!project) return;
  showModal('New File', 'filename.tex', async name => {
    await api('POST', '/api/create', { project, name, type: 'file' });
    await refreshTree();
    openTab(name);
  });
});
$('new-folder-btn').addEventListener('click', () => {
  if (!project) return;
  showModal('New Folder', 'folder-name', async name => {
    await api('POST', '/api/create', { project, name, type: 'directory' });
    await refreshTree();
  });
});

// ── Upload ─────────────────────────────────────────────────────────────────────
$('upload-btn').addEventListener('click', () => {
  if (!project) return; $('upload-input').value = ''; $('upload-input').click();
});
$('upload-input').addEventListener('change', () => doUpload($('upload-input').files));

async function doUpload(files) {
  if (!files?.length || !project) return;
  const form = new FormData();
  form.append('project', project);
  for (const f of files) form.append('files', f);
  const r = await fetch('/api/upload', { method: 'POST', body: form });
  const d = await r.json();
  if (d.error) return alert('Upload failed: ' + d.error);
  showCompileStatus(`✓ Uploaded: ${d.uploaded.join(', ')}`, '');
  await refreshTree(); await loadBibKeys();
}

// ── Drag-drop upload ───────────────────────────────────────────────────────────
let dragCounter = 0;
document.addEventListener('dragenter', e => {
  e.preventDefault(); dragCounter++;
  $('drop-overlay').classList.remove('hidden');
});
document.addEventListener('dragleave', () => {
  dragCounter--; if (dragCounter <= 0) { dragCounter = 0; $('drop-overlay').classList.add('hidden'); }
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
  e.preventDefault(); dragCounter = 0; $('drop-overlay').classList.add('hidden');
  const files = e.dataTransfer.files;
  if (files.length === 1 && files[0].name.endsWith('.zip')) {
    if (confirm(`Import "${files[0].name}" as a new project?`)) {
      await doImportZip(files[0]); return;
    }
  }
  await doUpload(files);
});

// ── Compile ────────────────────────────────────────────────────────────────────
$('compile-btn').addEventListener('click', compile);
$('err-badge').addEventListener('click', openLog);

async function compile() {
  if (!project) return;
  await saveActiveTab();

  $('compile-btn').disabled = true;
  $('compile-spinner').classList.remove('hidden');
  showCompileStatus('Compiling…', '');
  $('compile-log').innerHTML = '';

  const r = await api('POST', '/api/compile', {
    project, mainFile: getMainFile(),
    compiler: $('compiler-select').value,
    doubleCompile: S.doubleCompile,
  });

  $('compile-btn').disabled = false;
  $('compile-spinner').classList.add('hidden');

  // If server auto-detected a different main file, save it
  if (r.mainFile && r.mainFile !== getMainFile()) {
    mainFiles[project] = r.mainFile;
    localStorage.setItem('mainFiles', JSON.stringify(mainFiles));
    refreshTree();
  }

  if (r.success) {
    showCompileStatus('✓ Compiled', 'ok');
    $('log-badge').textContent = '✓ OK'; $('log-badge').className = 'log-badge ok';
    $('err-badge').classList.add('hidden');
    // Reload PDF preserving current page
    const curPage = parseInt($('pdf-page-input').value) || 1;
    await loadPdfDoc(`/api/pdf?project=${enc(project)}&mainFile=${enc(getMainFile())}&t=${Date.now()}`);
    if (curPage > 1) setTimeout(() => scrollPdfToPage(curPage), 100);
  } else {
    showCompileStatus('✗ Error', 'err');
    $('log-badge').textContent = '✗ Error'; $('log-badge').className = 'log-badge err';
    const errCount = (r.log || '').match(/^!/gm)?.length || 0;
    if (errCount > 0) { $('err-badge').textContent = errCount; $('err-badge').classList.remove('hidden'); }
  }

  renderLog(r.log || '');
  if (!$('log-panel').classList.contains('expanded')) openLog();
}

function showCompileStatus(msg, cls) {
  const el = $('compile-status');
  el.textContent = msg;
  el.className   = 'compile-status' + (cls ? ' ' + cls : '');
}

function renderLog(raw) {
  const el = $('compile-log');
  el.innerHTML = '';
  raw.split('\n').forEach(line => {
    const span = document.createElement('span');
    if (/^!/.test(line) || /error/i.test(line))   span.className = 'log-error';
    else if (/warning/i.test(line))                span.className = 'log-warning';
    else if (/^This is|^Output/i.test(line))       span.className = 'log-info';
    span.textContent = line + '\n';
    el.appendChild(span);
  });
  el.scrollTop = el.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PDF — pdf.js rendering
// ══════════════════════════════════════════════════════════════════════════════
function resetPdfPanel() {
  $('pdf-placeholder').classList.remove('hidden');
  $('pdf-canvas-container').classList.add('hidden');
  $('pdf-canvas-container').innerHTML = '';
  $('pdf-total-pages').textContent = '—';
  $('pdf-page-input').value = 1;
  pdfDoc = null; pdfPageInfo = {};
}

async function loadPdfDoc(url) {
  if (typeof pdfjsLib === 'undefined') {
    console.warn('pdf.js not loaded');
    return;
  }
  if (pdfDoc) { try { pdfDoc.destroy(); } catch(e) {} }
  pdfDoc = null; pdfPageInfo = {};

  const container = $('pdf-canvas-container');
  container.innerHTML = '<div class="pdf-loading">Rendering PDF…</div>';
  container.classList.remove('hidden');
  $('pdf-placeholder').classList.add('hidden');

  try {
    pdfDoc = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
    const total = pdfDoc.numPages;
    $('pdf-total-pages').textContent = total;
    $('pdf-page-input').max = total;

    container.innerHTML = '';
    for (let i = 1; i <= total; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-page-wrapper';
      wrapper.dataset.page = i;
      container.appendChild(wrapper);
      await renderPdfPage(i, wrapper);
    }

    setupPageObserver();
    autoFitPdf();
  } catch (e) {
    container.innerHTML = `<div class="pdf-loading" style="color:#f66">Error loading PDF: ${e.message}</div>`;
  }
}

async function renderPdfPage(pageNum, wrapper) {
  const page = await pdfDoc.getPage(pageNum);
  const vp1  = page.getViewport({ scale: 1 });             // raw PDF units (points)
  const vp   = page.getViewport({ scale: BASE_SCALE });    // rendered size

  const canvas = document.createElement('canvas');
  canvas.width  = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width  = Math.floor(vp.width  * pdfZoom) + 'px';
  canvas.style.height = Math.floor(vp.height * pdfZoom) + 'px';
  canvas.title = 'Click to jump to source line';
  wrapper.appendChild(canvas);

  pdfPageInfo[pageNum] = { canvas, width_pt: vp1.width, height_pt: vp1.height };

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  page.cleanup();

  // Inverse sync: click on PDF page → jump to source
  canvas.addEventListener('click', async e => {
    const rect = canvas.getBoundingClientRect();
    const x_pt = ((e.clientX - rect.left) / rect.width)  * vp1.width;
    const y_pt = ((e.clientY - rect.top)  / rect.height) * vp1.height;
    await doInverseSync(pageNum, x_pt, y_pt);
  });
}

function autoFitPdf() {
  const container = $('pdf-canvas-container');
  const info = pdfPageInfo[1];
  if (!info) return;
  const avail = container.clientWidth - 24;
  const natural = info.canvas.width;
  if (natural > 0) {
    pdfZoom = Math.max(0.25, Math.min(3, avail / natural));
    updatePdfZoom();
  }
}

function updatePdfZoom() {
  $('pdf-zoom-label').textContent = Math.round(pdfZoom * 100) + '%';
  Object.values(pdfPageInfo).forEach(info => {
    if (!info || !info.canvas) return;
    info.canvas.style.width  = Math.floor(info.canvas.width  * pdfZoom) + 'px';
    info.canvas.style.height = Math.floor(info.canvas.height * pdfZoom) + 'px';
  });
}

function scrollPdfToPage(pageNum) {
  const container = $('pdf-canvas-container');
  const wrapper   = container.querySelector(`[data-page="${pageNum}"]`);
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

// PDF nav buttons
$('pdf-zoom-in') .addEventListener('click', () => { pdfZoom = Math.min(3, pdfZoom + 0.25); updatePdfZoom(); });
$('pdf-zoom-out').addEventListener('click', () => { pdfZoom = Math.max(0.25, pdfZoom - 0.25); updatePdfZoom(); });
$('pdf-prev-page').addEventListener('click', () => {
  const cur = parseInt($('pdf-page-input').value) || 1;
  if (cur > 1) { scrollPdfToPage(cur - 1); }
});
$('pdf-next-page').addEventListener('click', () => {
  const cur   = parseInt($('pdf-page-input').value) || 1;
  const total = parseInt($('pdf-total-pages').textContent) || 1;
  if (cur < total) { scrollPdfToPage(cur + 1); }
});
$('pdf-page-input').addEventListener('change', () => {
  const p = parseInt($('pdf-page-input').value);
  if (p >= 1) scrollPdfToPage(p);
});

$('download-btn').addEventListener('click', () => {
  if (!project) return;
  const a = document.createElement('a');
  a.href = `/api/pdf?project=${enc(project)}&mainFile=${enc(getMainFile())}&t=${Date.now()}`; a.download = `${project}.pdf`; a.click();
});

// ══════════════════════════════════════════════════════════════════════════════
//  SYNCTEX
// ══════════════════════════════════════════════════════════════════════════════
async function doForwardSync() {
  const tab = activeTab();
  if (!tab || !tab.path.endsWith('.tex') || !project) return;
  const line = editor.getCursor().line + 1;
  const r = await api('POST', '/api/synctex', {
    project, file: tab.path, line, mainFile: getMainFile(),
  });
  if (r.error) { console.warn('Forward sync:', r.error); return; }
  if (r.page) scrollPdfToPage(r.page);
}

async function doInverseSync(pageNum, x_pt, y_pt) {
  if (!project) return;
  const r = await api('POST', '/api/synctex/edit', {
    project, mainFile: getMainFile(), page: pageNum, x: x_pt, y: y_pt,
  });
  if (r.error || !r.file || !r.line) {
    if (r.error && r.error !== 'No synctex match') console.warn('Inverse sync:', r.error);
    return;
  }
  await openTab(r.file);
  const lineNum = r.line - 1;
  editor.setCursor({ line: lineNum, ch: r.column || 0 });
  editor.scrollIntoView({ line: lineNum, ch: 0 }, 100);
  editor.focus();
  // Flash highlight
  const from = { line: lineNum, ch: 0 };
  const to   = { line: lineNum, ch: editor.getLine(lineNum)?.length || 0 };
  const mark = editor.markText(from, to, { className: 'sync-flash' });
  setTimeout(() => mark.clear(), 1000);
}

// ── Export / Import ────────────────────────────────────────────────────────────
$('export-btn').addEventListener('click', () => {
  if (!project) return;
  const a = document.createElement('a');
  a.href = `/api/export/${enc(project)}`; a.download = `${project}.zip`; a.click();
});

$('import-input').addEventListener('change', async () => {
  const f = $('import-input').files[0];
  if (f) await doImportZip(f);
});

async function doImportZip(file) {
  const form = new FormData(); form.append('file', file);
  const r = await fetch('/api/import', { method: 'POST', body: form });
  const d = await r.json();
  if (d.error) return alert('Import failed: ' + d.error);
  await loadHomeView();
  enterProject(d.project);
}

// ── Templates ──────────────────────────────────────────────────────────────────
let chosenTemplate = null;

function openTemplateModal() {
  api('GET', '/api/templates').then(list => {
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
  });
}

$('home-template-btn').addEventListener('click', openTemplateModal);
$('template-close').addEventListener('click', () => $('template-overlay').classList.add('hidden'));
$('template-overlay').addEventListener('click', e => { if (e.target === $('template-overlay')) $('template-overlay').classList.add('hidden'); });

$('template-grid').addEventListener('dblclick', async e => {
  if (e.target.closest('.template-card') && chosenTemplate) await createFromTemplate();
});

document.addEventListener('keydown', async e => {
  if (e.key === 'Enter' && !$('template-overlay').classList.contains('hidden') && chosenTemplate)
    await createFromTemplate();
});

async function createFromTemplate() {
  const name = $('template-name').value.trim();
  if (!name) return alert('Enter a project name.');
  if (!chosenTemplate) return alert('Pick a template.');
  const r = await api('POST', `/api/templates/${chosenTemplate}`, { project: name });
  if (r.error) return alert(r.error);
  $('template-overlay').classList.add('hidden');
  enterProject(name);
}

// ── Log panel ──────────────────────────────────────────────────────────────────
function openLog() {
  $('log-panel').classList.add('expanded');
  $('compile-log').classList.remove('hidden');
  $('log-arrow').textContent = '▼';
}
$('log-toggle').addEventListener('click', () => {
  const open = $('log-panel').classList.toggle('expanded');
  $('compile-log').classList.toggle('hidden', !open);
  $('log-arrow').textContent = open ? '▼' : '▶';
});
$('clear-log').addEventListener('click', e => {
  e.stopPropagation();
  $('compile-log').innerHTML = '';
  $('log-badge').textContent = '';
});

// ── Resize handles ─────────────────────────────────────────────────────────────
function initResize() {
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
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const delta = isLeft ? (e.clientX - startX) : (startX - e.clientX);
      panel.style.width = Math.max(min, Math.min(max, startW + delta)) + 'px';
      editor && editor.refresh();
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
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
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const newH = Math.max(32, Math.min(400, startH - (e.clientY - startY)));
      lp.style.height = newH + 'px';
      if (newH > 36) { lp.classList.add('expanded'); $('compile-log').classList.remove('hidden'); }
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = ''; document.body.style.userSelect = '';
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
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => {
      const newH = Math.max(60, Math.min(500, startH - (e.clientY - startY)));
      ol.style.height = newH + 'px';
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Fullscreen ─────────────────────────────────────────────────────────────────
$('fullscreen-btn').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
});

// ── Settings ───────────────────────────────────────────────────────────────────
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

$('settings-btn').addEventListener('click', () => { populateSettings(); $('settings-overlay').classList.remove('hidden'); });
$('settings-close') .addEventListener('click', () => $('settings-overlay').classList.add('hidden'));
$('settings-cancel').addEventListener('click', () => $('settings-overlay').classList.add('hidden'));
$('settings-overlay').addEventListener('click', e => { if (e.target === $('settings-overlay')) $('settings-overlay').classList.add('hidden'); });

$('settings-save').addEventListener('click', () => {
  const comp = document.querySelector('input[name="s-compiler"]:checked');
  if (comp) S.compiler = comp.value;
  S.fontSize      = +$('s-fontsize').value;
  S.wordWrap      = $('s-wrap').checked;
  S.lineNumbers   = $('s-lines').checked;
  S.doubleCompile = $('s-double').checked;
  S.autosave      = +$('s-autosave').value;
  saveSettings();
  editor.setOption('lineWrapping', S.wordWrap);
  editor.setOption('lineNumbers',  S.lineNumbers);
  applyFontSize(S.fontSize);
  $('compiler-select').value = S.compiler;
  $('settings-overlay').classList.add('hidden');
});

// ── Help modal ─────────────────────────────────────────────────────────────────
$('help-btn').addEventListener('click',  () => $('help-overlay').classList.remove('hidden'));
$('help-close').addEventListener('click',() => $('help-overlay').classList.add('hidden'));
$('help-overlay').addEventListener('click', e => { if (e.target === $('help-overlay')) $('help-overlay').classList.add('hidden'); });

// ── Generic modal ──────────────────────────────────────────────────────────────
let modalCb = null;
function showModal(title, placeholder, cb) {
  $('modal-title').textContent = title;
  $('modal-input').placeholder = placeholder;
  $('modal-input').value = '';
  modalCb = cb;
  $('modal-overlay').classList.remove('hidden');
  setTimeout(() => $('modal-input').focus(), 40);
}
function closeModal() { $('modal-overlay').classList.add('hidden'); modalCb = null; }
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

// ── Status bar ─────────────────────────────────────────────────────────────────
function updateStatus() {
  if (!editor) return;
  const cur = editor.getCursor();
  $('cursor-pos').textContent = `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
  $('word-count').textContent = countWords(editor.getValue()) + ' words';
}

function countWords(text) {
  return text
    .replace(/%[^\n]*/g, '')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/[{}\[\]\\]/g, ' ')
    .trim().split(/\s+/).filter(w => /\w/.test(w)).length;
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function init() {
  // v2: clear stale mainFiles cache so server re-validates every session
  if (localStorage.getItem('mainFilesVer') !== '2') {
    localStorage.removeItem('mainFiles');
    localStorage.removeItem('manualMainFiles');
    localStorage.setItem('mainFilesVer', '2');
    mainFiles       = {};
    manualMainFiles = {};
  }
  manualMainFiles = {};  // always reset manual overrides on page load
  localStorage.setItem('manualMainFiles', JSON.stringify(manualMainFiles));

  initEditor();
  applyTheme(S.theme);
  $('compiler-select').value = S.compiler;
  await loadHomeView();

  // Re-enter last project if one was open
  const last = localStorage.getItem('currentProject');
  if (last) {
    const projects = await api('GET', '/api/projects');
    if (projects.includes(last)) {
      await enterProject(last);
    }
  }
}

init();

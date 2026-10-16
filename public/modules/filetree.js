import { state, getMainFile, setMainFile, $ } from './state.js';
import { api, enc, esc, flatTree, showContextMenu } from './api.js';
import { openTab } from './tabs.js';

export async function refreshTree() {
  if (!state.project) return;
  const tree = await api('GET', `/api/files?project=${enc(state.project)}`);
  const el = $('file-tree');
  el.innerHTML = '';
  if (!Array.isArray(tree) || !tree.length) {
    el.innerHTML = '<div style="padding:10px;color:#666;font-size:11px;">No files.</div>';
    return;
  }
  renderTree(tree, el);
}

export function renderTree(nodes, container) {
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
      del.className   = 'tree-del'; del.textContent = '✕'; del.title = 'Delete';
      del.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete ${node.name}?`)) return;
        await api('DELETE', `/api/file?project=${enc(state.project)}&file=${enc(node.path)}`);
        const { closeTab } = await import('./tabs.js');
        const ti = state.tabs.findIndex(t => t.path === node.path);
        if (ti >= 0) closeTab(ti);
        await refreshTree(); await loadBibKeys();
      });
      const isMain = node.path === getMainFile();
      item.innerHTML = `
        <span class="tree-icon">${fileIcon(node.name)}</span>
        <span class="tree-name" title="${esc(node.path)}">${esc(node.name)}</span>
        ${isMain ? '<span class="main-badge" title="Main file">M</span>' : ''}`;
      item.appendChild(del);
      if (state.tabs[state.activeIdx]?.path === node.path) item.classList.add('active');
      item.addEventListener('click', () => openTab(node.path));
      if (node.name.endsWith('.tex')) {
        item.addEventListener('contextmenu', e => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, [
            {
              label: isMain ? '✓ Main file (current)' : 'Set as main file',
              action: () => { setMainFile(node.path); refreshTree(); },
            },
            { label: 'Open', action: () => openTab(node.path) },
          ]);
        });
      }
      container.appendChild(item);
    }
  });
}

export function fileIcon(name) {
  if (name.endsWith('.tex'))                       return '📄';
  if (name.endsWith('.bib'))                       return '📚';
  if (name.endsWith('.pdf'))                       return '📕';
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(name)) return '🖼';
  if (/\.(cls|sty)$/.test(name))                  return '🔧';
  return '📃';
}

export async function loadBibKeys() {
  state.bibKeys = [];
  if (!state.project) return;
  const tree = await api('GET', `/api/files?project=${enc(state.project)}`);
  const bibs = flatTree(tree).filter(f => f.path.endsWith('.bib'));
  for (const b of bibs) {
    const text = await api('GET', `/api/file?project=${enc(state.project)}&file=${enc(b.path)}`);
    if (typeof text !== 'string') continue;
    for (const m of text.matchAll(/@\w+\{([^,\s]+)/g))
      if (!state.bibKeys.includes(m[1])) state.bibKeys.push(m[1]);
  }
}

export function initFileOps() {
  const { showModal } = /** @type {any} */ ({});

  $('new-file-btn').addEventListener('click', async () => {
    if (!state.project) return;
    const { showModal } = await import('./modals.js');
    showModal('New File', 'filename.tex', async name => {
      await api('POST', '/api/create', { project: state.project, name, type: 'file' });
      await refreshTree();
      openTab(name);
    });
  });

  $('new-folder-btn').addEventListener('click', async () => {
    if (!state.project) return;
    const { showModal } = await import('./modals.js');
    showModal('New Folder', 'folder-name', async name => {
      await api('POST', '/api/create', { project: state.project, name, type: 'directory' });
      await refreshTree();
    });
  });

  $('upload-btn').addEventListener('click', () => {
    if (!state.project) return;
    $('upload-input').value = ''; $('upload-input').click();
  });
  $('upload-input').addEventListener('change', () => doUpload($('upload-input').files));

  // Drag-drop
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
        const { doImportZip } = await import('./home.js');
        await doImportZip(files[0]); return;
      }
    }
    await doUpload(files);
  });
}

export async function doUpload(files) {
  if (!files?.length || !state.project) return;
  const form = new FormData();
  form.append('project', state.project);
  for (const f of files) form.append('files', f);
  const r = await fetch('/api/upload', { method: 'POST', body: form });
  const d = await r.json();
  if (d.error) return alert('Upload failed: ' + d.error);
  const { showCompileStatus } = await import('./compile.js');
  showCompileStatus(`✓ Uploaded: ${d.uploaded.join(', ')}`, '');
  await refreshTree(); await loadBibKeys();
}

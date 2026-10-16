import { state, $ } from './state.js';
import { api, enc, esc } from './api.js';
import { buildOutline } from './outline.js';

export function activeTab() { return state.tabs[state.activeIdx] || null; }

export async function openTab(path) {
  const existing = state.tabs.findIndex(t => t.path === path);
  if (existing >= 0) { await switchTab(existing); return; }
  state.tabs.push({ path, content: undefined, modified: false, cursor: null, scroll: null });
  renderTabs();
  await switchTab(state.tabs.length - 1);
}

export async function switchTab(idx) {
  if (state.activeIdx >= 0 && state.tabs[state.activeIdx]) {
    state.tabs[state.activeIdx].content = state.editor.getValue();
    state.tabs[state.activeIdx].cursor  = state.editor.getCursor();
    state.tabs[state.activeIdx].scroll  = state.editor.getScrollInfo();
  }
  state.activeIdx = idx;
  const tab = state.tabs[idx];
  if (!tab) return;

  if (tab.content === undefined) {
    const text = await api('GET', `/api/file?project=${enc(state.project)}&file=${enc(tab.path)}`);
    tab.content      = typeof text === 'string' ? text : '';
    tab.savedContent = tab.content;
  }

  state.suppress = true;
  state.editor.setValue(tab.content);
  state.suppress = false;
  state.editor.clearHistory();
  if (tab.cursor) state.editor.setCursor(tab.cursor);
  if (tab.scroll) state.editor.scrollTo(tab.scroll.left, tab.scroll.top);
  state.editor.setOption('mode', tab.path.endsWith('.md') ? 'markdown' : 'stex');
  buildOutline(tab.content);
  renderTabs();
  updateStatus();
}

export function closeTab(idx) {
  const tab = state.tabs[idx];
  if (!tab) return;
  if (tab.modified && !confirm(`${tab.path} has unsaved changes. Close anyway?`)) return;
  state.tabs.splice(idx, 1);
  if (!state.tabs.length) {
    state.activeIdx = -1;
    state.suppress = true; state.editor.setValue(''); state.suppress = false;
    buildOutline('');
    renderTabs(); updateStatus(); return;
  }
  const newIdx = Math.min(idx, state.tabs.length - 1);
  state.activeIdx = newIdx - 1;
  switchTab(newIdx);
}

export function renderTabs() {
  const tabsEl = $('tabs');
  tabsEl.innerHTML = '';
  state.tabs.forEach((tab, i) => {
    const name = tab.path.split('/').pop();
    const div  = document.createElement('div');
    div.className = 'tab' + (i === state.activeIdx ? ' active' : '');
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

export function updateStatus() {
  if (!state.editor) return;
  const cur = state.editor.getCursor();
  $('cursor-pos').textContent = `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
  $('word-count').textContent = countWords(state.editor.getValue()) + ' words';
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

export async function saveActiveTab() {
  const tab = activeTab();
  if (!tab || !state.project) return;
  clearTimeout(state.autoTimer);
  tab.content = state.editor.getValue();
  await api('POST', '/api/file', { project: state.project, file: tab.path, content: tab.content });
  tab.modified     = false;
  tab.savedContent = tab.content;
  renderTabs();
  $('save-status').textContent = '✓ Saved';
  setTimeout(() => { $('save-status').textContent = ''; }, 1400);
  if (tab.path.endsWith('.bib')) {
    const { loadBibKeys } = await import('./filetree.js');
    await loadBibKeys();
  }
}

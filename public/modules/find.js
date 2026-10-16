import { state, $ } from './state.js';

export function openFindBar() {
  $('find-bar').classList.remove('hidden');
  $('find-input').focus();
  $('find-input').select();
}

export function closeFindBar() {
  $('find-bar').classList.add('hidden');
  if (state.editor) state.editor.focus();
}

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
  if (!q || !state.editor) { $('find-count').textContent = ''; return; }
  const cur = state.editor.getSearchCursor(q, { line: 0, ch: 0 }, !$('find-case').checked);
  while (cur.findNext()) searchMatches.push({ from: cur.from(), to: cur.to() });
  $('find-count').textContent = searchMatches.length ? `${searchMatches.length} matches` : 'No results';
}

function findDir(reverse) {
  const q = buildQuery(); if (!q || !state.editor) return;
  computeMatches(); if (!searchMatches.length) return;
  const cur = state.editor.getCursor();
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
  state.editor.setSelection(m.from, m.to);
  state.editor.scrollIntoView({ from: m.from, to: m.to }, 60);
}

function doReplaceOne() {
  const q = buildQuery(), r = $('replace-input').value;
  if (!q || !state.editor) return;
  const cur = state.editor.getSearchCursor(q, state.editor.getCursor('from'), !$('find-case').checked);
  if (cur.findNext()) { cur.replace(r); state.editor.setSelection(cur.from(), cur.to()); }
}

function doReplaceAll() {
  const q = buildQuery(), r = $('replace-input').value;
  if (!q || !state.editor) return;
  const cur = state.editor.getSearchCursor(q, { line: 0, ch: 0 }, !$('find-case').checked);
  let count = 0;
  state.editor.operation(() => { while (cur.findNext()) { cur.replace(r); count++; } });
  $('find-count').textContent = `Replaced ${count}`;
}

export function initFind() {
  $('find-close') .addEventListener('click', closeFindBar);
  $('find-next')  .addEventListener('click', () => findDir(false));
  $('find-prev')  .addEventListener('click', () => findDir(true));
  $('replace-one').addEventListener('click', doReplaceOne);
  $('replace-all').addEventListener('click', doReplaceAll);
  $('find-input') .addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.shiftKey ? findDir(true) : findDir(false); }
    if (e.key === 'Escape') closeFindBar();
  });
  $('find-input').addEventListener('input', computeMatches);
}

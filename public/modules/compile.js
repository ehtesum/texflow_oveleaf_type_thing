import { state, getMainFile, $ } from './state.js';
import { api, enc } from './api.js';
import { S } from './settings.js';
import { saveActiveTab } from './tabs.js';
import { loadPdfDoc, scrollPdfToPage } from './pdfviewer.js';

export async function compile() {
  if (!state.project) return;
  await saveActiveTab();

  $('compile-btn').disabled = true;
  $('compile-spinner').classList.remove('hidden');
  showCompileStatus('Compiling…', '');
  $('compile-log').innerHTML = '';

  const r = await api('POST', '/api/compile', {
    project:       state.project,
    mainFile:      getMainFile(),
    compiler:      $('compiler-select').value,
    doubleCompile: S.doubleCompile,
  });

  $('compile-btn').disabled = false;
  $('compile-spinner').classList.add('hidden');

  // Server may have auto-detected a different main file — sync it back
  if (r.mainFile && r.mainFile !== getMainFile()) {
    state.mainFiles[state.project] = r.mainFile;
    localStorage.setItem('mainFiles', JSON.stringify(state.mainFiles));
    const { refreshTree } = await import('./filetree.js');
    refreshTree();
  }

  if (r.success) {
    showCompileStatus('✓ Compiled', 'ok');
    $('log-badge').textContent = '✓ OK'; $('log-badge').className = 'log-badge ok';
    $('err-badge').classList.add('hidden');
    const curPage = parseInt($('pdf-page-input').value) || 1;
    await loadPdfDoc(`/api/pdf?project=${enc(state.project)}&mainFile=${enc(getMainFile())}&t=${Date.now()}`);
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

export function showCompileStatus(msg, cls) {
  const el = $('compile-status');
  el.textContent = msg;
  el.className   = 'compile-status' + (cls ? ' ' + cls : '');
}

function renderLog(raw) {
  const el = $('compile-log');
  el.innerHTML = '';
  raw.split('\n').forEach(line => {
    const span = document.createElement('span');
    if (/^!/.test(line) || /error/i.test(line))  span.className = 'log-error';
    else if (/warning/i.test(line))               span.className = 'log-warning';
    else if (/^This is|^Output/i.test(line))      span.className = 'log-info';
    span.textContent = line + '\n';
    el.appendChild(span);
  });
  el.scrollTop = el.scrollHeight;
}

export function openLog() {
  $('log-panel').classList.add('expanded');
  $('compile-log').classList.remove('hidden');
  $('log-arrow').textContent = '▼';
}

export function initCompile() {
  $('compile-btn').addEventListener('click', compile);
  $('err-badge')  .addEventListener('click', openLog);

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
}

import { state, getMainFile, $ } from './state.js';
import { api, enc } from './api.js';
import { activeTab, openTab } from './tabs.js';
import { scrollPdfToPage, setPageClickHandler } from './pdfviewer.js';

export async function doForwardSync() {
  const tab = activeTab();
  if (!tab || !tab.path.endsWith('.tex') || !state.project) return;
  const line = state.editor.getCursor().line + 1;
  const r = await api('POST', '/api/synctex', {
    project: state.project, file: tab.path, line, mainFile: getMainFile(),
  });
  if (r.error) { console.warn('Forward sync:', r.error); return; }
  if (r.page) scrollPdfToPage(r.page);
}

export async function doInverseSync(pageNum, x_pt, y_pt) {
  if (!state.project) return;
  const r = await api('POST', '/api/synctex/edit', {
    project: state.project, mainFile: getMainFile(), page: pageNum, x: x_pt, y: y_pt,
  });
  if (r.error || !r.file || !r.line) {
    if (r.error && r.error !== 'No synctex match') console.warn('Inverse sync:', r.error);
    return;
  }
  await openTab(r.file);
  const lineNum = r.line - 1;
  state.editor.setCursor({ line: lineNum, ch: r.column || 0 });
  state.editor.scrollIntoView({ line: lineNum, ch: 0 }, 100);
  state.editor.focus();
  const from = { line: lineNum, ch: 0 };
  const to   = { line: lineNum, ch: state.editor.getLine(lineNum)?.length || 0 };
  const mark = state.editor.markText(from, to, { className: 'sync-flash' });
  setTimeout(() => mark.clear(), 1000);
}

export function initSynctex() {
  setPageClickHandler(doInverseSync);
}

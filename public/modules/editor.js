import { state, $ } from './state.js';
import { S } from './settings.js';
import { buildOutline } from './outline.js';
import { openFindBar, closeFindBar } from './find.js';
import { activeTab, renderTabs, saveActiveTab, updateStatus } from './tabs.js';
import { doForwardSync } from './synctex.js';
import { compile } from './compile.js';

export function initEditor() {
  state.editor = CodeMirror($('editor-container'), {
    value:            '',
    mode:             'stex',
    theme:            S.theme === 'light' ? 'default' : 'dracula',
    lineNumbers:      S.lineNumbers,
    lineWrapping:     S.wordWrap,
    matchBrackets:    true,
    autoCloseBrackets: true,
    indentUnit:       2,
    tabSize:          2,
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

  state.editor.on('change', () => {
    if (state.suppress) return;
    const tab = activeTab();
    if (!tab) return;
    tab.content  = state.editor.getValue();
    tab.modified = true;
    renderTabs();
    buildOutline(tab.content);
    clearTimeout(state.autoTimer);
    state.autoTimer = setTimeout(saveActiveTab, S.autosave);
    updateStatus();
  });

  state.editor.on('cursorActivity', updateStatus);

  state.editor.on('inputRead', (_cm, change) => {
    if (!change.text[0] || change.text[0].length !== 1) return;
    const cur    = state.editor.getCursor();
    const before = state.editor.getLine(cur.line).substring(0, cur.ch);
    const m = before.match(/\\cite\{([^}]*)$/);
    if (m && state.bibKeys.length) {
      const prefix   = m[1];
      const filtered = state.bibKeys.filter(k => k.toLowerCase().startsWith(prefix.toLowerCase()));
      if (!filtered.length) return;
      CodeMirror.showHint(state.editor, () => ({
        list: filtered,
        from: CodeMirror.Pos(cur.line, cur.ch - prefix.length),
        to:   cur,
      }), { completeSingle: false });
    }
  });

  applyFontSize(S.fontSize);

  state.editor.getWrapperElement().addEventListener('click', e => {
    if (e.altKey) { e.preventDefault(); doForwardSync(); }
  });
}

export function applyFontSize(px) {
  $('editor-container').style.fontSize = px + 'px';
  if (state.editor) state.editor.refresh();
}

export function wrapSelection(before, after) {
  if (!state.editor) return;
  const sel = state.editor.getSelection();
  if (sel) {
    state.editor.replaceSelection(before + sel + after);
  } else {
    const cur = state.editor.getCursor();
    state.editor.replaceRange(before + after, cur);
    state.editor.setCursor({ line: cur.line, ch: cur.ch + before.length });
  }
  state.editor.focus();
}

export function initToolbar() {
  $('tb-undo')  .addEventListener('click', () => state.editor.undo());
  $('tb-redo')  .addEventListener('click', () => state.editor.redo());
  $('tb-bold')  .addEventListener('click', () => wrapSelection('\\textbf{', '}'));
  $('tb-italic').addEventListener('click', () => wrapSelection('\\textit{', '}'));
  $('tb-uline') .addEventListener('click', () => wrapSelection('\\underline{', '}'));
  $('tb-math-i').addEventListener('click', () => wrapSelection('$', '$'));
  $('tb-math-d').addEventListener('click', () => wrapSelection('\\[\n', '\n\\]'));
  $('tb-find')  .addEventListener('click', openFindBar);
}

export function initSidebarToggles() {
  $('sb-ft-head').addEventListener('click', () => {
    const tree  = $('file-tree');
    const caret = $('ft-caret');
    const collapsed = tree.style.display === 'none';
    tree.style.display = collapsed ? '' : 'none';
    caret.classList.toggle('collapsed', !collapsed);
  });
  $('sb-ol-head').addEventListener('click', () => {
    const outline = $('file-outline');
    const caret   = $('ol-caret');
    const collapsed = outline.style.display === 'none';
    outline.style.display = collapsed ? '' : 'none';
    caret.classList.toggle('collapsed', !collapsed);
  });
}

export function initFullscreen() {
  $('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });
}

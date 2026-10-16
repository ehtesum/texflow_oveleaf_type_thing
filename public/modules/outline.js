import { state, $ } from './state.js';

const CMDS = [
  { re: /^\\chapter\*?\s*\{([^}]+)\}/,      lv: 'lv0' },
  { re: /^\\section\*?\s*\{([^}]+)\}/,       lv: 'lv1' },
  { re: /^\\subsection\*?\s*\{([^}]+)\}/,    lv: 'lv2' },
  { re: /^\\subsubsection\*?\s*\{([^}]+)\}/, lv: 'lv3' },
];

export function buildOutline(text) {
  const el = $('file-outline');
  if (!el) return;

  const items = [];
  text.split('\n').forEach((line, lineNum) => {
    const stripped = line.trimStart();
    for (const { re, lv } of CMDS) {
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
      if (!state.editor) return;
      state.editor.setCursor({ line: item.line, ch: 0 });
      state.editor.scrollIntoView({ line: item.line, ch: 0 }, 100);
      state.editor.focus();
    });
    el.appendChild(div);
  });
}

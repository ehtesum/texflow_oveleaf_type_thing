export const enc = encodeURIComponent;

export async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r  = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function flatTree(nodes) {
  const r = [];
  (nodes || []).forEach(n => {
    if (n.type === 'file') r.push(n);
    else r.push(...flatTree(n.children));
  });
  return r;
}

// ── Context menu ──────────────────────────────────────────────────────────────
let ctxMenu = null;

export function showContextMenu(x, y, items) {
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

export function hideContextMenu() {
  if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
}

const DEFAULTS = {
  theme: 'dark', fontSize: 14, compiler: 'pdflatex',
  wordWrap: true, lineNumbers: true, doubleCompile: false, autosave: 1200,
};

export let S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
export function saveSettings() { localStorage.setItem('settings', JSON.stringify(S)); }

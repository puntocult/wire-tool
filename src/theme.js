// Farbsätze der Zeichenfläche. Beide Sätze müssen in sich eindeutige Werte haben,
// weil der Export die Farben 1:1 von einem Satz in den anderen umrechnet.
export const PALETTES = {
  dark: {
    card: '#16171b', cardStroke: '#2c2e35', sep: '#212329', text: '#e8eaee', signal: '#c8cbd2',
    dim: '#7c818b', casing: '#0b0c0f', warn: '#f5a524', dots: '#262830', exportBg: '#0d0e11',
  },
  light: {
    card: '#ffffff', cardStroke: '#b9bdc4', sep: '#e3e5e9', text: '#1a1c21', signal: '#2b2d33',
    dim: '#5d626c', casing: '#3a3d44', warn: '#c27a00', dots: '#cfd3d9', exportBg: '#fdfdfd',
  },
};

// Diese Farben kommen im gezeichneten Plan vor und werden beim Export umgerechnet
const MAPPED = ['card', 'cardStroke', 'sep', 'text', 'signal', 'dim', 'casing', 'warn'];

export function convertColors(svg, from, to) {
  if (from === to) return svg;
  const map = {};
  for (const k of MAPPED) map[PALETTES[from][k]] = PALETTES[to][k];
  return svg.replace(new RegExp(Object.keys(map).join('|'), 'gi'), (c) => map[c.toLowerCase()]);
}

const prefersLight = () => {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches; } catch { return false; }
};

export function initialTheme() {
  try {
    const t = localStorage.getItem('wiretool.theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {}
  return prefersLight() ? 'light' : 'dark';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#131418');
}

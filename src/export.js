import { canvasApi, useStore } from './store';
import { PALETTES, convertColors } from './theme';

const safe = (name) => (name || 'kabelbaum').replace(/[\\/:*?"<>|]+/g, '_').trim();

export function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Semikolon + BOM, damit deutsches Excel die Datei direkt richtig öffnet
export function downloadCSV(name, rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const text = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  download(safe(name) + '.csv', new Blob([text], { type: 'text/csv;charset=utf-8' }));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Exportiert den Plan hell oder dunkel – unabhängig davon, welcher Modus gerade eingestellt ist
// (Drahtfarben bleiben unverändert)
export function buildSVG(title, light = false) {
  const target = light ? 'light' : 'dark';
  const P = PALETTES[target];
  const g = canvasApi.content();
  const b = g.getBBox();
  const pad = 40;
  const clone = g.cloneNode(true);
  clone.querySelectorAll('.port, .hit, .sel').forEach((n) => n.remove());
  const x = Math.floor(b.x - pad), y = Math.floor(b.y - pad - 30);
  const w = Math.ceil(b.width + 2 * pad), h = Math.ceil(b.height + 2 * pad + 30);
  const date = new Date().toLocaleDateString('de-DE');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${P.exportBg}"/>` +
    `<text x="${x + pad}" y="${y + pad}" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="14" font-weight="600" fill="${P.text}">${esc(title)}` +
    `<tspan dx="12" font-size="11" font-weight="400" fill="${P.dim}">${date}</tspan></text>` +
    convertColors(new XMLSerializer().serializeToString(clone), useStore.getState().theme, target) +
    `</svg>`
  );
}

export function exportSVG(title, light) {
  download(safe(title) + '.svg', new Blob([buildSVG(title, light)], { type: 'image/svg+xml' }));
}

export async function exportPNG(title, light) {
  const svg = buildSVG(title, light);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  canvas.toBlob((blob) => download(safe(title) + '.png', blob), 'image/png');
}

// PDF über den Druckdialog des Browsers („Als PDF speichern“)
export function exportPDF(title, light) {
  const svg = buildSVG(title, light);
  const win = window.open('', '_blank');
  if (!win) { alert('Bitte Pop-ups für diese Seite erlauben.'); return; }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>` +
    `@page{size:A4 landscape;margin:8mm}html,body{margin:0;background:${light ? '#ffffff' : '#0d0e11'};-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `svg{display:block;max-width:100%;max-height:190mm;width:auto;height:auto;margin:auto}</style></head><body>${svg}</body></html>`
  );
  win.document.close();
  setTimeout(() => win.print(), 300);
}

export function saveProject(doc) {
  download(safe(doc.name) + '.json', new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
}

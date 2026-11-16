// Erzeugt die App-Icons (PNG) ohne externe Abhängigkeiten: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [13, 14, 17];
const COLS = [[229, 72, 77], [247, 107, 21], [245, 217, 10], [62, 142, 247]];

function render(size, padFrac) {
  const px = new Uint8Array(size * size * 4);
  const pad = size * padFrac; // Sicherheitszone für maskable Icons
  const s = (size - 2 * pad) / 22; // Logo ist auf 22×22 entworfen
  const segs = COLS.map((c, i) => ({ c, x1: pad + (2 + i * 4) * s, y1: pad + 19 * s, x2: pad + (8 + i * 4) * s, y2: pad + 3 * s }));
  const r = 1.25 * s; // halbe Strichbreite
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let col = BG;
      let a = 0;
      for (const g of segs) {
        const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
        const t = Math.max(0, Math.min(1, ((x + 0.5 - g.x1) * dx + (y + 0.5 - g.y1) * dy) / (dx * dx + dy * dy)));
        const d = Math.hypot(x + 0.5 - (g.x1 + t * dx), y + 0.5 - (g.y1 + t * dy));
        const cov = Math.max(0, Math.min(1, r - d + 0.5));
        if (cov > a) { a = cov; col = g.c; }
      }
      const o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(BG[k] * (1 - a) + col[k] * a);
      px[o + 3] = 255;
    }
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bit, RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', render(192, 0.12));
writeFileSync('public/icon-512.png', render(512, 0.12));
writeFileSync('public/icon-maskable-512.png', render(512, 0.22));
writeFileSync('public/apple-touch-icon.png', render(180, 0.12));
console.log('Icons geschrieben.');

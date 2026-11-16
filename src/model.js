// Datenmodell, Geometrie und Berechnungen (ohne React)

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9);

// Aderfarben nach DIN IEC 60757 (Kürzel deutsch)
export const COLORS = {
  SW: { name: 'schwarz', hex: '#4a4c54' },
  BR: { name: 'braun', hex: '#9a6233' },
  RT: { name: 'rot', hex: '#e5484d' },
  OR: { name: 'orange', hex: '#f76b15' },
  GE: { name: 'gelb', hex: '#f5d90a' },
  GN: { name: 'grün', hex: '#30a46c' },
  BL: { name: 'blau', hex: '#3e8ef7' },
  VI: { name: 'violett', hex: '#8e4ec6' },
  GR: { name: 'grau', hex: '#9ba1a6' },
  WS: { name: 'weiß', hex: '#eeeeee' },
  RS: { name: 'rosa', hex: '#f692c0' },
  TK: { name: 'türkis', hex: '#12a594' },
};
export const CROSS_SECTIONS = [0.14, 0.25, 0.35, 0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16];
export const colorLabel = (w) => w.color + (w.stripe ? '/' + w.stripe : '');
export const fmtNum = (n) => String(n).replace('.', ',');
export const fmtCs = (cs) => fmtNum(cs) + ' mm²';

// Geometrie der Steckerkarte
export const CW = 200; // Breite
export const HH = 30; // Kopfhöhe
export const RH = 20; // Zeilenhöhe je Pin
export const connHeight = (c) => HH + c.pins.length * RH + 4;

export function pinNumbers(type, count) {
  const names = (type?.pinNames || '').split(',').map((s) => s.trim()).filter(Boolean);
  const n = count ?? type?.pinCount ?? 2;
  return Array.from({ length: n }, (_, i) => names[i] || String(i + 1));
}
// Durchgangs-Bauteile: jede Zeile hat Eingang (links, pin.id) und Ausgang (rechts, pin.outId).
// Elemente ohne `part` sind normale Stecker (beide Seiten = derselbe Pin).
export const PARTS = {
  fuse: { label: 'Sicherung', prefix: 'F', unit: 'A', placeholder: 'Nennstrom' },
  diode: { label: 'Diode', prefix: 'V', placeholder: 'z. B. 1N4007' },
  resistor: { label: 'Widerstand', prefix: 'R', placeholder: 'z. B. 1 kΩ' },
  switch: { label: 'Schalter', prefix: 'SW', placeholder: 'z. B. EIN/AUS' },
};
export const prefixOf = (part) => PARTS[part]?.prefix ?? 'X';

export const newPin = (num, part) => ({ id: uid('p'), num, signal: '', ...(part ? { outId: uid('p'), value: '' } : {}) });
export const makePins = (nums, part) => nums.map((num) => newPin(num, part));

// Standard-Richtwerte max. Absicherung je Querschnitt (FLRY, kurze Leitungen).
// Pro Projekt im Projekt-Panel anpassbar (doc.settings.fuseMax); fehlender Wert = keine Prüfung.
export const FUSE_MAX = { 0.14: 2, 0.25: 3, 0.35: 5, 0.5: 7.5, 0.75: 10, 1: 15, 1.5: 20, 2.5: 30, 4: 40, 6: 50, 10: 70, 16: 100 };
export const fuseMaxOf = (doc) => doc.settings.fuseMax ?? FUSE_MAX;
export const parseRating = (v) => parseFloat(String(v ?? '').replace(',', '.'));

const sameEp = (x, y) => (x.s ? x.s === y.s : !y.s && x.c === y.c && x.p === y.p);

// Prüft alle Drähte hinter einem Sicherungsausgang (auch über Spleiße hinweg)
export function fuseWarnings(doc) {
  const wires = new Map(); // wireId -> { fuse, rating, max }
  const slots = new Set(); // pinIds von Sicherungsplätzen mit Warnung
  const table = fuseMaxOf(doc);
  for (const c of doc.connectors) {
    if (c.part !== 'fuse') continue;
    for (const p of c.pins) {
      const rating = parseRating(p.value);
      if (!(rating > 0)) continue;
      const queue = [{ c: c.id, p: p.outId }];
      const seenW = new Set(), seenS = new Set();
      while (queue.length) {
        const node = queue.shift();
        for (const w of doc.wires) {
          const atA = sameEp(w.a, node), atB = sameEp(w.b, node);
          if ((!atA && !atB) || seenW.has(w.id)) continue;
          seenW.add(w.id);
          const max = table[w.cs];
          if (max != null && max < rating) {
            wires.set(w.id, { fuse: `${c.name}:${p.num}`, rating, max });
            slots.add(p.id);
          }
          const other = atA ? w.b : w.a;
          if (other.s && !seenS.has(other.s)) { seenS.add(other.s); queue.push(other); }
        }
      }
    }
  }
  return { wires, slots };
}

export function nextName(items, prefix) {
  const re = new RegExp('^' + prefix + '(\\d+)$');
  let max = 0;
  for (const it of items) {
    const m = re.exec(it.name);
    if (m) max = Math.max(max, +m[1]);
  }
  return prefix + (max + 1);
}

// Endpunkt eines Drahts: { c: connectorId, p: pinId } oder { s: spliceId }
export function epCenter(doc, ep) {
  if (ep.s) {
    const s = doc.splices.find((x) => x.id === ep.s);
    return s ? { x: s.x, y: s.y } : null;
  }
  const c = doc.connectors.find((x) => x.id === ep.c);
  if (!c) return null;
  let i = c.pins.findIndex((p) => p.id === ep.p);
  let out = false;
  if (i < 0 && c.part) { i = c.pins.findIndex((p) => p.outId === ep.p); out = true; }
  if (i < 0) return null;
  const y = c.y + HH + i * RH + RH / 2;
  // Durchgangs-Bauteil: feste Seite (Eingang links, Ausgang rechts)
  if (c.part) return { x: out ? c.x + CW : c.x, y, dir: out ? 1 : -1 };
  return { x: c.x + CW / 2, y };
}

// Anschlusspunkt: Pin-Seite (links/rechts) richtet sich nach dem anderen Drahtende
function epPort(doc, ep, towardX) {
  const ctr = epCenter(doc, ep);
  if (ctr.dir) return ctr;
  const dir = towardX >= ctr.x ? 1 : -1;
  if (ep.s) return { x: ctr.x, y: ctr.y, dir };
  return { x: ctr.x + (dir * CW) / 2, y: ctr.y, dir };
}

export function wireGeom(doc, w, idx = 0) {
  const ca = epCenter(doc, w.a);
  const cb = epCenter(doc, w.b);
  if (!ca || !cb) return null;
  const A = epPort(doc, w.a, cb.x);
  const B = epPort(doc, w.b, ca.x);
  const stub = 18;
  const a2 = { x: A.x + A.dir * (w.a.s ? 0 : stub), y: A.y };
  const b2 = { x: B.x + B.dir * (w.b.s ? 0 : stub), y: B.y };
  const m = w.mx ?? Math.round((a2.x + b2.x) / 2 + ((idx % 5) - 2) * 6);
  const pts = [A, a2, { x: m, y: A.y }, { x: m, y: B.y }, b2, B];
  return { d: roundedPath(pts), A, B };
}

const eq = (a, b) => Math.abs(a - b) < 0.01;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const toward = (from, to, r) => {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) * r) / d, y: from.y + ((to.y - from.y) * r) / d };
};

function roundedPath(raw, r = 10) {
  const p = [];
  for (const q of raw) {
    const l = p[p.length - 1];
    if (l && eq(l.x, q.x) && eq(l.y, q.y)) continue;
    p.push(q);
  }
  for (let i = p.length - 2; i > 0; i--) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    if ((eq(a.x, b.x) && eq(b.x, c.x)) || (eq(a.y, b.y) && eq(b.y, c.y))) p.splice(i, 1);
  }
  if (p.length < 2) return '';
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const rr = Math.min(r, dist(a, b) / 2, dist(b, c) / 2);
    const q1 = toward(b, a, rr), q2 = toward(b, c, rr);
    d += ` L${q1.x},${q1.y} Q${b.x},${b.y} ${q2.x},${q2.y}`;
  }
  const l = p[p.length - 1];
  return d + ` L${l.x},${l.y}`;
}

// Länge aus Bündeln: Summe der Abschnitte + Zugabe an beiden Enden
export function autoLength(doc, w) {
  const bs = doc.bundles.filter((b) => b.wireIds.includes(w.id));
  if (!bs.length) return null;
  return bs.reduce((s, b) => s + (+b.length || 0), 0) + 2 * (+doc.settings.allowance || 0);
}
export const wireLength = (doc, w) => (w.length != null ? w.length : autoLength(doc, w));

export function epInfo(doc, ep) {
  if (ep.s) {
    const s = doc.splices.find((x) => x.id === ep.s);
    return { name: s?.name ?? '?', pin: '', signal: '' };
  }
  const c = doc.connectors.find((x) => x.id === ep.c);
  const p = c?.pins.find((x) => x.id === ep.p);
  if (!p && c?.part) {
    const q = c.pins.find((x) => x.outId === ep.p);
    return { name: c.name, pin: (q?.num ?? '?') + ' aus', signal: q?.signal ?? '' };
  }
  return { name: c?.name ?? '?', pin: (p?.num ?? '?') + (c?.part ? ' ein' : ''), signal: p?.signal ?? '' };
}

export function elementLabel(c) {
  if (c.typeName) return c.typeName;
  if (c.part) return PARTS[c.part].label + (c.pins.length > 1 ? ` ${c.pins.length}-fach` : '');
  return `frei (${c.pins.length}-pol.)`;
}

export const valueLabel = (part, v) => (v && PARTS[part]?.unit && /^[\d.,]+$/.test(v.trim()) ? v.trim() + ' ' + PARTS[part].unit : v || '');

const byName = (a, b) => a.name.localeCompare(b.name, 'de', { numeric: true });

export function cutList(doc) {
  const header = ['Draht', 'Von', 'Pin', 'Signal', 'Nach', 'Pin', 'Signal', 'Farbe', 'Querschnitt (mm²)', 'Länge (mm)', 'Bündel'];
  const wires = [...doc.wires].sort(byName);
  const rows = wires.map((w) => {
    const a = epInfo(doc, w.a), b = epInfo(doc, w.b);
    const len = wireLength(doc, w);
    const bundles = doc.bundles.filter((x) => x.wireIds.includes(w.id)).map((x) => x.name).join(', ');
    return [w.name, a.name, a.pin, a.signal, b.name, b.pin, b.signal, colorLabel(w), fmtNum(w.cs), len == null ? '' : Math.round(len), bundles];
  });
  return { header, rows, wires };
}

// Stückliste in Abschnitten
export function bom(doc) {
  const group = (items, keyFn) => {
    const m = new Map();
    for (const it of items) {
      const k = keyFn(it);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return [...m.values()];
  };

  const conns = group(doc.connectors, (c) => [elementLabel(c), c.manufacturer, c.partNumber, c.pins.length].join('|')).map((g, i) => [
    i + 1,
    elementLabel(g[0]),
    g[0].manufacturer,
    g[0].partNumber,
    g.length,
    g.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'de', { numeric: true })).join(', '),
  ]);

  // Einsätze: Sicherungen, Dioden, Widerstände mit Wert (Schalter sind selbst das Bauteil)
  const slots = [];
  for (const c of doc.connectors) {
    if (!c.part || c.part === 'switch') continue;
    for (const p of c.pins) slots.push({ c, p });
  }
  const inserts = group(slots, ({ c, p }) => [c.part, valueLabel(c.part, p.value), elementLabel(c)].join('|')).map((g, i) => [
    i + 1,
    PARTS[g[0].c.part].label,
    valueLabel(g[0].c.part, g[0].p.value) || '– fehlt –',
    elementLabel(g[0].c),
    g.length,
    g.map(({ c, p }) => `${c.name}:${p.num}`).sort((a, b) => a.localeCompare(b, 'de', { numeric: true })).join(', '),
  ]);

  let missing = 0;
  const wires = group(doc.wires, (w) => colorLabel(w) + '|' + w.cs).map((g, i) => {
    let sum = 0;
    for (const w of g) {
      const l = wireLength(doc, w);
      if (l == null) missing++;
      else sum += l;
    }
    return [i + 1, colorLabel(g[0]), fmtNum(g[0].cs), g.length, fmtNum((sum / 1000).toFixed(2))];
  });

  const sleeves = group(doc.bundles.filter((b) => b.sleeve), (b) => b.sleeve).map((g, i) => [
    i + 1,
    g[0].sleeve,
    g.length,
    fmtNum((g.reduce((s, b) => s + (+b.length || 0), 0) / 1000).toFixed(2)),
  ]);

  return [
    { title: 'Stecker & Bauteile', header: ['Pos', 'Typ', 'Hersteller', 'Teilenummer', 'Menge', 'Bezeichner'], rows: conns },
    { title: 'Einsätze (Sicherungen, Dioden, Widerstände)', header: ['Pos', 'Bauteil', 'Wert', 'in', 'Menge', 'Plätze'], rows: inserts },
    { title: 'Leitungen', header: ['Pos', 'Farbe', 'Querschnitt (mm²)', 'Anzahl Drähte', 'Gesamtlänge (m)'], rows: wires, note: missing ? `${missing} Draht/Drähte ohne Länge – nicht in der Summe enthalten.` : '' },
    { title: 'Spleiße', header: ['Pos', 'Bezeichnung', 'Menge'], rows: doc.splices.length ? [[1, 'Spleißverbinder', doc.splices.length]] : [] },
    { title: 'Ummantelung', header: ['Pos', 'Ummantelung', 'Abschnitte', 'Gesamtlänge (m)'], rows: sleeves },
  ];
}

export const defaultLibrary = () => [
  { id: uid('t'), name: 'Deutsch DT 2-pol. Stecker', manufacturer: 'TE / Deutsch', partNumber: 'DT04-2P', pinCount: 2, pinNames: '' },
  { id: uid('t'), name: 'Deutsch DT 4-pol. Stecker', manufacturer: 'TE / Deutsch', partNumber: 'DT04-4P', pinCount: 4, pinNames: '' },
  { id: uid('t'), name: 'Deutsch DT 6-pol. Buchse', manufacturer: 'TE / Deutsch', partNumber: 'DT06-6S', pinCount: 6, pinNames: '' },
  { id: uid('t'), name: 'JST XH 3-pol. Gehäuse', manufacturer: 'JST', partNumber: 'XHP-3', pinCount: 3, pinNames: '' },
  { id: uid('t'), name: 'Ringkabelschuh M6', manufacturer: '', partNumber: '', pinCount: 1, pinNames: '' },
  ...libraryV2(),
];

// Vorlagen, die mit den Bauteilen dazugekommen sind (werden bestehenden Bibliotheken einmalig ergänzt)
export const libraryV2 = () => [
  { id: uid('t'), part: 'fuse', name: 'Fliegender Sicherungshalter Mini', manufacturer: '', partNumber: '', pinCount: 1, pinNames: '' },
  { id: uid('t'), part: 'fuse', name: 'Sicherungskasten 6-fach Mini', manufacturer: '', partNumber: '', pinCount: 6, pinNames: '' },
  { id: uid('t'), part: 'diode', name: 'Diode inline', manufacturer: '', partNumber: '', pinCount: 1, pinNames: '' },
  { id: uid('t'), part: 'resistor', name: 'Widerstand inline', manufacturer: '', partNumber: '', pinCount: 1, pinNames: '' },
  { id: uid('t'), part: 'switch', name: 'Kippschalter EIN/AUS', manufacturer: '', partNumber: '', pinCount: 1, pinNames: '' },
  { id: uid('t'), name: 'Relaissockel 5-pol. (Mini-Relais)', manufacturer: '', partNumber: '', pinCount: 5, pinNames: '30,85,86,87,87a' },
];

export const emptyDoc = () => ({
  name: 'Neuer Kabelbaum',
  connectors: [],
  splices: [],
  wires: [],
  bundles: [],
  settings: { allowance: 30 },
});

export function exampleDoc() {
  const mk = (name, typeName, partNumber, x, y, signals) => ({
    id: uid('c'), name, typeId: null, typeName, manufacturer: partNumber ? 'TE / Deutsch' : '', partNumber, x, y,
    pins: signals.map((s, i) => ({ id: uid('p'), num: String(i + 1), signal: s })),
  });
  const ecu = mk('X1', 'Steuergerät', '', 60, 80, ['12V', 'GND', 'INJ 1', 'INJ 2', 'CAN H', 'CAN L']);
  const inj1 = mk('X2', 'Deutsch DT 2-pol. Stecker', 'DT04-2P', 560, 40, ['INJ 1', '12V']);
  const inj2 = mk('X3', 'Deutsch DT 2-pol. Stecker', 'DT04-2P', 560, 160, ['INJ 2', '12V']);
  const gnd = mk('X4', 'Ringkabelschuh M6', '', 560, 290, ['GND']);
  const diag = mk('X5', 'Deutsch DT 4-pol. Stecker', 'DT04-4P', 560, 370, ['CAN H', 'CAN L', '', '']);
  const s1 = { id: uid('s'), name: 'S1', x: 400, y: 120 };
  const P = (c, i) => ({ c: c.id, p: c.pins[i].id });
  let n = 0;
  const W = (a, b, color, cs, stripe = '') => ({ id: uid('w'), name: 'W' + ++n, a, b, color, stripe, cs, length: null, mx: null });
  const wires = [
    W(P(ecu, 0), { s: s1.id }, 'RT', 1),
    W({ s: s1.id }, P(inj1, 1), 'RT', 0.75),
    W({ s: s1.id }, P(inj2, 1), 'RT', 0.75),
    W(P(ecu, 2), P(inj1, 0), 'GN', 0.75),
    W(P(ecu, 3), P(inj2, 0), 'BL', 0.75),
    W(P(ecu, 1), P(gnd, 0), 'SW', 1.5),
    W(P(ecu, 4), P(diag, 0), 'GE', 0.35),
    W(P(ecu, 5), P(diag, 1), 'GN', 0.35, 'WS'),
  ];
  const ids = (...k) => k.map((i) => wires[i].id);
  return {
    name: 'Beispiel Einspritzung',
    connectors: [ecu, inj1, inj2, gnd, diag],
    splices: [s1],
    wires,
    bundles: [
      { id: uid('b'), name: 'B1', length: 450, sleeve: 'Wellrohr NW10', wireIds: ids(0, 3, 4, 5, 6, 7) },
      { id: uid('b'), name: 'B2', length: 200, sleeve: 'Gewebeband', wireIds: ids(1, 2, 3, 4) },
    ],
    settings: { allowance: 30 },
  };
}

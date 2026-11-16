import { create } from 'zustand';
import { uid, exampleDoc, emptyDoc, defaultLibrary, libraryV2, makePins, newPin, pinNumbers, nextName, prefixOf } from './model';

const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback();
  } catch {
    return fallback();
  }
};

// Bestehende Bibliotheken einmalig um die Bauteil-Vorlagen ergänzen
function loadLibrary() {
  const lib = load('wiretool.library', defaultLibrary);
  if (localStorage.getItem('wiretool.libVersion') !== '2') {
    if (localStorage.getItem('wiretool.library')) lib.push(...libraryV2());
    localStorage.setItem('wiretool.libVersion', '2');
  }
  return lib;
}

export const useStore = create(() => ({
  doc: load('wiretool.doc', exampleDoc),
  library: loadLibrary(),
  selection: [], // [{ t: 'c' | 's' | 'w', id }]
  view: 'plan', // 'plan' | 'cut' | 'bom'
  highlight: null, // Bündel-ID
  panel: null, // Handy: null | 'lib' | 'props'
  multi: false, // Mehrfachauswahl per Tippen (Ersatz für Shift)
}));
const S = useStore;

// Automatisch im Browser zwischenspeichern
let saveTimer;
S.subscribe((s, prev) => {
  if (s.doc === prev.doc && s.library === prev.library) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem('wiretool.doc', JSON.stringify(s.doc));
    localStorage.setItem('wiretool.library', JSON.stringify(s.library));
  }, 300);
});

// Von der Zeichenfläche bereitgestellt (Mitte, Einpassen, SVG-Inhalt)
export const canvasApi = {};

export const mut = (fn) => S.setState((s) => { const d = structuredClone(s.doc); fn(d); return { doc: d }; });
export const mutLib = (fn) => S.setState((s) => { const l = structuredClone(s.library); fn(l); return { library: l }; });
export const setSel = (selection) => S.setState({ selection });
export const setView = (view) => S.setState({ view });
export const isSel = (sel, t, id) => sel.some((x) => x.t === t && x.id === id);

export const setPanel = (panel) => S.setState({ panel });
export const toggleMulti = () => S.setState((s) => ({ multi: !s.multi }));

export function clickSelect(t, id, shift) {
  const { selection: sel, multi } = S.getState();
  shift = shift || multi;
  if (shift) setSel(isSel(sel, t, id) ? sel.filter((x) => !(x.t === t && x.id === id)) : [...sel, { t, id }]);
  else if (!isSel(sel, t, id)) setSel([{ t, id }]);
}

// Zuletzt gewählte Drahteigenschaften für neue Drähte
export const lastStyle = { color: 'SW', stripe: '', cs: 0.5 };

const pruneBundles = (d) => {
  const ids = new Set(d.wires.map((w) => w.id));
  d.bundles.forEach((b) => (b.wireIds = b.wireIds.filter((id) => ids.has(id))));
};

export function addConnector(type, x, y) {
  const id = uid('c');
  const part = type?.part || undefined;
  mut((d) => d.connectors.push({
    id, name: nextName(d.connectors, prefixOf(part)), part, typeId: type?.id ?? null, typeName: type?.name ?? '',
    manufacturer: type?.manufacturer ?? '', partNumber: type?.partNumber ?? '',
    x, y, pins: makePins(pinNumbers(type, type?.pinCount ? undefined : 4), part),
  }));
  setSel([{ t: 'c', id }]);
}

export function addSplice(x, y) {
  const id = uid('s');
  mut((d) => d.splices.push({ id, name: nextName(d.splices, 'S'), x, y }));
  setSel([{ t: 's', id }]);
  return id;
}

export function addWire(a, b) {
  const id = uid('w');
  mut((d) => d.wires.push({ id, name: nextName(d.wires, 'W'), a, b, ...lastStyle, length: null, mx: null }));
  setSel([{ t: 'w', id }]);
}

export function deleteSelection() {
  const sel = S.getState().selection;
  if (!sel.length) return;
  const ids = new Set(sel.map((x) => x.id));
  const hit = (ep) => ids.has(ep.c) || ids.has(ep.s);
  mut((d) => {
    d.connectors = d.connectors.filter((c) => !ids.has(c.id));
    d.splices = d.splices.filter((s) => !ids.has(s.id));
    d.wires = d.wires.filter((w) => !ids.has(w.id) && !hit(w.a) && !hit(w.b));
    pruneBundles(d);
  });
  setSel([]);
}

// Kopieren: Stecker + Spleiße der Auswahl und die Drähte, die nur zwischen ihnen verlaufen
function snapshot() {
  const { doc, selection } = S.getState();
  const ids = new Set(selection.map((x) => x.id));
  const connectors = doc.connectors.filter((c) => ids.has(c.id));
  const splices = doc.splices.filter((s) => ids.has(s.id));
  if (!connectors.length && !splices.length) return null;
  const inside = (ep) => ids.has(ep.c) || ids.has(ep.s);
  const wires = doc.wires.filter((w) => inside(w.a) && inside(w.b));
  return structuredClone({ connectors, splices, wires });
}

function insertCopy(data, off) {
  const map = {};
  const sel = [];
  mut((d) => {
    for (const c of data.connectors) {
      const id = uid('c');
      map[c.id] = id;
      const pins = c.pins.map((p) => ({ ...p, id: (map[p.id] = uid('p')), ...(p.outId ? { outId: (map[p.outId] = uid('p')) } : {}) }));
      d.connectors.push({ ...c, id, name: nextName(d.connectors, 'X'), x: c.x + off, y: c.y + off, pins });
      sel.push({ t: 'c', id });
    }
    for (const s of data.splices) {
      const id = uid('s');
      map[s.id] = id;
      d.splices.push({ ...s, id, name: nextName(d.splices, 'S'), x: s.x + off, y: s.y + off });
      sel.push({ t: 's', id });
    }
    const ep = (e) => (e.s ? { s: map[e.s] } : { c: map[e.c], p: map[e.p] });
    for (const w of data.wires) {
      d.wires.push({ ...w, id: uid('w'), name: nextName(d.wires, 'W'), a: ep(w.a), b: ep(w.b), mx: w.mx == null ? null : w.mx + off });
    }
  });
  setSel(sel);
}

let clipboard = null;
let pasteCount = 0;
export function copySelection() {
  const data = snapshot();
  if (data) { clipboard = data; pasteCount = 0; }
}
export function pasteClipboard() {
  if (clipboard) insertCopy(clipboard, 40 * ++pasteCount);
}
export function duplicateSelection() {
  const data = snapshot();
  if (data) insertCopy(data, 40);
}

export function setPinCount(connId, n) {
  n = Math.max(1, Math.min(99, Math.round(n) || 1));
  mut((d) => {
    const c = d.connectors.find((x) => x.id === connId);
    if (n > c.pins.length) {
      for (let i = c.pins.length; i < n; i++) c.pins.push(newPin(String(i + 1), c.part));
    } else {
      const removed = new Set(c.pins.slice(n).flatMap((p) => [p.id, p.outId]));
      c.pins = c.pins.slice(0, n);
      const gone = (ep) => ep.c === c.id && removed.has(ep.p);
      d.wires = d.wires.filter((w) => !gone(w.a) && !gone(w.b));
      pruneBundles(d);
    }
  });
}

export function applyType(connId, type) {
  mut((d) => {
    const c = d.connectors.find((x) => x.id === connId);
    // Art bleibt erhalten (Stecker ↔ Durchgangs-Bauteil würde die Anschlüsse ändern); nur die Bauteilart wechselt
    if (c.part && type?.part) c.part = type.part;
    c.typeId = type?.id ?? null;
    c.typeName = type?.name ?? '';
    c.manufacturer = type?.manufacturer ?? '';
    c.partNumber = type?.partNumber ?? '';
  });
  if (type) {
    setPinCount(connId, type.pinCount);
    const nums = pinNumbers(type);
    mut((d) => d.connectors.find((x) => x.id === connId).pins.forEach((p, i) => (p.num = nums[i] ?? p.num)));
  }
}

export function createBundle(wireIds) {
  const id = uid('b');
  mut((d) => d.bundles.push({ id, name: nextName(d.bundles, 'B'), length: 0, sleeve: '', wireIds: [...wireIds] }));
  S.setState({ highlight: id });
}

export function setBundleWires(bundleId, wireIds, add) {
  mut((d) => {
    const b = d.bundles.find((x) => x.id === bundleId);
    const set = new Set(b.wireIds);
    wireIds.forEach((id) => (add ? set.add(id) : set.delete(id)));
    b.wireIds = [...set];
  });
}

export const toggleHighlight = (id) => S.setState((s) => ({ highlight: s.highlight === id ? null : id }));

export function newDoc() {
  S.setState({ doc: emptyDoc(), selection: [], highlight: null });
}

export function openDoc(json) {
  const d = JSON.parse(json);
  if (!Array.isArray(d.connectors) || !Array.isArray(d.wires)) throw new Error('Keine gültige Kabelbaum-Datei');
  S.setState({ doc: { ...emptyDoc(), ...d }, selection: [], highlight: null });
}

import { useEffect, useRef, useState } from 'react';
import { useStore, setView, deleteSelection, setSel, newDoc, openDoc, copySelection, pasteClipboard, duplicateSelection, setPanel } from './store';
import Canvas from './Canvas';
import Sidebar from './Sidebar';
import Inspector from './Inspector';
import { CutList, Bom } from './Tables';
import { exportSVG, exportPNG, exportPDF, saveProject } from './export';

export default function App() {
  const view = useStore((s) => s.view);
  const panel = useStore((s) => s.panel);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
      if (e.key === 'Escape') { setSel([]); useStore.setState({ highlight: null, panel: null }); }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'c') copySelection();
        if (k === 'v') pasteClipboard();
        if (k === 'd') { e.preventDefault(); duplicateSelection(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={'app' + (panel ? ' panel-' + panel : '')}>
      <TopBar view={view} />
      <div className="main">
        <Sidebar />
        <div className="stage">
          <Canvas />
          {view === 'cut' && <CutList />}
          {view === 'bom' && <Bom />}
          <PropsButton />
        </div>
        <Inspector />
        <div className="backdrop" onClick={() => setPanel(null)} />
      </div>
    </div>
  );
}

// Handy: öffnet das Eigenschaften-Panel von unten
function PropsButton() {
  const sel = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  let label = 'Projekt';
  if (sel.length > 1) label = sel.length + ' ausgewählt';
  else if (sel.length === 1) {
    const { t, id } = sel[0];
    const list = t === 'c' ? doc.connectors : t === 's' ? doc.splices : doc.wires;
    label = list.find((x) => x.id === id)?.name ?? 'Projekt';
  }
  return <button className="props-fab mobile-only" onClick={() => setPanel('props')}>⚙ {label}</button>;
}

function Logo() {
  const cols = ['#e5484d', '#f76b15', '#f5d90a', '#3e8ef7'];
  return (
    <div className="logo">
      <svg width="22" height="22" viewBox="0 0 22 22">
        {cols.map((c, i) => <path key={c} d={`M${3 + i * 4},19 L${9 + i * 4},3`} stroke={c} strokeWidth="2.2" strokeLinecap="round" />)}
      </svg>
      <span className="logo-text">wire<span className="accent">.</span>tool</span>
    </div>
  );
}

function TopBar({ view }) {
  const name = useStore((s) => s.doc.name);
  const panel = useStore((s) => s.panel);
  const fileRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const [light, setLight] = useState(true);

  const onFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { openDoc(await f.text()); } catch (err) { alert('Datei konnte nicht geöffnet werden: ' + err.message); }
  };
  const run = (fn) => { setMenu(false); fn(name, light); };
  const doNew = () => { setMenu(false); if (confirm('Aktuellen Kabelbaum verwerfen und neu beginnen?')) newDoc(); };
  const doOpen = () => { setMenu(false); fileRef.current.click(); };
  const doSave = () => { setMenu(false); saveProject(useStore.getState().doc); };

  return (
    <header className="topbar">
      <button className="icon mobile-only burger" title="Bibliothek & Bündel" onClick={() => setPanel(panel === 'lib' ? null : 'lib')}>☰</button>
      <Logo />
      <input className="doc-name" value={name} onChange={(e) => useStore.setState((s) => ({ doc: { ...s.doc, name: e.target.value } }))} />
      <nav className="tabs">
        {[['plan', 'Plan', 'Plan'], ['cut', 'Schnittliste', 'Schnitt'], ['bom', 'Stückliste', 'Stück']].map(([k, l, short]) => (
          <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>
            <span className="desk-only">{l}</span><span className="mobile-only">{short}</span>
          </button>
        ))}
      </nav>
      <div className="spacer" />
      <button className="ghost desk-only" onClick={doNew}>Neu</button>
      <button className="ghost desk-only" onClick={doOpen}>Öffnen</button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
      <button className="desk-only" onClick={doSave}>Speichern</button>
      <div className="menu-wrap">
        <button className="primary" onClick={() => setMenu(!menu)}>
          <span className="desk-only">Export ▾</span><span className="mobile-only">⋯</span>
        </button>
        {menu && (
          <div className="menu" onMouseLeave={() => setMenu(false)}>
            <div className="mobile-only">
              <button onClick={doNew}>Neu</button>
              <button onClick={doOpen}>Öffnen …</button>
              <button onClick={doSave}>Speichern (Datei)</button>
              <div className="menu-sep" />
            </div>
            <button onClick={() => run(exportSVG)}>Plan als SVG</button>
            <button onClick={() => run(exportPNG)}>Plan als PNG</button>
            <button onClick={() => run(exportPDF)}>Plan als PDF (Drucken)</button>
            <div className="menu-sep" />
            <label className="check menu-check">
              <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />
              Heller Hintergrund
            </label>
          </div>
        )}
      </div>
    </header>
  );
}

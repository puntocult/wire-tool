import { useState } from 'react';
import { useStore, mut, mutLib, addConnector, canvasApi, setView, setPanel, createBundle, setBundleWires, toggleHighlight } from './store';
import { uid, PARTS, voltageLabel } from './model';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <Library />
      <Bundles />
    </aside>
  );
}

function Library() {
  const library = useStore((s) => s.library);
  const [edit, setEdit] = useState(null);

  const place = (t) => {
    setView('plan');
    setPanel(null);
    const p = canvasApi.center();
    addConnector(t, p.x, p.y);
  };

  return (
    <section>
      <div className="sec-head">
        <h3>Bibliothek</h3>
        <button className="icon" title="Neuer Steckertyp" onClick={() => setEdit({ id: null, name: '', manufacturer: '', partNumber: '', pinCount: 2, pinNames: '' })}>+</button>
      </div>
      {edit && <TypeForm key={edit.id ?? 'new'} value={edit} onClose={() => setEdit(null)} />}
      <ul className="list">
        {library.map((t) => (
          <li key={t.id} className="item">
            <div className="item-main" title="Klicken, um im Plan zu platzieren" onClick={() => place(t)}>
              <div className="item-title">{t.name}</div>
              <div className="item-sub">
                {[
                  t.part ? PARTS[t.part]?.label : t.source ? 'Stromversorgung' : '',
                  t.partNumber,
                  t.part ? (t.pinCount > 1 ? t.pinCount + '-fach' : '') : t.source ? voltageLabel(t.voltage) : t.pinCount + '-pol.',
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button className="icon" title="Bearbeiten" onClick={() => setEdit(t)}>✎</button>
          </li>
        ))}
      </ul>
      {!library.length && <p className="hint">Noch keine Steckertypen. Mit + anlegen.</p>}
    </section>
  );
}

function TypeForm({ value, onClose }) {
  const [v, setV] = useState(value);
  const f = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const save = () => {
    const t = { ...v, name: v.name.trim() || 'Unbenannt', pinCount: Math.max(1, Math.min(99, Math.round(+v.pinCount) || 1)) };
    mutLib((l) => {
      const i = l.findIndex((x) => x.id === t.id);
      if (i >= 0) l[i] = t;
      else l.push({ ...t, id: uid('t') });
    });
    onClose();
  };
  const remove = () => {
    mutLib((l) => l.splice(l.findIndex((x) => x.id === v.id), 1));
    onClose();
  };
  return (
    <div className="card">
      <label className="field"><span>Name</span><input autoFocus value={v.name} onChange={f('name')} /></label>
      <label className="field">
        <span>Art</span>
        <select
          value={v.part || (v.source ? 'source' : '')}
          onChange={(e) => {
            const k = e.target.value;
            if (k === 'source') setV({ ...v, part: '', source: true, pinNames: v.pinNames || '+,−', voltage: v.voltage ?? '12' });
            else setV({ ...v, part: k, source: false });
          }}
        >
          <option value="">Stecker / Sockel (Pins)</option>
          <option value="source">Stromversorgung (+ / −)</option>
          {Object.entries(PARTS).map(([k, p]) => <option key={k} value={k}>{p.label} (Eingang → Ausgang)</option>)}
        </select>
      </label>
      {v.source && <label className="field"><span>Spannung (V)</span><input inputMode="decimal" value={v.voltage ?? ''} onChange={f('voltage')} /></label>}
      <div className="row2">
        <label className="field"><span>Hersteller</span><input value={v.manufacturer} onChange={f('manufacturer')} /></label>
        <label className="field"><span>Teilenummer</span><input value={v.partNumber} onChange={f('partNumber')} /></label>
      </div>
      <label className="field"><span>{v.part ? 'Anzahl Plätze' : 'Pinzahl'}</span><input type="number" min="1" max="99" value={v.pinCount} onChange={f('pinCount')} /></label>
      <label className="field"><span>{v.part ? 'Platz' : 'Pin'}-Bezeichnungen (optional, mit Komma)</span><input placeholder="z. B. A1, A2, B1, B2" value={v.pinNames} onChange={f('pinNames')} /></label>
      <div className="btn-row">
        <button className="primary" onClick={save}>Speichern</button>
        <button onClick={onClose}>Abbrechen</button>
        {v.id && <button className="ghost danger-text" onClick={remove}>Löschen</button>}
      </div>
    </div>
  );
}

function Bundles() {
  const bundles = useStore((s) => s.doc.bundles);
  const highlight = useStore((s) => s.highlight);
  const selection = useStore((s) => s.selection);
  const selWires = selection.filter((x) => x.t === 'w').map((x) => x.id);

  return (
    <section>
      <div className="sec-head">
        <h3>Bündel</h3>
        <button className="icon" title="Neues Bündel aus den ausgewählten Drähten" onClick={() => createBundle(selWires)}>+</button>
      </div>
      {!bundles.length && <p className="hint">Drähte auswählen (Shift+Klick) und mit + zu einem Bündel zusammenfassen.</p>}
      <ul className="list">
        {bundles.map((b) => (
          <li key={b.id}>
            <div className={'item' + (highlight === b.id ? ' active' : '')}>
              <div className="item-main" onClick={() => toggleHighlight(b.id)}>
                <div className="item-title">{b.name}</div>
                <div className="item-sub">{(b.length || 0) + ' mm · ' + b.wireIds.length + ' Drähte' + (b.sleeve ? ' · ' + b.sleeve : '')}</div>
              </div>
            </div>
            {highlight === b.id && <BundleEdit b={b} selWires={selWires} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BundleEdit({ b, selWires }) {
  const set = (k, v) => mut((d) => (d.bundles.find((x) => x.id === b.id)[k] = v));
  const remove = () => {
    mut((d) => (d.bundles = d.bundles.filter((x) => x.id !== b.id)));
    toggleHighlight(b.id);
  };
  return (
    <div className="card">
      <div className="row2">
        <label className="field"><span>Name</span><input value={b.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="field"><span>Länge (mm)</span><input type="number" min="0" value={b.length} onChange={(e) => set('length', +e.target.value || 0)} /></label>
      </div>
      <label className="field"><span>Ummantelung</span><input placeholder="z. B. Wellrohr NW10" value={b.sleeve} onChange={(e) => set('sleeve', e.target.value)} /></label>
      <div className="btn-row">
        <button disabled={!selWires.length} onClick={() => setBundleWires(b.id, selWires, true)}>Auswahl hinzu ({selWires.length})</button>
        <button disabled={!selWires.length} onClick={() => setBundleWires(b.id, selWires, false)}>entfernen</button>
      </div>
      <button className="ghost danger-text" onClick={remove}>Bündel löschen</button>
    </div>
  );
}

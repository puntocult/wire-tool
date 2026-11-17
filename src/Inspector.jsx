import { Fragment, useEffect, useState } from 'react';
import { useStore, mut, setSel, setPanel, deleteSelection, duplicateSelection, setPinCount, applyType, lastStyle, setBundleWires, createBundle } from './store';
import { COLORS, CROSS_SECTIONS, PARTS, kindOf, fmtCs, epInfo, autoLength, wireLength, fmtNum, fuseWarnings, fuseMaxOf, parseRating } from './model';

const fuseText = (f) => `${f.fuse} ist mit ${fmtNum(f.rating)} A abgesichert – Richtwert für diesen Querschnitt: max. ${fmtNum(f.max)} A.`;

const Field = ({ label, children }) => (
  <label className="field"><span>{label}</span>{children}</label>
);

// Zahlenfeld, das erst bei Enter/Verlassen übernimmt (verhindert z. B. Pin-Löschung beim Tippen)
function CommitNumber({ value, onCommit, ...rest }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { if (v !== '' && +v !== value) onCommit(+v); else setV(String(value)); };
  return <input type="number" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} {...rest} />;
}

export default function Inspector() {
  const doc = useStore((s) => s.doc);
  const library = useStore((s) => s.library);
  const selection = useStore((s) => s.selection);

  let body = <ProjectPanel doc={doc} />;
  if (selection.length > 1) body = <MultiPanel doc={doc} selection={selection} />;
  else if (selection.length === 1) {
    const { t, id } = selection[0];
    const c = t === 'c' && doc.connectors.find((x) => x.id === id);
    const s = t === 's' && doc.splices.find((x) => x.id === id);
    const w = t === 'w' && doc.wires.find((x) => x.id === id);
    if (c) body = <ConnPanel c={c} library={library} />;
    if (s) body = s.ground ? <GroundPanel s={s} doc={doc} /> : <SplicePanel s={s} doc={doc} />;
    if (w) body = <WirePanel w={w} doc={doc} />;
  }
  return (
    <aside className="inspector">
      <div className="sheet-handle mobile-only" onClick={() => setPanel(null)}><span /></div>
      <button className="icon sheet-close mobile-only" title="Schließen" onClick={() => setPanel(null)}>✕</button>
      {body}
    </aside>
  );
}

function ProjectPanel({ doc }) {
  const total = doc.wires.reduce((s, w) => s + (wireLength(doc, w) || 0), 0);
  const warns = [...fuseWarnings(doc).wires.entries()];
  return (
    <>
      <h2>Projekt</h2>
      <Field label="Name"><input value={doc.name} onChange={(e) => mut((d) => (d.name = e.target.value))} /></Field>
      <Field label="Zugabe je Drahtende (mm)">
        <input type="number" min="0" value={doc.settings.allowance} onChange={(e) => mut((d) => (d.settings.allowance = +e.target.value || 0))} />
      </Field>
      <p className="hint">Wird bei berechneten Drahtlängen an beiden Enden addiert (Abisolieren, Crimpen, Reserve).</p>
      <div className="stats">
        <div><b>{doc.connectors.length}</b><span>Stecker</span></div>
        <div><b>{doc.wires.length}</b><span>Drähte</span></div>
        <div><b>{doc.splices.filter((s) => !s.ground).length}</b><span>Spleiße</span></div>
        <div><b>{doc.splices.filter((s) => s.ground).length}</b><span>Massepunkte</span></div>
        <div><b>{fmtNum((total / 1000).toFixed(2))}</b><span>m Draht</span></div>
      </div>
      <h3>Prüfung Absicherung</h3>
      {warns.length ? (
        <ul className="plain">
          {warns.map(([id, f]) => (
            <li key={id} className="warn-item" onClick={() => setSel([{ t: 'w', id }])}>
              ⚠ <b>{doc.wires.find((w) => w.id === id)?.name}</b>: {fuseText(f)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Keine Auffälligkeiten.</p>
      )}
      <FuseTable doc={doc} />
    </>
  );
}

// Dezimalfeld mit Komma, übernimmt bei Enter/Verlassen; leer = kein Wert
function DecimalInput({ value, onCommit }) {
  const shown = value == null ? '' : fmtNum(value);
  const [v, setV] = useState(shown);
  useEffect(() => setV(shown), [shown]);
  const commit = () => {
    const n = v.trim() === '' ? null : parseRating(v);
    if (n !== null && !(n > 0)) return setV(shown); // ungültig → alten Wert zeigen
    if (n !== (value ?? null)) onCommit(n);
  };
  return <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}

function FuseTable({ doc }) {
  const table = fuseMaxOf(doc);
  const custom = !!doc.settings.fuseMax;
  const setMax = (cs, n) =>
    mut((d) => {
      const t = { ...fuseMaxOf(d) };
      if (n == null) delete t[cs];
      else t[cs] = n;
      d.settings.fuseMax = t;
    });
  return (
    <details className="fuse-table">
      <summary>Richtwerte bearbeiten {custom && <span className="dim">(angepasst)</span>}</summary>
      <p className="hint">Max. Absicherung je Querschnitt. Leeres Feld = dieser Querschnitt wird nicht geprüft. Gilt für dieses Projekt.</p>
      <div className="fuse-grid">
        <span className="dim">Querschnitt</span>
        <span className="dim">max. A</span>
        {CROSS_SECTIONS.map((cs) => (
          <Fragment key={cs}>
            <span>{fmtCs(cs)}</span>
            <DecimalInput value={table[cs]} onCommit={(n) => setMax(cs, n)} />
          </Fragment>
        ))}
      </div>
      {custom && <button className="full" onClick={() => mut((d) => delete d.settings.fuseMax)}>Standardwerte wiederherstellen</button>}
      <p className="hint">Standard: Richtwerte für FLRY-Leitungen. Sie ersetzen keine Auslegung nach Norm (Länge, Bündelung, Temperatur).</p>
    </details>
  );
}

function ConnPanel({ c, library }) {
  const set = (k, v) => mut((d) => (d.connectors.find((x) => x.id === c.id)[k] = v));
  const setPin = (pid, k, v) => mut((d) => (d.connectors.find((x) => x.id === c.id).pins.find((p) => p.id === pid)[k] = v));
  const types = library.filter((t) => kindOf(t) === kindOf(c));
  const known = types.some((t) => t.id === c.typeId);
  const what = c.part ? PARTS[c.part].label : c.source ? 'Stromversorgung' : 'Stecker';
  return (
    <>
      <h2>{what}</h2>
      <Field label="Bezeichnung"><input value={c.name} onChange={(e) => set('name', e.target.value)} /></Field>
      {c.source && (
        <Field label="Spannung (V)"><input inputMode="decimal" placeholder="z. B. 12" value={c.voltage ?? ''} onChange={(e) => set('voltage', e.target.value)} /></Field>
      )}
      {c.part && (
        <Field label="Bauteilart">
          <select value={c.part} onChange={(e) => set('part', e.target.value)}>
            {Object.entries(PARTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Typ aus Bibliothek">
        <select value={c.typeId ?? ''} onChange={(e) => applyType(c.id, types.find((t) => t.id === e.target.value) ?? null)}>
          <option value="">– frei –</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          {c.typeId && !known && <option value={c.typeId}>{c.typeName}</option>}
        </select>
      </Field>
      <Field label="Typbezeichnung"><input value={c.typeName} onChange={(e) => set('typeName', e.target.value)} /></Field>
      <div className="row2">
        <Field label="Hersteller"><input value={c.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} /></Field>
        <Field label="Teilenummer"><input value={c.partNumber} onChange={(e) => set('partNumber', e.target.value)} /></Field>
      </div>
      <Field label={c.part ? 'Anzahl Plätze' : c.source ? 'Anzahl Anschlüsse' : 'Pinzahl'}><CommitNumber min="1" max="99" value={c.pins.length} onCommit={(n) => setPinCount(c.id, n)} /></Field>
      <h3>{c.part ? 'Plätze (Eingang links → Ausgang rechts)' : c.source ? 'Anschlüsse (+ und − werden farbig markiert)' : 'Pins'}</h3>
      <div className="pins">
        {c.pins.map((p) => (
          <div key={p.id} className={'pin-row' + (c.part ? ' part' : '')}>
            <input value={p.num} onChange={(e) => setPin(p.id, 'num', e.target.value)} />
            {c.part && (
              <input placeholder={PARTS[c.part].placeholder} title={PARTS[c.part].unit ? 'in ' + PARTS[c.part].unit : ''} value={p.value} onChange={(e) => setPin(p.id, 'value', e.target.value)} />
            )}
            <input placeholder={c.part ? 'Funktion' : 'Signal'} value={p.signal} onChange={(e) => setPin(p.id, 'signal', e.target.value)} />
          </div>
        ))}
      </div>
      <button className="full" title="Strg+D" onClick={duplicateSelection}>Duplizieren</button>
      <button className="danger" onClick={deleteSelection}>{what} löschen</button>
    </>
  );
}

function SplicePanel({ s, doc }) {
  const wires = doc.wires.filter((w) => w.a.s === s.id || w.b.s === s.id);
  return (
    <>
      <h2>Spleiß</h2>
      <Field label="Bezeichnung"><input value={s.name} onChange={(e) => mut((d) => (d.splices.find((x) => x.id === s.id).name = e.target.value))} /></Field>
      <h3>Verbundene Drähte</h3>
      <ul className="plain">
        {wires.map((w) => {
          const o = epInfo(doc, w.a.s === s.id ? w.b : w.a);
          return <li key={w.id}><Dot w={w} /> {w.name} → {o.name}{o.pin && ':' + o.pin}</li>;
        })}
        {!wires.length && <li className="hint">keine</li>}
      </ul>
      <button className="full" title="Strg+D" onClick={duplicateSelection}>Duplizieren</button>
      <button className="danger" onClick={deleteSelection}>Spleiß löschen</button>
    </>
  );
}

function GroundPanel({ s, doc }) {
  const set = (k, v) => mut((d) => (d.splices.find((x) => x.id === s.id)[k] = v));
  const wires = doc.wires.filter((w) => w.a.s === s.id || w.b.s === s.id);
  return (
    <>
      <h2>Massepunkt</h2>
      <Field label="Bezeichnung"><input value={s.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Einbauort"><input placeholder="z. B. Karosserie A-Säule links" value={s.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
      <Field label="Kabelschuh / Befestigung"><input placeholder="z. B. Ringkabelschuh M6" value={s.terminal ?? ''} onChange={(e) => set('terminal', e.target.value)} /></Field>
      <h3>Angeschlossene Drähte ({wires.length})</h3>
      <ul className="plain">
        {wires.map((w) => {
          const o = epInfo(doc, w.a.s === s.id ? w.b : w.a);
          return <li key={w.id} className="link-item" onClick={() => setSel([{ t: 'w', id: w.id }])}><Dot w={w} /> {w.name} → {o.name}{o.pin && ':' + o.pin}{o.signal && <small className="dim"> {o.signal}</small>}</li>;
        })}
        {!wires.length && <li className="hint">keine – vom Pin auf den Massepunkt ziehen</li>}
      </ul>
      <button className="full" title="Strg+D" onClick={duplicateSelection}>Duplizieren</button>
      <button className="danger" onClick={deleteSelection}>Massepunkt löschen</button>
    </>
  );
}

const Dot = ({ w }) => <span className="dot" style={{ background: COLORS[w.color]?.hex }} />;

function Swatches({ value, onChange, allowNone }) {
  return (
    <div className="swatches">
      {allowNone && <button className={'swatch none' + (!value ? ' active' : '')} title="ohne" onClick={() => onChange('')}>–</button>}
      {Object.entries(COLORS).map(([code, c]) => (
        <button key={code} className={'swatch' + (value === code ? ' active' : '')} title={`${code} – ${c.name}`} style={{ background: c.hex }} onClick={() => onChange(code)} />
      ))}
    </div>
  );
}

function WirePanel({ w, doc }) {
  const set = (k, v) => {
    mut((d) => (d.wires.find((x) => x.id === w.id)[k] = v));
    if (k in lastStyle) lastStyle[k] = v;
  };
  const a = epInfo(doc, w.a), b = epInfo(doc, w.b);
  const auto = autoLength(doc, w);
  const fw = fuseWarnings(doc).wires.get(w.id);
  const colorName = COLORS[w.color]?.name + (w.stripe ? ' / ' + COLORS[w.stripe]?.name : '');
  return (
    <>
      <h2>Draht</h2>
      <Field label="Bezeichnung"><input value={w.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="endpoints">
        <div><b>{a.name}{a.pin && ':' + a.pin}</b><span>{a.signal}</span></div>
        <div className="arrow">→</div>
        <div><b>{b.name}{b.pin && ':' + b.pin}</b><span>{b.signal}</span></div>
      </div>
      <Field label={`Farbe – ${colorName}`}><Swatches value={w.color} onChange={(v) => set('color', v)} /></Field>
      <Field label="Kennfarbe (Streifen)"><Swatches value={w.stripe} allowNone onChange={(v) => set('stripe', v)} /></Field>
      <Field label="Querschnitt">
        <select value={w.cs} onChange={(e) => set('cs', +e.target.value)}>
          {CROSS_SECTIONS.map((cs) => <option key={cs} value={cs}>{fmtCs(cs)}</option>)}
        </select>
      </Field>
      {fw && <div className="warn-box">⚠ Querschnitt zu klein: {fuseText(fw)}</div>}
      <Field label="Länge (mm)">
        <input
          type="number"
          min="0"
          value={w.length ?? ''}
          placeholder={auto != null ? `${Math.round(auto)} (berechnet)` : 'kein Bündel – bitte eintragen'}
          onChange={(e) => set('length', e.target.value === '' ? null : +e.target.value)}
        />
      </Field>
      <p className="hint">Leer lassen = Summe der Bündellängen + 2 × Zugabe.</p>
      <h3>Bündel</h3>
      {doc.bundles.map((bd) => (
        <label key={bd.id} className="check">
          <input type="checkbox" checked={bd.wireIds.includes(w.id)} onChange={(e) => setBundleWires(bd.id, [w.id], e.target.checked)} />
          {bd.name} <small className="dim">{bd.length} mm</small>
        </label>
      ))}
      {!doc.bundles.length && <p className="hint">Noch keine Bündel angelegt.</p>}
      {w.mx != null && <button className="full" onClick={() => set('mx', null)}>Führung zurücksetzen</button>}
      <button className="danger" onClick={deleteSelection}>Draht löschen</button>
    </>
  );
}

function MultiPanel({ doc, selection }) {
  const wireIds = selection.filter((x) => x.t === 'w').map((x) => x.id);
  return (
    <>
      <h2>{selection.length} Elemente ausgewählt</h2>
      {wireIds.length > 0 && (
        <>
          <p className="hint">{wireIds.length} Draht/Drähte in der Auswahl.</p>
          <Field label="Zu Bündel hinzufügen">
            <select value="" onChange={(e) => (e.target.value === '__new' ? createBundle(wireIds) : setBundleWires(e.target.value, wireIds, true))}>
              <option value="" disabled>Bündel wählen …</option>
              {doc.bundles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="__new">+ Neues Bündel</option>
            </select>
          </Field>
        </>
      )}
      {selection.some((x) => x.t !== 'w') && (
        <button className="full" title="Strg+D – Drähte zwischen den ausgewählten Steckern werden mitkopiert" onClick={duplicateSelection}>Duplizieren</button>
      )}
      <button className="danger" onClick={deleteSelection}>Auswahl löschen</button>
    </>
  );
}

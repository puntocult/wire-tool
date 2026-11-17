import { useEffect, useRef, useState } from 'react';
import { useStore, mut, clickSelect, setSel, addWire, addSplice, addConnector, canvasApi, isSel, toggleMulti } from './store';
import { PALETTES } from './theme';
import { CW, HH, RH, connHeight, COLORS, wireGeom, fuseWarnings, valueLabel, elementLabel, voltageLabel } from './model';

const snap = (v) => Math.round(v / 10) * 10;
const ACCENT = '#3dd68c';
// Polaritätsfarben für Anschlüsse von Stromversorgungen
const POLE = { '+': '#e5484d', '-': '#3e8ef7', '−': '#3e8ef7' };

export default function Canvas() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const highlight = useStore((s) => s.highlight);
  const svgRef = useRef(null);
  const contentRef = useRef(null);
  const [view, setView] = useState({ x: 40, y: 40, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef(null);
  const touches = useRef(new Map()); // aktive Finger: pointerId -> Position
  const [ghost, setGhost] = useState(null);
  const multi = useStore((s) => s.multi);
  const P = PALETTES[useStore((s) => s.theme)];

  const toWorld = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
  };

  useEffect(() => {
    canvasApi.content = () => contentRef.current;
    canvasApi.center = () => {
      const r = svgRef.current.getBoundingClientRect(), v = viewRef.current;
      return { x: snap((r.width / 2 - v.x) / v.k - CW / 2), y: snap((r.height / 2 - v.y) / v.k - 60) };
    };
    canvasApi.fit = () => {
      const b = contentRef.current.getBBox();
      if (!b.width) return;
      const r = svgRef.current.getBoundingClientRect();
      const k = Math.min(1.5, Math.max(0.2, Math.min((r.width - 100) / b.width, (r.height - 100) / b.height)));
      setView({ k, x: (r.width - b.width * k) / 2 - b.x * k, y: (r.height - b.height * k) / 2 - b.y * k });
    };
    requestAnimationFrame(() => canvasApi.fit());
  }, []);

  // Zoom mit Mausrad (zum Mauszeiger hin)
  useEffect(() => {
    const el = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(3, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const move = (e) => {
      if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = drag.current;
      if (!g) return;
      if (g.type === 'pinch') {
        const [a, b] = [...touches.current.values()];
        if (!b) return;
        const r = svgRef.current.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        const k = Math.min(3, Math.max(0.2, (g.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist));
        setView({ k, x: mx - g.wx * k, y: my - g.wy * k });
        return;
      }
      if (!g.moved && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) > (e.pointerType === 'touch' ? 8 : 3)) {
        g.moved = true;
        clearTimeout(g.lp);
      }
      if (g.type === 'pan') {
        setView((v) => ({ ...v, x: g.vx + e.clientX - g.cx, y: g.vy + e.clientY - g.cy }));
      } else if (g.type === 'move' && g.moved) {
        const p = toWorld(e);
        const dx = p.x - g.wx, dy = p.y - g.wy;
        mut((d) => {
          for (const o of g.items) {
            const n = (o.t === 'c' ? d.connectors : d.splices).find((x) => x.id === o.id);
            if (n) { n.x = snap(o.x + dx); n.y = snap(o.y + dy); }
          }
        });
      } else if (g.type === 'wire') {
        setGhost({ from: g.from, to: toWorld(e) });
      } else if (g.type === 'mx' && g.moved) {
        const p = toWorld(e);
        mut((d) => { const w = d.wires.find((x) => x.id === g.id); if (w) w.mx = snap(p.x); });
      }
    };
    const up = (e) => {
      touches.current.delete(e.pointerId);
      const g = drag.current;
      if (!g) return;
      clearTimeout(g.lp);
      if (g.type === 'pinch') { if (touches.current.size === 0) drag.current = null; return; }
      drag.current = null;
      if (e.type === 'pointercancel') { setGhost(null); return; }
      if (g.type === 'pan' && !g.moved) setSel([]);
      if (g.type !== 'wire') return;
      setGhost(null);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const pinEl = el?.closest('[data-pin]');
      const spEl = el?.closest('[data-splice]');
      let target = pinEl ? { c: pinEl.dataset.conn, p: pinEl.dataset.pin } : spEl ? { s: spEl.dataset.splice } : null;
      // Durchgangs-Bauteil: rechte Zeilenhälfte = Ausgang
      if (pinEl?.dataset.pout) {
        const r = pinEl.getBoundingClientRect();
        if (e.clientX > r.left + r.width / 2) target.p = pinEl.dataset.pout;
      }
      if (target) {
        if (JSON.stringify(target) !== JSON.stringify(g.ep)) addWire(g.ep, target);
      } else if (g.moved && el?.closest('svg') === svgRef.current) {
        // Ins Leere gezogen: neuen Spleiß anlegen
        const p = toWorld(e);
        const sid = addSplice(snap(p.x), snap(p.y));
        addWire(g.ep, { s: sid });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  // Zwei Finger: laufende Aktion abbrechen und zoomen/verschieben
  const trackTouch = (e) => {
    if (e.pointerType !== 'touch') return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size !== 2) return;
    e.stopPropagation(); // zweiter Finger soll kein Element greifen
    clearTimeout(drag.current?.lp);
    setGhost(null);
    const [a, b] = [...touches.current.values()];
    const r = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    drag.current = { type: 'pinch', k: v.k, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, wx: (mx - v.x) / v.k, wy: (my - v.y) / v.k };
  };

  // Langes Drücken auf einen Spleiß startet einen Draht (Touch-Ersatz für Alt+Ziehen)
  const downSplice = (e, s) => {
    if (e.altKey) return startWire(e, { s: s.id }, { x: s.x, y: s.y });
    startNode(e, 's', s.id);
    const g = drag.current;
    if (g?.type !== 'move') return;
    g.lp = setTimeout(() => {
      if (drag.current !== g || g.moved) return;
      navigator.vibrate?.(25);
      drag.current = { type: 'wire', ep: { s: s.id }, from: { x: s.x, y: s.y }, cx: g.cx, cy: g.cy };
      setGhost({ from: { x: s.x, y: s.y }, to: { x: s.x, y: s.y } });
    }, 450);
  };

  const startPan = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag.current = { type: 'pan', cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y };
  };

  const startNode = (e, t, id) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    clickSelect(t, id, e.shiftKey);
    const st = useStore.getState();
    if (!isSel(st.selection, t, id)) return;
    const p = toWorld(e);
    const items = st.selection
      .filter((o) => o.t === 'c' || o.t === 's')
      .map((o) => ({ ...o, n: (o.t === 'c' ? st.doc.connectors : st.doc.splices).find((x) => x.id === o.id) }))
      .filter((o) => o.n)
      .map((o) => ({ t: o.t, id: o.id, x: o.n.x, y: o.n.y }));
    drag.current = { type: 'move', cx: e.clientX, cy: e.clientY, wx: p.x, wy: p.y, items };
  };

  const startWire = (e, ep, from) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    drag.current = { type: 'wire', ep, from, cx: e.clientX, cy: e.clientY };
    setGhost({ from, to: from });
  };

  const downWire = (e, w) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const was = isSel(useStore.getState().selection, 'w', w.id);
    clickSelect('w', w.id, e.shiftKey);
    if (was && !e.shiftKey) drag.current = { type: 'mx', id: w.id, cx: e.clientX, cy: e.clientY };
  };

  const warn = fuseWarnings(doc);
  const selSet = new Set(selection.map((x) => x.t + x.id));
  const hb = highlight && doc.bundles.find((b) => b.id === highlight);
  const hbSet = hb ? new Set(hb.wireIds) : null;
  const zoomBy = (f) => {
    const r = svgRef.current.getBoundingClientRect();
    const px = r.width / 2, py = r.height / 2;
    setView((v) => {
      const k = Math.min(3, Math.max(0.2, v.k * f));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  };

  return (
    <>
      <svg
        ref={svgRef}
        className={'canvas' + (ghost ? ' wiring' : '')}
        onPointerDownCapture={trackTouch}
        onPointerDown={(e) => drag.current?.type !== 'pinch' && startPan(e)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <circle cx="1" cy="1" r="1" fill={P.dots} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g ref={contentRef} fontFamily="Inter, 'Segoe UI', system-ui, sans-serif">
            {doc.wires.map((w, i) => (
              <Wire key={w.id} P={P} doc={doc} w={w} idx={i} selected={selSet.has('w' + w.id)} warn={warn.wires.has(w.id)} dim={hbSet && !hbSet.has(w.id)} onDown={(e) => downWire(e, w)} />
            ))}
            {doc.connectors.map((c) => (
              <Connector key={c.id} P={P} c={c} selected={selSet.has('c' + c.id)} warnSlots={warn.slots} onDown={(e) => startNode(e, 'c', c.id)} onPort={startWire} />
            ))}
            {doc.splices.map((s) => (
              <g
                key={s.id}
                className="splice"
                transform={`translate(${s.x},${s.y})`}
                data-splice={s.id}
                onPointerDown={(e) => downSplice(e, s)}
              >
                {selSet.has('s' + s.id) && <circle className="sel" r="10" fill="none" stroke={ACCENT} strokeWidth="1.5" />}
                <circle r="10" fill="transparent" />
                <circle r="5" fill={P.text} stroke={P.casing} strokeWidth="2" />
                <text y="-13" textAnchor="middle" fontSize="10" fill={P.dim}>{s.name}</text>
              </g>
            ))}
          </g>
          {ghost && (
            <path d={`M${ghost.from.x},${ghost.from.y} L${ghost.to.x},${ghost.to.y}`} stroke={ACCENT} strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" />
          )}
        </g>
      </svg>
      <div className="toolbar">
        <button onClick={() => { const p = canvasApi.center(); addConnector(null, p.x, p.y); }}>+ Stecker</button>
        <button onClick={() => { const p = canvasApi.center(); addConnector({ part: 'fuse', pinCount: 1 }, p.x, p.y); }}>+ Sicherung</button>
        <button onClick={() => { const p = canvasApi.center(); addConnector({ source: true, voltage: '12', pinCount: 2, pinNames: '+,−' }, p.x, p.y); }}>+ Batterie</button>
        <button onClick={() => { const p = canvasApi.center(); addSplice(p.x + CW / 2, p.y + 60); }}>+ Spleiß</button>
        <span className="sep" />
        <button className={multi ? 'on' : 'ghost'} title="Mehrfachauswahl: Antippen fügt hinzu/entfernt (wie Shift+Klick)" onClick={toggleMulti}>Mehrfach</button>
        <button className="ghost zoom-btn" onClick={() => zoomBy(1 / 1.2)}>−</button>
        <span className="zoom">{Math.round(view.k * 100)} %</span>
        <button className="ghost zoom-btn" onClick={() => zoomBy(1.2)}>+</button>
        <button className="ghost" onClick={() => canvasApi.fit()}>Einpassen</button>
      </div>
      <div className="hintbar">
        Vom Pin-Punkt ziehen: Draht · ins Leere ziehen: Spleiß · Alt+Ziehen am Spleiß: Draht · Shift+Klick: Mehrfachauswahl · Strg+C/V, Strg+D: kopieren/duplizieren ·ausgewählten Draht ziehen: Führung verschieben · Entf: löschen
      </div>
    </>
  );
}

function Wire({ P, doc, w, idx, selected, warn, dim, onDown }) {
  const g = wireGeom(doc, w, idx);
  if (!g) return null;
  const col = COLORS[w.color]?.hex ?? '#888';
  const stripe = w.stripe && COLORS[w.stripe]?.hex;
  const sw = 2.2 + Math.sqrt(w.cs || 0.5) * 1.3;
  const common = { d: g.d, fill: 'none', strokeLinejoin: 'round' };
  return (
    <g opacity={dim ? 0.12 : 1}>
      {warn && <path className="sel" {...common} stroke={P.warn} strokeOpacity="0.35" strokeWidth={sw + 6} strokeDasharray="4 4" />}
      {selected && <path className="sel" {...common} stroke={ACCENT} strokeOpacity="0.4" strokeWidth={sw + 8} strokeLinecap="round" />}
      <path {...common} stroke={P.casing} strokeWidth={sw + 2.5} />
      <path {...common} stroke={col} strokeWidth={sw} />
      {stripe && <path {...common} stroke={stripe} strokeWidth={sw * 0.5} strokeDasharray="7 7" />}
      <path className="hit" {...common} stroke="transparent" strokeWidth="12" onPointerDown={onDown} style={{ cursor: selected ? 'ew-resize' : 'pointer' }} />
    </g>
  );
}

function Connector({ P, c, selected, warnSlots, onDown, onPort }) {
  const h = connHeight(c);
  const label = c.source ? c.typeName : c.part || c.typeName ? elementLabel(c) : '';
  // Stromversorgung: Batteriesymbol + Spannung hinter dem Namen
  const symX = 12 + c.name.length * 7.5 + 8;
  const volt = c.source ? voltageLabel(c.voltage) : '';
  const used = c.source ? symX + 16 + volt.length * 6.8 : 12 + c.name.length * 7.5;
  const maxType = Math.max(0, Math.floor((CW - 24 - used) / 5.8));
  const type = label.length > maxType ? label.slice(0, Math.max(0, maxType - 1)) + '…' : label;
  return (
    <g className="conn" transform={`translate(${c.x},${c.y})`} onPointerDown={onDown}>
      {selected && <rect className="sel" x={-3} y={-3} width={CW + 6} height={h + 6} rx="10" fill="none" stroke={ACCENT} strokeWidth="1.5" />}
      <rect width={CW} height={h} rx="7" fill={P.card} stroke={P.cardStroke} />
      <path d={`M0,${HH} H${CW}`} stroke={P.cardStroke} />
      <text x="12" y="19" fontSize="12" fontWeight="600" fill={P.text}>{c.name}</text>
      <text x={CW - 12} y="19" fontSize="10" textAnchor="end" fill={P.dim}>{type}</text>
      {c.source && (
        <>
          <g stroke={P.text} fill="none">
            <path d={`M${symX},15 H${symX + 3} M${symX + 9},15 H${symX + 12}`} strokeWidth="1.2" />
            <path d={`M${symX + 3},8 V22`} stroke={POLE['+']} strokeWidth="1.4" />
            <path d={`M${symX + 9},11 V19`} stroke={POLE['−']} strokeWidth="3" />
          </g>
          <text x={symX + 17} y="19" fontSize="11" fontWeight="600" fill={P.signal}>{volt}</text>
        </>
      )}
      {c.pins.map((p, i) => {
        const y = HH + i * RH;
        return (
          <g key={p.id} data-conn={c.id} data-pin={p.id} data-pout={p.outId}>
            <rect x="0" y={y} width={CW} height={RH} fill="transparent" />
            {i > 0 && <path d={`M8,${y} H${CW - 8}`} stroke={P.sep} />}
            {c.source && POLE[p.num.trim()] ? (
              <text x="12" y={y + 14} fontSize="13" fontWeight="700" fill={POLE[p.num.trim()]}>{p.num}</text>
            ) : (
              <text x="12" y={y + 14} fontSize="11" fill="#6f747e">{p.num}</text>
            )}
            {c.part ? (
              <>
                <PartSymbol part={c.part} cy={y + RH / 2} />
                <text x="64" y={y + 14} fontSize="11" fontWeight="600" fill={warnSlots.has(p.id) ? P.warn : P.signal}>{valueLabel(c.part, p.value)}</text>
                <text x={CW - 12} y={y + 14} fontSize="10" textAnchor="end" fill={P.dim}>{p.signal}</text>
              </>
            ) : (
              <text x="40" y={y + 14} fontSize="11" fill={P.signal}>{p.signal}</text>
            )}
            {[0, CW].map((px) => {
              const pid = c.part && px ? p.outId : p.id;
              return (
                <g key={px} className="port" onPointerDown={(e) => onPort(e, { c: c.id, p: pid }, { x: c.x + px, y: c.y + y + RH / 2 })}>
                  <circle className="hitc" cx={px} cy={y + RH / 2} r="8" fill="transparent" />
                  <circle cx={px} cy={y + RH / 2} r="3.5" fill={ACCENT} stroke={P.casing} strokeWidth="1.5" />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// Kleine Schaltzeichen für Durchgangs-Bauteile (Eingang links → Ausgang rechts)
function PartSymbol({ part, cy }) {
  const s = { stroke: '#8a8f99', strokeWidth: 1.3, fill: 'none' };
  if (part === 'fuse') return <g {...s}><rect x="32" y={cy - 4} width="22" height="8" rx="1" /><path d={`M28,${cy} H58`} /></g>;
  if (part === 'resistor') return <g {...s}><path d={`M28,${cy} H32 M54,${cy} H58`} /><rect x="32" y={cy - 4} width="22" height="8" rx="1" /></g>;
  if (part === 'diode') return <g {...s}><path d={`M28,${cy} H58`} /><path d={`M37,${cy - 5} L37,${cy + 5} L47,${cy} Z`} fill="#8a8f99" /><path d={`M47,${cy - 5} V${cy + 5}`} /></g>;
  return <g {...s}><path d={`M28,${cy} H35 L50,${cy - 6} M51,${cy} H58`} /><circle cx="35" cy={cy} r="1.6" fill="#8a8f99" /><circle cx="51" cy={cy} r="1.6" fill="#8a8f99" /></g>;
}

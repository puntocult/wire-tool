import { useStore } from './store';
import { cutList, bom, COLORS, fuseWarnings } from './model';
import { downloadCSV } from './export';

export function CutList() {
  const doc = useStore((s) => s.doc);
  const { header, rows, wires } = cutList(doc);
  const warn = fuseWarnings(doc).wires;
  return (
    <div className="table-view">
      <div className="table-head">
        <h2>Schnittliste</h2>
        <button onClick={() => downloadCSV(doc.name + ' – Schnittliste', [header, ...rows])}>CSV exportieren</button>
      </div>
      <table>
        <thead><tr>{header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={wires[i].id}>
              {r.map((v, j) => {
                const fw = j === 8 && warn.get(wires[i].id);
                return (
                  <td key={j} className={(j === 9 && v === '') || fw ? 'warn' : ''} title={fw ? `Zu dünn für ${fw.fuse} (${fw.rating} A), Richtwert max. ${fw.max} A` : undefined}>
                    {j === 7 && <Swatch w={wires[i]} />}
                    {j === 9 && v === '' ? 'fehlt' : v}
                    {fw && ' ⚠'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="hint">Noch keine Drähte.</p>}
    </div>
  );
}

const Swatch = ({ w }) => (
  <span className="wire-swatch" style={{ background: COLORS[w.color]?.hex }}>
    {w.stripe && <span style={{ background: COLORS[w.stripe]?.hex }} />}
  </span>
);

export function Bom() {
  const doc = useStore((s) => s.doc);
  const sections = bom(doc);
  const csv = () => {
    const out = [];
    for (const s of sections) out.push([s.title], s.header, ...s.rows, []);
    downloadCSV(doc.name + ' – Stückliste', out);
  };
  return (
    <div className="table-view">
      <div className="table-head">
        <h2>Stückliste</h2>
        <button onClick={csv}>CSV exportieren</button>
      </div>
      {sections.map((s) => (
        <div key={s.title} className="bom-section">
          <h3>{s.title}</h3>
          {s.rows.length ? (
            <table>
              <thead><tr>{s.header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>{s.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
            </table>
          ) : <p className="hint">keine</p>}
          {s.note && <p className="warn">{s.note}</p>}
        </div>
      ))}
    </div>
  );
}

import { formatMoney } from '../format';
import './BarList.css';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Text shown next to the bar (defaults to the value as money). */
  display?: string;
}

interface BarListProps {
  title: string;
  rows: BarRow[];
  /** Small note on the right of the title, e.g. "Rs · share of total". */
  unitNote?: string;
  empty?: string;
  showShare?: boolean;
}

/** Horizontal CSS bars — longest = highest. Every bar has its value as text beside it. (From LocationBreakdown.) */
function BarList({ title, rows, unitNote = 'Rs · share of total', empty = 'Nothing in this period.', showShare = true }: BarListProps) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="card breakdown-card">
      <div className="breakdown-header">
        <div className="section-title">{title}</div>
        <div className="breakdown-unit">{unitNote}</div>
      </div>

      {rows.length === 0 || grandTotal === 0 ? (
        <p className="breakdown-empty">{empty}</p>
      ) : (
        <ul className="breakdown-list">
          {rows.map((r) => (
            <li className="breakdown-row" key={r.key}>
              <div className="breakdown-label" title={r.label}>
                {r.label}
              </div>
              <div className="breakdown-track" aria-hidden="true">
                <div className="breakdown-bar" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
              </div>
              <div className="breakdown-value mono">{r.display ?? formatMoney(r.value)}</div>
              {showShare && <div className="breakdown-share mono">{Math.round((r.value / grandTotal) * 100)}%</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default BarList;

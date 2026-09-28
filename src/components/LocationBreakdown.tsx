import { formatPKR } from '../format';
import './LocationBreakdown.css';

export interface LocationTotal {
  location: string;
  total: number;
}

interface LocationBreakdownProps {
  rows: LocationTotal[];
}

/** Horizontal CSS bars — one per location, longest = highest sales. */
function LocationBreakdown({ rows }: LocationBreakdownProps) {
  const max = Math.max(...rows.map((r) => r.total), 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="card breakdown-card">
      <div className="breakdown-header">
        <div className="section-title">Sales by location</div>
        <div className="breakdown-unit">PKR · share of total</div>
      </div>

      {grandTotal === 0 ? (
        <p className="breakdown-empty">No sales match these filters.</p>
      ) : (
        <div className="breakdown-list">
          {rows.map((r) => (
            <div className="breakdown-row" key={r.location}>
              <div className="breakdown-label">{r.location}</div>
              <div className="breakdown-track">
                <div className="breakdown-bar" style={{ width: `${max ? (r.total / max) * 100 : 0}%` }} />
              </div>
              <div className="breakdown-value mono">{formatPKR(r.total)}</div>
              <div className="breakdown-share mono">{Math.round((r.total / grandTotal) * 100)}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LocationBreakdown;

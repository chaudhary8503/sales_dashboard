import { stockAvailability } from '../api';
import { formatQty } from '../format';
import { useAsync } from '../hooks';
import { itemById, type Session } from '../session';
import './StockPanel.css';

interface StockPanelProps {
  session: Session;
  itemIds: string[];
  /** Base quantity needed per "itemId|locationId" (the supply locations on the form). */
  needs: Map<string, number>;
  /** Bump to reload (e.g. after posting). */
  refreshKey?: number;
}

/** Stock of every item on the form at every active location; supply locations highlighted, amber when short. */
function StockPanel({ session, itemIds, needs, refreshKey }: StockPanelProps) {
  const unique = [...new Set(itemIds.filter(Boolean))];
  const { data, error, loading, reload } = useAsync(() => stockAvailability(unique), [unique.join(','), refreshKey]);

  return (
    <aside className="card stock-panel" aria-label="Stock">
      <div className="stock-panel-head">
        <div className="section-title">Stock</div>
        <button type="button" className="btn btn-secondary btn-small" onClick={reload} disabled={loading || unique.length === 0}>
          Refresh
        </button>
      </div>
      {unique.length === 0 ? (
        <p className="sub">Choose an item to see its stock at every location.</p>
      ) : error ? (
        <p className="sub amber">{error}</p>
      ) : loading && !data ? (
        <p className="sub">Loading…</p>
      ) : (
        unique.map((id) => {
          const item = itemById(session, id);
          const rows = (data ?? []).filter((r) => r.item_id === id);
          return (
            <div key={id} className="stock-panel-item">
              <div className="stock-panel-name">{item?.invoice_name || item?.name || rows[0]?.item_name}</div>
              <ul>
                {rows.map((r) => {
                  const need = needs.get(`${id}|${r.location_id}`);
                  const short = need !== undefined && need > r.quantity + 0.0005;
                  return (
                    <li key={r.location_id} className={need !== undefined ? (short ? 'supply short' : 'supply') : undefined}>
                      <span>{r.location_name}</span>
                      <span className="mono">{formatQty(r.quantity, r.unit)}</span>
                      {short && <span className="stock-panel-note">needs {formatQty(need, r.unit)}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
    </aside>
  );
}

export default StockPanel;

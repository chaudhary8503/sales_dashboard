import { useMemo, useState } from 'react';
import { getAnalytics, type Analytics } from '../api';
import BarList from '../components/BarList';
import { Banner, Loading } from '../components/Common';
import KpiCard from '../components/KpiCard';
import { addDays, daysBetween, formatDate, formatMoney, formatQty } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';
import './AnalyticsPage.css';

type Preset = 'today' | 'week' | 'month' | 'last_month' | 'year' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

/** Date range for a preset, in Karachi business dates (weeks start on Monday). */
function presetRange(p: Preset, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
      return { from: addDays(today, -((dow + 6) % 7)), to: today };
    }
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last_month': {
      const first = `${y}-${pad(m)}-01`;
      const lastPrev = addDays(first, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case 'year':
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: addDays(today, -29), to: today };
  }
}

const monthName = (ym: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(`${ym}-01T00:00:00`));

function AnalyticsPage({ session }: { session: Session }) {
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState(() => presetRange('custom', session.today));
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const range = preset === 'custom' ? custom : presetRange(preset, session.today);
  const valid = range.from <= range.to;
  const { data, error, loading } = useAsync(
    () => (valid ? getAnalytics(range.from, range.to, locationIds) : Promise.reject(new Error('The start date is after the end date.'))),
    [range.from, range.to, locationIds.join(',')],
  );

  const toggleLocation = (id: string) => setLocationIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <>
      <h1 className="page-title">Analytics</h1>
      <p className="page-sub">
        Revenue is invoice totals (cancelled invoices left out). {formatDate(range.from)} – {formatDate(range.to)}
        {locationIds.length ? ` · ${locationIds.length} location${locationIds.length === 1 ? '' : 's'}` : ' · all locations'}.
      </p>

      <div className="card an-filters">
        <div className="tabs" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" aria-pressed={preset === p.key} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="filters">
            <input type="date" value={custom.from} max={session.today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From date" />
            <input type="date" value={custom.to} max={session.today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To date" />
          </div>
        )}
        <div className="chips" role="group" aria-label="Locations">
          <button type="button" aria-pressed={locationIds.length === 0} onClick={() => setLocationIds([])}>
            All locations
          </button>
          {session.locations.map((l) => (
            <button key={l.location_id} type="button" aria-pressed={locationIds.includes(l.location_id)} onClick={() => toggleLocation(l.location_id)}>
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {loading && !data ? <Loading /> : data ? <AnalyticsBody a={data} session={session} /> : null}
    </>
  );
}

function AnalyticsBody({ a, session }: { a: Analytics; session: Session }) {
  const t = a.totals;
  const days = daysBetween(a.from, a.to) + 1;
  const byDay = days <= 62;
  const timeline = byDay
    ? a.by_day.map((d) => ({ key: d.date, label: formatDate(d.date), value: d.revenue, cash: d.cash ?? 0, credit: d.credit ?? 0 }))
    : a.by_month.map((m) => ({ key: m.month, label: monthName(m.month), value: m.revenue, cash: m.cash, credit: m.credit }));

  return (
    <div className="stack">
      <div className="kpi-row">
        <KpiCard label="Revenue" value={formatMoney(t.revenue)} sub={`${t.invoice_count} invoice${t.invoice_count === 1 ? '' : 's'}`} />
        <KpiCard label="Cash sales" value={formatMoney(t.cash)} sub={t.revenue ? `${Math.round((t.cash / t.revenue) * 100)}% of revenue` : undefined} />
        <KpiCard label="Credit sales" value={formatMoney(t.credit)} sub={t.revenue ? `${Math.round((t.credit / t.revenue) * 100)}% of revenue` : undefined} />
        <KpiCard label="Returns" value={formatMoney(t.returns)} />
        <KpiCard label="Invoices" value={String(t.invoice_count)} sub={t.invoice_count ? `average ${formatMoney(t.revenue / t.invoice_count)}` : undefined} />
        <KpiCard label="Discounts given" value={formatMoney(t.discounts)} />
      </div>

      <BarList title={byDay ? 'Revenue by day' : 'Revenue by month'} rows={timeline} />
      {timeline.length > 0 && (
        <div className="card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{byDay ? 'Day' : 'Month'}</th>
                  <th className="num">Cash</th>
                  <th className="num">Credit</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="num mono">{formatMoney(r.cash)}</td>
                    <td className="num mono">{formatMoney(r.credit)}</td>
                    <td className="num mono">{formatMoney(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="an-two">
        <BarList
          title="By sale location"
          rows={a.by_location.map((l) => ({ key: l.location_id, label: l.name, value: l.revenue, display: `${formatMoney(l.revenue)} · ${l.invoices}` }))}
          unitNote="Rs · invoices · share"
        />
        <BarList
          title="By supply location"
          rows={a.by_supply_location.map((l) => ({ key: l.location_id, label: l.name, value: l.revenue }))}
          unitNote="Rs of lines supplied · share"
        />
      </div>

      <ProductTable a={a} />

      <div className="card">
        <div className="section-title">By customer (top 50)</div>
        {a.by_customer.length === 0 ? (
          <p className="sub">No sales in this period.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Invoices</th>
                  <th className="num">Cash</th>
                  <th className="num">Credit</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {a.by_customer.map((c) => (
                  <tr key={c.customer_id ?? 'walk-in'}>
                    <td>
                      {c.customer_id && session.customersLive ? <a href={href(`customers/${c.customer_id}`)}>{c.name}</a> : c.name}
                    </td>
                    <td className="num mono">{c.invoices}</td>
                    <td className="num mono">{formatMoney(c.cash)}</td>
                    <td className="num mono">{formatMoney(c.credit)}</td>
                    <td className="num mono">{formatMoney(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="an-two">
        <div className="card">
          <div className="section-title">Receivables (today)</div>
          <dl className="kv">
            <dt>Outstanding</dt>
            <dd className="mono">{formatMoney(a.receivables.outstanding)}</dd>
            <dt>Overdue</dt>
            <dd className={`mono${a.receivables.overdue > 0 ? ' amber' : ''}`}>
              {formatMoney(a.receivables.overdue)} ({a.receivables.overdue_invoices} invoice{a.receivables.overdue_invoices === 1 ? '' : 's'})
            </dd>
            <dt>Cheques pending</dt>
            <dd className="mono">{formatMoney(a.receivables.pending_cheques)}</dd>
          </dl>
        </div>
        <div className="card">
          <div className="section-title">Open sale orders</div>
          <dl className="kv">
            <dt>Orders</dt>
            <dd className="mono">{a.open_sale_orders.count}</dd>
            <dt>Value</dt>
            <dd className="mono">{formatMoney(a.open_sale_orders.value)}</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Profit</div>
        {a.profit.available ? (
          <>
            <dl className="kv">
              <dt>Revenue (before tax)</dt>
              <dd className="mono">{formatMoney(a.profit.revenue_ex_tax)}</dd>
              <dt>Cost of goods sold</dt>
              <dd className="mono">− {formatMoney(a.profit.cost_of_sales ?? 0)}</dd>
              <dt>Returns (value)</dt>
              <dd className="mono">− {formatMoney(a.profit.returns_value ?? 0)}</dd>
              <dt>Returns (cost back in stock)</dt>
              <dd className="mono">+ {formatMoney(a.profit.returns_cost ?? 0)}</dd>
              <dt>
                <strong>Gross profit</strong>
              </dt>
              <dd className="mono">
                <strong>{formatMoney(a.profit.gross_profit ?? 0)}</strong>
                {(() => {
                  const net = a.profit.revenue_ex_tax - (a.profit.returns_value ?? 0);
                  return net > 0 ? <span className="sub"> · margin {(((a.profit.gross_profit ?? 0) / net) * 100).toFixed(1)}%</span> : null;
                })()}
              </dd>
            </dl>
            {a.profit.note && (
              <Banner kind="info">
                {a.profit.note}
                {a.profit.pending_cost_ft ? ` (${formatQty(a.profit.pending_cost_ft, 'ft')} of cable)` : ''}
              </Banner>
            )}
          </>
        ) : (
          <Banner kind="info">{a.profit.note ?? 'Profit is not available.'}</Banner>
        )}
      </div>
    </div>
  );
}

function ProductTable({ a }: { a: Analytics }) {
  const [type, setType] = useState('');
  const [size, setSize] = useState('');
  const types = useMemo(() => [...new Set(a.by_product.map((p) => p.cable_type).filter((x): x is string => Boolean(x)))].sort(), [a]);
  const sizes = useMemo(
    () => [...new Set(a.by_product.map((p) => p.size_mm2).filter((x): x is string => Boolean(x)))].sort((x, y) => parseFloat(x) - parseFloat(y)),
    [a],
  );
  const rows = a.by_product.filter((p) => (!type || p.cable_type === type) && (!size || p.size_mm2 === size));
  const total = rows.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="card">
      <div className="section-title">By product</div>
      {(types.length > 0 || sizes.length > 0) && (
        <div className="chip-rows">
          {types.length > 0 && (
            <div className="chips" role="group" aria-label="Cable type">
              <button type="button" aria-pressed={!type} onClick={() => setType('')}>
                All types
              </button>
              {types.map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {sizes.length > 0 && (
            <div className="chips" role="group" aria-label="Size">
              <button type="button" aria-pressed={!size} onClick={() => setSize('')}>
                All sizes
              </button>
              {sizes.map((s) => (
                <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(size === s ? '' : s)}>
                  {s} mm²
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="sub">No products sold{type || size ? ' with these filters' : ' in this period'}.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Size</th>
                <th>Cores</th>
                <th>Type</th>
                <th className="num">Quantity</th>
                <th className="num">Revenue</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.item_id}>
                  <td className="wrap">{p.invoice_name}</td>
                  <td>{p.size_mm2 ? `${p.size_mm2} mm²` : '—'}</td>
                  <td>{p.cores ?? '—'}</td>
                  <td>{p.cable_type ?? '—'}</td>
                  <td className="num mono">{formatQty(p.quantity, p.base_unit)}</td>
                  <td className="num mono">{formatMoney(p.revenue)}</td>
                  <td className="num mono">{total ? `${Math.round((p.revenue / total) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AnalyticsPage;

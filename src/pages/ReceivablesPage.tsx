import { Fragment, useMemo, useState } from 'react';
import { listOpenInvoices, type OpenInvoiceRow } from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { downloadCsv } from '../csv';
import { csvMoney, formatDate, formatMoney, round2 } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';

const BUCKETS = [
  { key: 'current', label: 'Not due yet' },
  { key: 'd30', label: '0–30 days' },
  { key: 'd60', label: '31–60 days' },
  { key: 'd90', label: '61–90 days' },
  { key: 'd90plus', label: '90+ days' },
] as const;
type BucketKey = (typeof BUCKETS)[number]['key'];

/** Which aging bucket an open invoice falls in, by days overdue on the "as of" date. */
function bucketOf(r: OpenInvoiceRow): BucketKey {
  const d = r.days_overdue;
  if (d <= 0) return 'current';
  if (d <= 30) return 'd30';
  if (d <= 60) return 'd60';
  if (d <= 90) return 'd90';
  return 'd90plus';
}

type Totals = Record<BucketKey, number> & { total: number };
const zero = (): Totals => ({ current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 });

interface CustomerGroup {
  customerId: string;
  name: string;
  invoices: OpenInvoiceRow[];
  totals: Totals;
}

/** Open credit invoices grouped by customer, aged by days overdue. Buckets always add up to the open total. */
function ReceivablesPage({ session }: { session: Session }) {
  const [asOf, setAsOf] = useState(session.today);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { data, error, loading } = useAsync(() => listOpenInvoices(null, asOf), [asOf]);

  const { groups, grand } = useMemo(() => {
    const map = new Map<string, CustomerGroup>();
    const g = zero();
    for (const r of data ?? []) {
      const key = r.customer_id;
      let grp = map.get(key);
      if (!grp) {
        grp = { customerId: key, name: r.customer_name ?? '—', invoices: [], totals: zero() };
        map.set(key, grp);
      }
      const b = bucketOf(r);
      grp.invoices.push(r);
      grp.totals[b] = round2(grp.totals[b] + r.balance);
      grp.totals.total = round2(grp.totals.total + r.balance);
      g[b] = round2(g[b] + r.balance);
      g.total = round2(g.total + r.balance);
    }
    // Most overdue money first, then the biggest balances.
    const list = [...map.values()].sort(
      (a, b) => b.totals.d90plus + b.totals.d90 + b.totals.d60 + b.totals.d30 - (a.totals.d90plus + a.totals.d90 + a.totals.d60 + a.totals.d30) || b.totals.total - a.totals.total,
    );
    return { groups: list, grand: g };
  }, [data]);

  const exportCsv = () =>
    downloadCsv(
      `receivables-as-of-${asOf}.csv`,
      ['Customer', 'Invoice', 'Invoice date', 'Due date', 'Days overdue', 'Bucket', 'Total', 'Paid', 'Returned', 'Cheques pending', 'Balance'],
      groups.flatMap((g) =>
        g.invoices.map((r) => [
          g.name,
          r.invoice_no,
          r.invoice_date,
          r.due_date,
          r.days_overdue,
          BUCKETS.find((b) => b.key === bucketOf(r))?.label ?? '',
          csvMoney(r.total),
          csvMoney(r.paid),
          csvMoney(r.credited),
          csvMoney(r.pending),
          csvMoney(r.balance),
        ]),
      ),
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Receivables</h1>
          <p className="page-sub">What customers owe on credit invoices, by how late it is. Cheques count only once cleared.</p>
        </div>
        <div className="form-actions">
          <label className="checkbox">
            As of
            <input type="date" className="cell-input" value={asOf} max={session.today} onChange={(e) => setAsOf(e.target.value || session.today)} />
          </label>
          {session.can('export_data') && (
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={groups.length === 0}>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {loading && !data ? (
        <Loading />
      ) : groups.length === 0 ? (
        <div className="card">
          <Empty>Nothing owed as of {formatDate(asOf)}.</Empty>
        </div>
      ) : (
        <>
          <div className="facts">
            <div className="fact">
              <div className="fact-label">Total owed</div>
              <div className="fact-value">{formatMoney(grand.total)}</div>
            </div>
            {BUCKETS.map((b) => (
              <div className="fact" key={b.key}>
                <div className="fact-label">{b.label}</div>
                <div className={`fact-value${b.key !== 'current' && grand[b.key] > 0 ? ' amber' : ''}`}>{formatMoney(grand[b.key])}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    {BUCKETS.map((b) => (
                      <th key={b.key} className="num">
                        {b.label}
                      </th>
                    ))}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.customerId}>
                      <tr className="clickable" onClick={() => setOpen((o) => ({ ...o, [g.customerId]: !o[g.customerId] }))}>
                        <td>
                          <button type="button" className="link-btn" aria-expanded={Boolean(open[g.customerId])}>
                            {open[g.customerId] ? '▾' : '▸'} {g.name}
                          </button>
                          <span className="sub"> · {g.invoices.length} invoice{g.invoices.length === 1 ? '' : 's'}</span>
                        </td>
                        {BUCKETS.map((b) => (
                          <td key={b.key} className={`num mono${b.key !== 'current' && g.totals[b.key] > 0 ? ' amber' : ''}`}>
                            {g.totals[b.key] ? formatMoney(g.totals[b.key]) : '—'}
                          </td>
                        ))}
                        <td className="num mono">
                          <strong>{formatMoney(g.totals.total)}</strong>
                        </td>
                      </tr>
                      {open[g.customerId] &&
                        g.invoices.map((r) => (
                          <tr key={r.invoice_id} className="sub-row">
                            <td>
                              <a className="mono" href={href(`invoices/${r.invoice_id}`)}>
                                {r.invoice_no}
                              </a>
                              <span className="sub">
                                {' '}
                                · due {formatDate(r.due_date)}
                                {r.days_overdue > 0 ? ` · ${r.days_overdue} days late` : ''}
                                {r.pending > 0 ? ` · cheque pending ${formatMoney(r.pending)}` : ''}
                              </span>
                            </td>
                            {BUCKETS.map((b) => (
                              <td key={b.key} className="num mono">
                                {bucketOf(r) === b.key ? formatMoney(r.balance) : ''}
                              </td>
                            ))}
                            <td className="num mono">{formatMoney(r.balance)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                  <tr className="total-row">
                    <td>
                      <strong>All customers</strong>
                    </td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="num mono">
                        <strong>{formatMoney(grand[b.key])}</strong>
                      </td>
                    ))}
                    <td className="num mono">
                      <strong>{formatMoney(grand.total)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="table-note">
              Days late are counted from the due date to {formatDate(asOf)}. Click a customer to see the invoices.
            </p>
          </div>
        </>
      )}
    </>
  );
}

export default ReceivablesPage;

import { useState } from 'react';
import { listInvoices, type InvoiceFilters, type InvoiceRow } from '../api';
import { Banner, Empty, Loading, LocationSelect, StatusTag } from '../components/Common';
import { downloadCsv } from '../csv';
import { toSalesError } from '../errors';
import { csvMoney, daysAgo, formatDate, formatMoney, STATUS_LABELS } from '../format';
import { storageGet, storageSet, useAsync, useDebounced } from '../hooks';
import { go, href } from '../router';
import type { Session } from '../session';

const PAGE = 200;
const FILTER_KEY = 'sales:invoiceFilters';

interface Filters {
  from: string;
  to: string;
  locationId: string;
  paymentType: string;
  status: string;
  search: string;
}

function initialFilters(today: string): Filters {
  const base: Filters = { from: daysAgo(30), to: today, locationId: '', paymentType: '', status: '', search: '' };
  try {
    const saved = JSON.parse(storageGet(FILTER_KEY) ?? 'null') as Partial<Filters> | null;
    // Dates always start at the last 30 days; the other choices are remembered on this computer.
    if (saved) return { ...base, locationId: saved.locationId ?? '', paymentType: saved.paymentType ?? '', status: saved.status ?? '' };
  } catch {
    // ignore a broken saved value
  }
  return base;
}

/** Invoices the person may see (own or all; the server decides), newest first, 200 at a time. */
function InvoicesPage({ session }: { session: Session }) {
  const [f, setF] = useState<Filters>(() => initialFilters(session.today));
  const search = useDebounced(f.search, 300);
  const query: InvoiceFilters = {
    from: f.from,
    to: f.to,
    locationId: f.locationId,
    paymentType: f.paymentType,
    status: f.status,
    search,
  };
  const key = JSON.stringify(query);
  const first = useAsync(() => listInvoices({ ...query, limit: PAGE, offset: 0 }), [key]);
  const [extra, setExtra] = useState<{ key: string; rows: InvoiceRow[]; done: boolean }>({ key: '', rows: [], done: false });
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const more = extra.key === key ? extra : { key, rows: [], done: false };
  const rows = [...(first.data ?? []), ...more.rows];
  const hasMore = (first.data?.length ?? 0) === PAGE && !more.done;

  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    storageSet(FILTER_KEY, JSON.stringify({ locationId: next.locationId, paymentType: next.paymentType, status: next.status }));
  };

  const loadMore = async () => {
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await listInvoices({ ...query, limit: PAGE, offset: rows.length });
      setExtra({ key, rows: [...more.rows, ...page], done: page.length < PAGE });
    } catch (e) {
      setMoreError(toSalesError(e).message);
    } finally {
      setMoreBusy(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `invoices-${f.from}-to-${f.to}.csv`,
      ['Invoice', 'Date', 'Due', 'Location', 'Customer', 'Type', 'Total', 'Paid', 'Pending cheques', 'Returned', 'Balance', 'Status', 'Made by'],
      rows.map((r) => [
        r.invoice_no,
        r.invoice_date,
        r.due_date ?? '',
        r.location_name ?? '',
        r.customer_name ?? '',
        r.payment_type,
        csvMoney(r.total),
        csvMoney(r.paid),
        csvMoney(r.pending),
        csvMoney(r.credited),
        csvMoney(r.balance),
        STATUS_LABELS[r.status] ?? r.status,
        r.created_by_name ?? '',
      ]),
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">
            {session.can('view_all_sales') ? 'Every invoice at every location.' : 'The invoices you made.'} Open one to print, return or
            cancel it.
          </p>
        </div>
        <div className="form-actions">
          {session.can('export_data') && (
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </button>
          )}
          {session.can('create_sale') && (
            <a className="btn btn-primary" href={href('new-sale')}>
              New sale
            </a>
          )}
        </div>
      </div>
      <div className="card">
        <div className="filters">
          <input type="date" value={f.from} max={f.to} onChange={(e) => set({ from: e.target.value })} aria-label="From date" />
          <input type="date" value={f.to} max={session.today} onChange={(e) => set({ to: e.target.value })} aria-label="To date" />
          <LocationSelect
            locations={session.locations}
            value={f.locationId}
            onChange={(id) => set({ locationId: id })}
            placeholder="All locations"
            ariaLabel="Location"
          />
          <select value={f.paymentType} onChange={(e) => set({ paymentType: e.target.value })} aria-label="Cash or credit">
            <option value="">Cash and credit</option>
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
          <select value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            <option value="open">Open (not fully paid)</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            className="grow"
            type="search"
            placeholder="Invoice number, customer or phone"
            value={f.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-label="Search"
          />
        </div>
        {first.error && <Banner kind="error">{first.error}</Banner>}
        {first.loading && !first.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No invoices match these filters.</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th className="num">Total</th>
                    <th className="num">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.invoice_id} className="clickable" onClick={() => go(`invoices/${r.invoice_id}`)}>
                      <td className="mono">
                        <a href={href(`invoices/${r.invoice_id}`)} onClick={(e) => e.stopPropagation()}>
                          {r.invoice_no}
                        </a>
                      </td>
                      <td className="mono">{formatDate(r.invoice_date)}</td>
                      <td>{r.location_name}</td>
                      <td>{r.customer_name ?? '—'}</td>
                      <td>{r.payment_type === 'credit' ? 'Credit' : 'Cash'}</td>
                      <td className="mono num">{formatMoney(r.total)}</td>
                      <td className="mono num">{r.payment_type === 'credit' && r.status !== 'cancelled' ? formatMoney(r.balance) : '—'}</td>
                      <td>
                        <StatusTag status={r.status} />
                        {r.status === 'overdue' && <span className="sub"> {r.days_overdue} days</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-note">
              {rows.length} invoice{rows.length === 1 ? '' : 's'} shown · total {formatMoney(rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.total, 0))}{' '}
              (cancelled not counted)
            </p>
            {moreError && <Banner kind="error">{moreError}</Banner>}
            {hasMore && (
              <div className="load-more">
                <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={moreBusy}>
                  {moreBusy ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default InvoicesPage;

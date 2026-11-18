import { useState } from 'react';
import { listCreditNotes } from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { downloadCsv } from '../csv';
import { csvMoney, daysAgo, formatDate, formatMoney, SETTLEMENT_LABELS } from '../format';
import { useAsync, useDebounced } from '../hooks';
import { go, href } from '../router';
import { locationName, type Session } from '../session';

/** Credit notes (returns) the person may see, newest first. */
function ReturnsPage({ session }: { session: Session }) {
  const [from, setFrom] = useState(daysAgo(60));
  const [to, setTo] = useState(session.today);
  const [search, setSearch] = useState('');
  const settled = useDebounced(search, 300);
  const { data, error, loading } = useAsync(() => listCreditNotes({ from, to, search: settled }), [from, to, settled]);
  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Returns</h1>
          <p className="page-sub">
            Goods taken back from customers. To accept a return, open the invoice and press <strong>Return</strong>.
          </p>
        </div>
        <div className="form-actions">
          {session.can('export_data') && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  `returns-${from}-to-${to}.csv`,
                  ['Credit note', 'Date', 'Invoice', 'Customer', 'Location', 'Settlement', 'Value', 'Reason'],
                  rows.map((c) => [
                    c.credit_note_no,
                    c.credit_date,
                    c.invoices?.invoice_no ?? '',
                    c.customer_name ?? '',
                    locationName(session, c.location_id),
                    SETTLEMENT_LABELS[c.settlement] ?? c.settlement,
                    csvMoney(c.total),
                    c.reason,
                  ]),
                )
              }
            >
              Export CSV
            </button>
          )}
          <a className="btn btn-secondary" href={href('invoices')}>
            Find the invoice
          </a>
        </div>
      </div>
      <div className="card">
        <div className="filters">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={to} max={session.today} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <input
            className="grow"
            type="search"
            placeholder="Credit note number, customer or reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No returns in this range.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Credit note</th>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Settlement</th>
                  <th className="num">Value</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => go(`credit-notes/${c.id}`)}>
                    <td className="mono">
                      <a href={href(`credit-notes/${c.id}`)} onClick={(e) => e.stopPropagation()}>
                        {c.credit_note_no}
                      </a>
                    </td>
                    <td className="mono">{formatDate(c.credit_date)}</td>
                    <td className="mono">
                      {c.invoices ? (
                        <a href={href(`invoices/${c.invoice_id}`)} onClick={(e) => e.stopPropagation()}>
                          {c.invoices.invoice_no}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{c.customer_name ?? 'Walk-in'}</td>
                    <td>{SETTLEMENT_LABELS[c.settlement] ?? c.settlement}</td>
                    <td className="num mono">{formatMoney(c.total)}</td>
                    <td className="wrap">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default ReturnsPage;

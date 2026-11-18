import { useState } from 'react';
import { listPayments } from '../api';
import { Banner, Empty, Loading, StatusTag } from '../components/Common';
import { downloadCsv } from '../csv';
import { csvMoney, daysAgo, formatDate, formatMoney, METHOD_LABELS, STATUS_LABELS } from '../format';
import { useAsync, useDebounced } from '../hooks';
import { go, href } from '../router';
import { locationName, type Session } from '../session';

/** Payments the person may see (all, people who clear cheques, or own), newest first. */
function PaymentsPage({ session }: { session: Session }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(session.today);
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const settled = useDebounced(search, 300);
  const { data, error, loading } = useAsync(
    () => listPayments({ from, to, method, status, search: settled }),
    [from, to, method, status, settled],
  );
  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-sub">Money received from customers. Cheques count only once cleared.</p>
        </div>
        <div className="form-actions">
          {session.can('export_data') && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  `payments-${from}-to-${to}.csv`,
                  ['Payment', 'Date', 'Customer', 'Method', 'Cheque', 'Amount', 'Status', 'Received at'],
                  rows.map((p) => [
                    p.payment_no,
                    p.payment_date,
                    p.customer_name,
                    METHOD_LABELS[p.method],
                    p.cheque_no ?? '',
                    csvMoney(p.amount),
                    STATUS_LABELS[p.status] ?? p.status,
                    p.location_id ? locationName(session, p.location_id) : '',
                  ]),
                )
              }
            >
              Export CSV
            </button>
          )}
          {session.can('record_payment') && (
            <a className="btn btn-primary" href={href('payments/new')}>
              Record payment
            </a>
          )}
        </div>
      </div>
      <div className="card">
        <div className="filters">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={to} max={session.today} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="online">Online</option>
            <option value="cheque">Cheque</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="cleared">Cleared</option>
            <option value="pending">Pending</option>
            <option value="bounced">Bounced</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            className="grow"
            type="search"
            placeholder="Customer, payment or cheque number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No payments match these filters.</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => go(`payments/${p.id}`)}>
                      <td className="mono">
                        <a href={href(`payments/${p.id}`)} onClick={(e) => e.stopPropagation()}>
                          {p.payment_no}
                        </a>
                      </td>
                      <td className="mono">{formatDate(p.payment_date)}</td>
                      <td>{p.customer_name}</td>
                      <td>
                        {METHOD_LABELS[p.method]}
                        {p.cheque_no && <span className="sub"> {p.cheque_no}</span>}
                      </td>
                      <td className="num mono">{formatMoney(p.amount)}</td>
                      <td>
                        <StatusTag status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-note">
              {rows.length} payment{rows.length === 1 ? '' : 's'} · cleared{' '}
              {formatMoney(rows.filter((p) => p.status === 'cleared').reduce((s, p) => s + p.amount, 0))} · pending{' '}
              {formatMoney(rows.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0))}
              {rows.length === 500 ? ' · showing the newest 500; narrow the dates to see more' : ''}
            </p>
          </>
        )}
      </div>
    </>
  );
}

export default PaymentsPage;

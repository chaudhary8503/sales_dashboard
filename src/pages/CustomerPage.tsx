import { useState } from 'react';
import { getCustomerOverview, type CustomerOverview } from '../api';
import { AllocateDialog, RefundDialog } from '../components/AdvanceDialogs';
import { Banner, Fact, Loading, StatusTag } from '../components/Common';
import { formatDate, formatMoney, METHOD_LABELS, SETTLEMENT_LABELS } from '../format';
import { useAsync } from '../hooks';
import { go, href } from '../router';
import type { Session } from '../session';

type Advance = CustomerOverview['advances'][number];

const DOC_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  sale_order: 'Sale order',
  payment: 'Payment',
  credit_note: 'Return',
  refund: 'Refund',
};

/** One customer: totals, balance, open invoices, advances, orders, cheques and recent history. */
function CustomerPage({ session, customerId }: { session: Session; customerId: string }) {
  const { data: o, error, loading, reload } = useAsync(() => getCustomerOverview(customerId), [customerId]);
  const [dialog, setDialog] = useState<{ kind: 'allocate' | 'refund'; advance: Advance } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (loading && !o) return <Loading />;
  if (error || !o) return <Banner kind="error">{error ?? 'Customer not found.'}</Banner>;

  const c = o.customer;
  const seeBalances = session.can('view_customer_balances') || session.can('view_customer_invoices');
  const canPay = session.can('record_payment');
  const blocked = c.blocked;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {c.name} {c.customer_code && <span className="mono sub">{c.customer_code}</span>}
          </h1>
          <p className="page-sub">{[c.business_name, c.phone, c.city].filter(Boolean).join(' · ') || 'No phone or city on file.'}</p>
        </div>
        <div className="detail-actions">
          {session.can('create_sale') && !blocked && (
            <a className="btn btn-primary" href={href('new-sale', { customer: c.customer_id })}>
              New sale
            </a>
          )}
          {session.can('create_sale_order') && !blocked && (
            <a className="btn btn-secondary" href={href('orders/new', { customer: c.customer_id })}>
              New order
            </a>
          )}
          {canPay && (
            <a className="btn btn-secondary" href={href('payments/new', { customer: c.customer_id })}>
              Record payment
            </a>
          )}
          <a className="btn btn-secondary" href={href('customers')}>
            Look up another
          </a>
        </div>
      </div>

      {blocked && (
        <Banner kind="warn">Blocked{c.block_reason ? `: ${c.block_reason}` : ''}. No sales or orders until the owner unblocks them.</Banner>
      )}
      <Banner kind="ok">{done}</Banner>

      <div className="facts">
        <Fact label="Bought for cash">{formatMoney(o.totals.cash_total)}</Fact>
        <Fact label="Bought on credit">{formatMoney(o.totals.credit_total)}</Fact>
        <Fact label="Last purchase">{formatDate(o.totals.last_purchase_date)}</Fact>
        {seeBalances && (
          <>
            <Fact label="Outstanding">{formatMoney(o.balance.outstanding)}</Fact>
            <Fact label="Overdue">
              <span className={o.balance.overdue > 0 ? 'amber' : undefined}>{formatMoney(o.balance.overdue)}</span>
            </Fact>
            <Fact label="Cheques pending">{formatMoney(o.balance.pending_cheques)}</Fact>
          </>
        )}
        {c.payment_terms_days !== null && <Fact label="Credit days">{c.payment_terms_days}</Fact>}
      </div>

      <div className="stack">
        {seeBalances && (
          <div className="card">
            <div className="section-title">Open invoices</div>
            {o.open_invoices.length === 0 ? (
              <p className="sub">Nothing owed.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Due</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Pending</th>
                      <th className="num">Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.open_invoices.map((i) => (
                      <tr key={i.invoice_id} className="clickable" onClick={() => go(`invoices/${i.invoice_id}`)}>
                        <td className="mono">
                          <a href={href(`invoices/${i.invoice_id}`)} onClick={(e) => e.stopPropagation()}>
                            {i.invoice_no}
                          </a>
                        </td>
                        <td className="mono">{formatDate(i.invoice_date)}</td>
                        <td className="mono">{formatDate(i.due_date)}</td>
                        <td className="num mono">{formatMoney(i.total)}</td>
                        <td className="num mono">{formatMoney(i.paid + i.credited)}</td>
                        <td className="num mono">{i.pending > 0 ? formatMoney(i.pending) : '—'}</td>
                        <td className="num mono">{formatMoney(i.balance)}</td>
                        <td>
                          <StatusTag status={i.status} />
                          {i.days_overdue > 0 && <span className="sub"> {i.days_overdue} days</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="split">
          <div className="card">
            <div className="section-title">Advances (unused money)</div>
            {o.advances.length === 0 ? (
              <p className="sub">No unused advance.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th className="num">Unused</th>
                    {canPay && <th />}
                  </tr>
                </thead>
                <tbody>
                  {o.advances.map((a) => (
                    <tr key={a.id}>
                      <td className="wrap">
                        <a className="mono" href={href(a.source_type === 'payment' ? `payments/${a.id}` : `credit-notes/${a.id}`)}>
                          {a.number}
                        </a>
                        <div className="sub">
                          {a.source_type === 'payment' ? 'Payment' : 'Return'} · {formatDate(a.date)}
                          {a.status === 'pending' ? ' · cheque pending' : ''}
                          {a.sale_order_id ? ' · for a sale order' : ''}
                        </div>
                      </td>
                      <td className="num mono">{formatMoney(a.available)}</td>
                      {canPay && (
                        <td className="num">
                          <div className="detail-actions advance-actions">
                            <button type="button" className="btn btn-secondary btn-small" onClick={() => setDialog({ kind: 'allocate', advance: a })}>
                              Use against invoices
                            </button>
                            {(a.source_type === 'credit_note' || a.status === 'cleared') && (
                              <button type="button" className="btn btn-secondary btn-small" onClick={() => setDialog({ kind: 'refund', advance: a })}>
                                Pay back
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="stack">
            <div className="card">
              <div className="section-title">Open orders</div>
              {o.open_sale_orders.length === 0 ? (
                <p className="sub">No open orders.</p>
              ) : (
                <ul className="plain-list">
                  {o.open_sale_orders.map((s) => (
                    <li key={s.id}>
                      <a className="mono" href={href(`orders/${s.id}`)}>
                        {s.number}
                      </a>{' '}
                      <StatusTag status={s.status} />
                      <div className="sub">
                        {formatDate(s.order_date)} · {formatMoney(s.total)}
                        {s.expected_date ? ` · expected ${formatDate(s.expected_date)}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card">
              <div className="section-title">Cheques pending</div>
              {o.pending_cheques.length === 0 ? (
                <p className="sub">None.</p>
              ) : (
                <ul className="plain-list">
                  {o.pending_cheques.map((p) => (
                    <li key={p.id}>
                      <a className="mono" href={href(`payments/${p.id}`)}>
                        {p.number}
                      </a>{' '}
                      {formatMoney(p.amount)}
                      <div className="sub">
                        Cheque {p.cheque_no}
                        {p.cheque_bank ? ` · ${p.cheque_bank}` : ''} · dated {formatDate(p.cheque_date)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Recent history</div>
          {o.recent.length === 0 ? (
            <p className="sub">Nothing yet.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Date</th>
                    <th>Kind</th>
                    <th>Location</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {o.recent.map((r) => (
                    <tr key={`${r.doc_type}-${r.doc_id}`} className="clickable" onClick={() => (window.location.hash = r.link_path)}>
                      <td className="mono">
                        <a href={r.link_path} onClick={(e) => e.stopPropagation()}>
                          {r.doc_number}
                        </a>
                      </td>
                      <td className="mono">{formatDate(r.doc_date)}</td>
                      <td>
                        {DOC_LABELS[r.doc_type] ?? r.doc_type}
                        {r.payment_type ? (
                          <span className="sub">
                            {' '}
                            · {r.doc_type === 'credit_note' ? SETTLEMENT_LABELS[r.payment_type] ?? r.payment_type : METHOD_LABELS[r.payment_type] ?? r.payment_type}
                          </span>
                        ) : null}
                      </td>
                      <td>{r.location_name ?? '—'}</td>
                      <td className="num mono">{formatMoney(r.total_amount)}</td>
                      <td>
                        <StatusTag status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {dialog?.kind === 'allocate' && (
        <AllocateDialog
          session={session}
          customerId={c.customer_id}
          source={dialog.advance.source_type === 'payment' ? { paymentId: dialog.advance.id } : { creditNoteId: dialog.advance.id }}
          label={dialog.advance.number}
          available={dialog.advance.available}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setDone(m);
            reload();
          }}
        />
      )}
      {dialog?.kind === 'refund' && (
        <RefundDialog
          session={session}
          customerId={c.customer_id}
          source={dialog.advance.source_type === 'payment' ? { paymentId: dialog.advance.id } : { creditNoteId: dialog.advance.id }}
          label={dialog.advance.number}
          available={dialog.advance.available}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            go(`refunds/${r.id}`);
          }}
        />
      )}
    </>
  );
}

export default CustomerPage;

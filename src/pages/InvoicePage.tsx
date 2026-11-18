import { useState } from 'react';
import { cancelInvoice, getDocument, type InvoiceDoc } from '../api';
import { Banner, ConfirmWithReason, Fact, Loading, StatusTag } from '../components/Common';
import { formatDate, formatDateTime, formatMoney, formatQty, METHOD_LABELS, SETTLEMENT_LABELS } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';
import { bundleSummary, qtyText, rateText } from '../print/docText';

/** One invoice: lines with bundles and returns, balance, payments, returns, delivery; print, return, pay, cancel. */
function InvoicePage({ session, invoiceId }: { session: Session; invoiceId: string }) {
  const { data: inv, error, loading, reload } = useAsync(() => getDocument('invoice', invoiceId), [invoiceId]);
  const [cancelling, setCancelling] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (loading && !inv) return <Loading />;
  if (error || !inv) return <Banner kind="error">{error ?? 'Invoice not found.'}</Banner>;

  const posted = inv.status === 'posted';
  const credit = inv.payment_type === 'credit';
  const balance = inv.balance;
  const canReturn = posted && inv.source === 'system' && session.can('issue_credit_note');
  const canPay = posted && credit && (balance?.balance ?? 0) > 0 && session.can('record_payment') && session.customersLive;
  const canCancel = posted && inv.source === 'system' && session.can('cancel_invoice');
  const customerLink =
    inv.customer_id &&
    session.customersLive &&
    (session.can('view_customer_invoices') || session.can('view_customer_balances') || session.can('view_all_sales') || session.can('record_payment'));
  const print = (format: string) => href(`invoices/${inv.id}/print`, { format });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Invoice <span className="mono">{inv.invoice_no}</span> <StatusTag status={posted ? (balance?.status ?? 'posted') : 'cancelled'} />
          </h1>
          <p className="page-sub">
            {credit ? 'Credit sale' : 'Cash sale'} · {formatDate(inv.invoice_date)} · {inv.location_name}
            {inv.created_by_name ? ` · made by ${inv.created_by_name}` : ''}
          </p>
        </div>
        <div className="detail-actions">
          <a className="btn btn-secondary" href={print('a4')}>
            Print A4
          </a>
          <a className="btn btn-secondary" href={print('a5')}>
            Print A5
          </a>
          <a className="btn btn-secondary" href={print('challan')}>
            Delivery challan
          </a>
          {canReturn && (
            <a className="btn btn-secondary" href={href('returns/new', { invoice: inv.id })}>
              Return
            </a>
          )}
          {canPay && (
            <a className="btn btn-primary" href={href('payments/new', { customer: inv.customer_id })}>
              Record payment
            </a>
          )}
          {canCancel && (
            <button type="button" className="btn btn-danger" onClick={() => setCancelling(true)}>
              Cancel invoice
            </button>
          )}
        </div>
      </div>

      <Banner kind="ok">{done}</Banner>
      {!posted && (
        <Banner kind="warn">
          Cancelled {formatDateTime(inv.cancelled_at)}
          {inv.cancelled_by_name ? ` by ${inv.cancelled_by_name}` : ''}: {inv.cancel_reason}
        </Banner>
      )}

      <div className="facts">
        <Fact label="Customer">
          {inv.customer_id ? (
            customerLink ? (
              <a href={href(`customers/${inv.customer_id}`)}>{inv.customer_name}</a>
            ) : (
              inv.customer_name
            )
          ) : (
            inv.walk_in_name || 'Walk-in customer'
          )}
        </Fact>
        <Fact label="Total">{formatMoney(inv.total)}</Fact>
        {credit ? (
          <>
            <Fact label="Balance">{formatMoney(balance?.balance ?? 0)}</Fact>
            <Fact label="Due">
              {formatDate(inv.due_date)}
              {balance && balance.days_overdue > 0 ? ` (${balance.days_overdue} days late)` : ''}
            </Fact>
          </>
        ) : (
          <Fact label="Paid by">{METHOD_LABELS[inv.cash_paid_via ?? 'cash']}</Fact>
        )}
      </div>

      <div className="split">
        <div className="stack">
          <div className="card">
            <div className="section-title">Items</div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item</th>
                    <th className="num">Quantity</th>
                    <th className="num">Rate</th>
                    <th className="num">Discount</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.line_no}</td>
                      <td className="wrap">
                        <div>{l.invoice_name}</div>
                        {l.item_name !== l.invoice_name && <div className="sub">{l.item_name}</div>}
                        {l.bundles.length > 0 && <div className="sub">Bundles: {bundleSummary(l.bundles)}</div>}
                        {l.source_location_id !== inv.sale_location_id && (
                          <div className="sub">Supplied from {l.source_location_name}</div>
                        )}
                        {l.returned_base_qty > 0 && (
                          <div className="sub amber">Returned: {formatQty(l.returned_base_qty, l.base_unit)}</div>
                        )}
                      </td>
                      <td className="num">{qtyText(l)}</td>
                      <td className="num mono">{rateText(l.rate, l.entered_unit)}</td>
                      <td className="num mono">
                        {l.discount_amount > 0 ? (l.discount_type === 'percent' ? `${l.discount_value}%` : formatMoney(l.discount_amount)) : '—'}
                      </td>
                      <td className="num mono">{formatMoney(l.gross_amount - l.discount_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals totals-gap">
              <span className="total-label">Subtotal</span>
              <span className="total-value">{formatMoney(inv.subtotal)}</span>
              {inv.line_discount_total > 0 && (
                <>
                  <span className="total-label">Line discounts</span>
                  <span className="total-value">− {formatMoney(inv.line_discount_total)}</span>
                </>
              )}
              {inv.invoice_discount_amount > 0 && (
                <>
                  <span className="total-label">Invoice discount</span>
                  <span className="total-value">− {formatMoney(inv.invoice_discount_amount)}</span>
                </>
              )}
              {inv.tax_total > 0 && (
                <>
                  <span className="total-label">Sales tax</span>
                  <span className="total-value">{formatMoney(inv.tax_total)}</span>
                </>
              )}
              <span className="total-label grand">Total</span>
              <span className="total-value grand">{formatMoney(inv.total)}</span>
            </div>
            {inv.note && <p className="table-note">Note: {inv.note}</p>}
          </div>

          <PaymentsAndReturns inv={inv} />
        </div>

        <div className="stack">
          <div className="card">
            <div className="section-title">Balance</div>
            {credit ? (
              <dl className="kv">
                <dt>Total</dt>
                <dd className="mono">{formatMoney(inv.total)}</dd>
                <dt>Paid (cleared)</dt>
                <dd className="mono">{formatMoney(balance?.paid ?? 0)}</dd>
                <dt>Cheques pending</dt>
                <dd className="mono">{formatMoney(balance?.pending ?? 0)}</dd>
                <dt>Returned</dt>
                <dd className="mono">{formatMoney(balance?.credited ?? 0)}</dd>
                <dt>
                  <strong>Balance</strong>
                </dt>
                <dd className="mono">
                  <strong>{formatMoney(balance?.balance ?? 0)}</strong>
                </dd>
              </dl>
            ) : (
              <p className="sub">
                Cash sale, paid in full by {METHOD_LABELS[inv.cash_paid_via ?? 'cash'].toLowerCase()}
                {inv.cash_reference ? ` (ref. ${inv.cash_reference})` : ''}.
              </p>
            )}
            {credit && (balance?.pending ?? 0) > 0 && <p className="table-note">A cheque counts only when it is cleared.</p>}
          </div>

          <div className="card">
            <div className="section-title">Details</div>
            <dl className="kv">
              {inv.customer_id ? (
                <>
                  <dt>Customer</dt>
                  <dd>
                    {inv.customer_name}
                    {inv.customer_code ? ` (${inv.customer_code})` : ''}
                  </dd>
                  {inv.customer_phone && (
                    <>
                      <dt>Phone</dt>
                      <dd>{inv.customer_phone}</dd>
                    </>
                  )}
                </>
              ) : (
                <>
                  <dt>Walk-in</dt>
                  <dd>{inv.walk_in_name || '—'}</dd>
                  <dt>Phone</dt>
                  <dd>{inv.walk_in_phone || '—'}</dd>
                </>
              )}
              {inv.sale_order_id && (
                <>
                  <dt>Sale order</dt>
                  <dd>
                    <a href={href(`orders/${inv.sale_order_id}`)}>{inv.sale_order_no}</a>
                  </dd>
                </>
              )}
              {credit && (
                <>
                  <dt>Credit days</dt>
                  <dd>{inv.credit_days}</dd>
                </>
              )}
              <dt>Vehicle</dt>
              <dd>{inv.delivery?.vehicle_no || '—'}</dd>
              <dt>Driver</dt>
              <dd>{inv.delivery?.driver_name || '—'}</dd>
              {inv.delivery?.note && (
                <>
                  <dt>Delivery note</dt>
                  <dd>{inv.delivery.note}</dd>
                </>
              )}
              <dt>Entered</dt>
              <dd>{formatDateTime(inv.created_at)}</dd>
            </dl>
          </div>
        </div>
      </div>

      {cancelling && (
        <ConfirmWithReason
          title={`Cancel invoice ${inv.invoice_no}?`}
          explain={
            <>
              The whole invoice is cancelled. Every item goes back into stock where it was taken from (cable back onto its bundles). The
              number stays, marked cancelled. An invoice with payments or returns can't be cancelled.
              {inv.sale_order_id && ' Any advance used from the sale order goes back to the order.'}
            </>
          }
          confirmLabel="Cancel the invoice"
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            await cancelInvoice(inv.id, reason);
            setCancelling(false);
            setDone(`Invoice ${inv.invoice_no} is cancelled and the stock is back.`);
            reload();
          }}
        />
      )}
    </>
  );
}

function PaymentsAndReturns({ inv }: { inv: InvoiceDoc }) {
  if (inv.allocations.length === 0 && inv.credit_notes.length === 0) return null;
  return (
    <div className="card">
      {inv.allocations.length > 0 && (
        <>
          <div className="section-title">Payments against this invoice</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inv.allocations.map((a, i) => (
                  <tr key={`${a.source_id}-${i}`}>
                    <td className="mono">
                      <a href={href(a.source_type === 'payment' ? `payments/${a.source_id}` : `credit-notes/${a.source_id}`)}>{a.source_number}</a>
                    </td>
                    <td className="mono">{formatDate(a.date)}</td>
                    <td>
                      {a.source_type === 'credit_note' ? 'Return' : METHOD_LABELS[a.method ?? ''] ?? a.method}
                      {a.cheque_no ? ` ${a.cheque_no}` : ''}
                    </td>
                    <td className="num mono">{formatMoney(a.amount)}</td>
                    <td>
                      {a.released ? (
                        <span className="tag muted">Released{a.released_reason ? `: ${a.released_reason}` : ''}</span>
                      ) : a.source_type === 'payment' ? (
                        <StatusTag status={a.status} />
                      ) : (
                        <span className="tag ok">Applied</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {inv.credit_notes.length > 0 && (
        <>
          <div className="section-title section-gap">Returns</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Credit note</th>
                  <th>Date</th>
                  <th>Settlement</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {inv.credit_notes.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">
                      <a href={href(`credit-notes/${c.id}`)}>{c.number}</a>
                    </td>
                    <td className="mono">{formatDate(c.date)}</td>
                    <td>{SETTLEMENT_LABELS[c.settlement] ?? c.settlement}</td>
                    <td className="num mono">{formatMoney(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default InvoicePage;

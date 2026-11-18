import { useState } from 'react';
import { cancelSaleOrder, closeSaleOrder, getDocument } from '../api';
import { Banner, ConfirmWithReason, Fact, Loading, StatusTag } from '../components/Common';
import { formatDate, formatDateTime, formatMoney, formatQty, METHOD_LABELS, round2 } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';
import { qtyText, rateText } from '../print/docText';

/** One sale order: ordered vs delivered, deliveries, advances; deliver, print, close, cancel. */
function SaleOrderPage({ session, orderId }: { session: Session; orderId: string }) {
  const { data: so, error, loading, reload } = useAsync(() => getDocument('sale_order', orderId), [orderId]);
  const [dialog, setDialog] = useState<'close' | 'cancel' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (loading && !so) return <Loading />;
  if (error || !so) return <Banner kind="error">{error ?? 'Sale order not found.'}</Banner>;

  const open = so.status === 'open';
  const delivered = so.invoices.some((i) => i.status === 'posted');
  const activeAdvances = so.advances.filter((a) => a.status === 'cleared' || a.status === 'pending');
  const advanceTotal = round2(activeAdvances.reduce((s, a) => s + a.amount, 0));
  const advanceUnused = round2(activeAdvances.reduce((s, a) => s + a.available, 0));
  const canDeliver = open && session.can('create_sale') && session.can('create_sale_order');
  const canClose = open && session.can('close_sale_order');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Sale order <span className="mono">{so.sale_order_no}</span> <StatusTag status={so.progress.status} />
          </h1>
          <p className="page-sub">
            {so.customer_name} · {formatDate(so.order_date)} · {so.location_name}
            {so.created_by_name ? ` · taken by ${so.created_by_name}` : ''}
          </p>
        </div>
        <div className="detail-actions">
          {canDeliver && (
            <a className="btn btn-primary" href={href('new-sale', { order: so.id })}>
              Deliver
            </a>
          )}
          <a className="btn btn-secondary" href={href(`orders/${so.id}/print`)}>
            Print
          </a>
          {canClose && (
            <button type="button" className="btn btn-secondary" onClick={() => setDialog('close')}>
              Close order
            </button>
          )}
          {canClose && !delivered && (
            <button type="button" className="btn btn-danger" onClick={() => setDialog('cancel')}>
              Cancel order
            </button>
          )}
        </div>
      </div>

      <Banner kind="ok">{done}</Banner>
      {!open && (
        <Banner kind="info">
          {so.status === 'closed' ? 'Closed' : 'Cancelled'} {formatDateTime(so.closed_at)}: {so.closed_reason}
          {advanceUnused > 0 && ` The unused advance of ${formatMoney(advanceUnused)} stays with the customer.`}
        </Banner>
      )}

      <div className="facts">
        <Fact label="Order total">{formatMoney(so.total)}</Fact>
        <Fact label="Expected">{formatDate(so.expected_date)}</Fact>
        <Fact label="Advance received">{formatMoney(advanceTotal)}</Fact>
        <Fact label="Advance unused">{formatMoney(advanceUnused)}</Fact>
        <Fact label="Lines delivered">
          {so.progress.lines_delivered} of {so.progress.lines}
        </Fact>
      </div>

      <div className="stack">
        <div className="card">
          <div className="section-title">Ordered and delivered</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th className="num">Ordered</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                  <th className="num">Delivered</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {so.lines.map((l) => {
                  const share = l.base_qty > 0 ? l.delivered_base_qty / l.base_qty : 0;
                  return (
                    <tr key={l.id}>
                      <td>{l.line_no}</td>
                      <td className="wrap">
                        <div>{l.invoice_name}</div>
                        {l.item_name !== l.invoice_name && <div className="sub">{l.item_name}</div>}
                      </td>
                      <td className="num">{qtyText(l)}</td>
                      <td className="num mono">{rateText(l.rate, l.entered_unit)}</td>
                      <td className="num mono">{formatMoney(l.line_total)}</td>
                      <td className="num">{formatQty(l.delivered_base_qty, l.base_unit)}</td>
                      <td>
                        <div className={`progress${share > 1.0005 ? ' over' : ''}`} title={`${Math.round(share * 100)}%`}>
                          <div style={{ width: `${Math.min(share, 1) * 100}%` }} />
                        </div>
                        <span className="sub">
                          {Math.round(share * 100)}%{share > 1.0005 ? ' (more than ordered)' : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {so.note && <p className="table-note">Note: {so.note}</p>}
        </div>

        <div className="split">
          <div className="card">
            <div className="section-title">Deliveries</div>
            {so.invoices.length === 0 ? (
              <p className="sub">Nothing delivered yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {so.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="mono">
                        <a href={href(`invoices/${i.id}`)}>{i.number}</a>
                      </td>
                      <td className="mono">{formatDate(i.date)}</td>
                      <td className="num mono">{formatMoney(i.total)}</td>
                      <td>
                        <StatusTag status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <div className="section-title">Advances</div>
            {so.advances.length === 0 ? (
              <p className="sub">No advance taken.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th className="num">Amount</th>
                    <th className="num">Unused</th>
                  </tr>
                </thead>
                <tbody>
                  {so.advances.map((a) => (
                    <tr key={a.id}>
                      <td className="wrap">
                        <a className="mono" href={href(`payments/${a.id}`)}>
                          {a.number}
                        </a>
                        <div className="sub">
                          {formatDate(a.date)} · {METHOD_LABELS[a.method]} · <StatusTag status={a.status} />
                        </div>
                      </td>
                      <td className="num mono">{formatMoney(a.amount)}</td>
                      <td className="num mono">{formatMoney(a.available)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="table-note">The advance is used first on each delivery. Any advance left over stays with the customer.</p>
          </div>
        </div>
      </div>

      {dialog && (
        <ConfirmWithReason
          title={dialog === 'close' ? `Close sale order ${so.sale_order_no}?` : `Cancel sale order ${so.sale_order_no}?`}
          explain={
            dialog === 'close'
              ? 'No more deliveries can be made against this order. Deliveries already made stay as they are. Any unused advance stays with the customer.'
              : "The order is cancelled. An order that already has deliveries can't be cancelled; close it instead. Any advance stays with the customer."
          }
          confirmLabel={dialog === 'close' ? 'Close the order' : 'Cancel the order'}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            if (dialog === 'close') await closeSaleOrder(so.id, reason);
            else await cancelSaleOrder(so.id, reason);
            setDone(`Sale order ${so.sale_order_no} is ${dialog === 'close' ? 'closed' : 'cancelled'}.`);
            setDialog(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export default SaleOrderPage;

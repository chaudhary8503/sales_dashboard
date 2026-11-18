import { useState } from 'react';
import { getDocument } from '../api';
import { AllocateDialog, RefundDialog } from '../components/AdvanceDialogs';
import { Banner, Fact, Loading } from '../components/Common';
import { formatDate, formatDateTime, formatMoney, formatQty, METHOD_LABELS } from '../format';
import { useAsync } from '../hooks';
import { go, href } from '../router';
import type { Session } from '../session';
import { bundleSummary, qtyText, settlementText } from '../print/docText';

/** One credit note (return): lines, where the stock went, how it was settled. */
function CreditNotePage({ session, creditNoteId }: { session: Session; creditNoteId: string }) {
  const { data: cn, error, loading, reload } = useAsync(() => getDocument('credit_note', creditNoteId), [creditNoteId]);
  const [dialog, setDialog] = useState<'allocate' | 'refund' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (loading && !cn) return <Loading />;
  if (error || !cn) return <Banner kind="error">{error ?? 'Credit note not found.'}</Banner>;
  const canPay = session.can('record_payment') && session.customersLive && cn.customer_id && cn.available > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Credit note <span className="mono">{cn.credit_note_no}</span>
          </h1>
          <p className="page-sub">
            Return on <a href={href(`invoices/${cn.invoice_id}`)}>{cn.invoice_no}</a> · {formatDate(cn.credit_date)} · {cn.location_name}
            {cn.created_by_name ? ` · accepted by ${cn.created_by_name}` : ''}
          </p>
        </div>
        <div className="detail-actions">
          <a className="btn btn-secondary" href={href(`credit-notes/${cn.id}/print`)}>
            Print
          </a>
          {canPay && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog('allocate')}>
                Use against invoices
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog('refund')}>
                Pay back
              </button>
            </>
          )}
        </div>
      </div>
      <Banner kind="ok">{done}</Banner>

      <div className="facts">
        <Fact label="Customer">{cn.customer_name || cn.walk_in_name || 'Walk-in'}</Fact>
        <Fact label="Value">{formatMoney(cn.total)}</Fact>
        <Fact label="Settlement">{settlementText(cn.settlement, cn.refund_method, cn.payment_type)}</Fact>
        {cn.applied_to_invoice > 0 && <Fact label="Off the invoice">{formatMoney(cn.applied_to_invoice)}</Fact>}
        {cn.available > 0 && <Fact label="Unused (advance)">{formatMoney(cn.available)}</Fact>}
      </div>

      <div className="stack">
        <div className="card">
          <div className="section-title">Returned items</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th className="num">Returned</th>
                  <th>Stock</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {cn.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.line_no}</td>
                    <td className="wrap">{l.invoice_name}</td>
                    <td className="num">{qtyText(l)}</td>
                    <td className="wrap">
                      {l.restock ? (
                        <>
                          Back at {l.return_location_name}
                          {l.bundles.length > 0 && (
                            <div className="sub">
                              {l.bundles.some((b) => b.original_bundle_id) ? 'Onto ' : 'New bundle '}
                              {bundleSummary(l.bundles)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="sub">Damaged: not put back ({formatQty(l.base_qty, l.base_unit)})</span>
                      )}
                    </td>
                    <td className="num mono">{formatMoney(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">Reason: {cn.reason}</p>
        </div>
        {cn.refunds.length > 0 && (
          <div className="card">
            <div className="section-title">Paid back</div>
            <ul className="plain-list">
              {cn.refunds.map((r) => (
                <li key={r.id}>
                  <a className="mono" href={href(`refunds/${r.id}`)}>
                    {r.number}
                  </a>{' '}
                  {formatMoney(r.amount)} by {METHOD_LABELS[r.method].toLowerCase()} on {formatDate(r.date)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {cn.payment_type === 'cash' && cn.settlement === 'cash_refund' && (
          <p className="table-note">
            {formatMoney(cn.total)} paid back {cn.refund_method && cn.refund_method !== 'cash' ? `by ${METHOD_LABELS[cn.refund_method].toLowerCase()}` : 'in cash'} on{' '}
            {formatDate(cn.credit_date)}. Entered {formatDateTime(cn.created_at)}.
          </p>
        )}
      </div>

      {dialog === 'allocate' && cn.customer_id && (
        <AllocateDialog
          session={session}
          customerId={cn.customer_id}
          source={{ creditNoteId: cn.id }}
          label={cn.credit_note_no}
          available={cn.available}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setDialog(null);
            setDone(m);
            reload();
          }}
        />
      )}
      {dialog === 'refund' && cn.customer_id && (
        <RefundDialog
          session={session}
          customerId={cn.customer_id}
          source={{ creditNoteId: cn.id }}
          label={cn.credit_note_no}
          available={cn.available}
          onClose={() => setDialog(null)}
          onDone={(r) => go(`refunds/${r.id}`)}
        />
      )}
    </>
  );
}

export default CreditNotePage;

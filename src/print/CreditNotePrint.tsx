import { getDocument } from '../api';
import { Banner, Loading } from '../components/Common';
import PrintShell, { DocFooterTexts, DocSignatures } from '../components/PrintShell';
import { formatDate, formatMoney } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';
import { methodText, qtyText, settlementText } from './docText';

/** "CREDIT NOTE / RETURN" against an invoice: returned lines with value, how it was settled, the refund number. */
function CreditNotePrint({ session, creditNoteId, auto }: { session: Session; creditNoteId: string; auto: boolean }) {
  const { data: cn, error, loading } = useAsync(() => getDocument('credit_note', creditNoteId), [creditNoteId]);
  if (loading && !cn) return <Loading />;
  if (error || !cn) return <Banner kind="error">{error ?? 'Credit note not found.'}</Banner>;

  const refunded = cn.refunds.reduce((s, r) => s + r.amount, 0);

  return (
    <PrintShell
      session={session}
      business={cn.business}
      format="a4"
      auto={auto}
      notice={auto ? <Banner kind="ok">Return {cn.credit_note_no} recorded.</Banner> : undefined}
      toolbar={
        <>
          <a href={href(`credit-notes/${cn.id}`)}>← Credit note {cn.credit_note_no}</a>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print
          </button>
        </>
      }
      title={
        <>
          <div className="doc-kind">CREDIT NOTE / RETURN</div>
          <div className="doc-no">{cn.credit_note_no}</div>
          <div className="doc-small">Date: {formatDate(cn.credit_date)}</div>
          <div className="doc-small">Against invoice {cn.invoice_no}</div>
        </>
      }
    >
      <section className="doc-parties">
        <div>
          <div className="doc-label">Customer</div>
          <div className="doc-strong">{cn.customer_name || cn.walk_in_name || 'Walk-in customer'}</div>
          <div className="doc-small">{cn.customer_phone ?? cn.walk_in_phone ?? ''}</div>
        </div>
        <div>
          <div className="doc-label">Invoice</div>
          <div className="mono">{cn.invoice_no}</div>
          <div className="doc-small">{formatDate(cn.invoice_date)}</div>
        </div>
        <div>
          <div className="doc-label">Returned at</div>
          <div>{cn.location_name}</div>
        </div>
      </section>

      <table className="doc-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="num">Returned</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          {cn.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.line_no}</td>
              <td>
                {l.invoice_name}
                {!l.restock && <div className="doc-line-note">Damaged (not put back into stock)</div>}
              </td>
              <td className="num">{qtyText(l)}</td>
              <td className="num">{formatMoney(l.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-totals">
        <span className="grand">Total</span>
        <span className="v grand">{formatMoney(cn.total)}</span>
        {cn.applied_to_invoice > 0 && (
          <>
            <span>Taken off the invoice</span>
            <span className="v">{formatMoney(cn.applied_to_invoice)}</span>
          </>
        )}
        {refunded > 0 && (
          <>
            <span>Paid back</span>
            <span className="v">{formatMoney(refunded)}</span>
          </>
        )}
      </div>

      <section className="doc-section">
        <div className="doc-label">Settlement</div>
        <div className="doc-strong">{settlementText(cn.settlement, cn.refund_method, cn.payment_type)}</div>
        {cn.payment_type === 'cash' && cn.settlement === 'cash_refund' && (
          <div className="doc-small">
            {formatMoney(cn.total)} paid back {cn.refund_method && cn.refund_method !== 'cash' ? `by ${methodText(cn.refund_method).toLowerCase()}` : 'in cash'}.
          </div>
        )}
        {cn.refunds.map((r) => (
          <div key={r.id} className="doc-small">
            Refund {r.number}: {formatMoney(r.amount)} by {methodText(r.method).toLowerCase()}
          </div>
        ))}
      </section>

      <p className="doc-text">Reason: {cn.reason}</p>
      <DocFooterTexts texts={[cn.settings?.receipt_footer]} />
      <p className="doc-text">Prepared by {cn.created_by_name ?? '—'}</p>
      <DocSignatures left="Customer signature" right="For the business" />
    </PrintShell>
  );
}

export default CreditNotePrint;

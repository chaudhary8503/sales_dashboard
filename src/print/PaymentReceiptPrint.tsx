import { getDocument } from '../api';
import { Banner, Loading } from '../components/Common';
import PrintShell, { DocFooterTexts, DocSignatures } from '../components/PrintShell';
import { formatDate, formatMoney, STATUS_LABELS } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';
import { methodText } from './docText';

/** "PAYMENT RECEIPT": method, cheque details and status, the invoices it settles, the advance kept. */
function PaymentReceiptPrint({ session, paymentId, auto }: { session: Session; paymentId: string; auto: boolean }) {
  const { data: p, error, loading } = useAsync(() => getDocument('payment', paymentId), [paymentId]);
  if (loading && !p) return <Loading />;
  if (error || !p) return <Banner kind="error">{error ?? 'Payment not found.'}</Banner>;

  const settles = p.allocations.filter((a) => !a.released);
  const refunded = p.refunds.reduce((s, r) => s + r.amount, 0);

  return (
    <PrintShell
      session={session}
      business={p.business}
      format="a4"
      auto={auto}
      cancelled={p.status === 'cancelled'}
      notice={auto ? <Banner kind="ok">Payment {p.payment_no} recorded.</Banner> : undefined}
      toolbar={
        <>
          <a href={href(`payments/${p.id}`)}>← Payment {p.payment_no}</a>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print
          </button>
        </>
      }
      title={
        <>
          <div className="doc-kind">PAYMENT RECEIPT</div>
          <div className="doc-no">{p.payment_no}</div>
          <div className="doc-small">Date: {formatDate(p.payment_date)}</div>
          {p.location_name && <div className="doc-small">{p.location_name}</div>}
        </>
      }
    >
      <section className="doc-parties">
        <div>
          <div className="doc-label">Received from</div>
          <div className="doc-strong">{p.customer_name}</div>
          {p.customer_code && <div className="doc-small">{p.customer_code}</div>}
        </div>
        <div>
          <div className="doc-label">Amount</div>
          <div className="doc-strong">{formatMoney(p.amount)}</div>
        </div>
        <div>
          <div className="doc-label">Method</div>
          <div>{methodText(p.method)}</div>
          {p.reference && <div className="doc-small">Ref. {p.reference}</div>}
        </div>
        {p.sale_order_no && (
          <div>
            <div className="doc-label">Advance for order</div>
            <div className="mono">{p.sale_order_no}</div>
          </div>
        )}
      </section>

      {p.method === 'cheque' && (
        <section className="doc-section">
          <div className="doc-label">Cheque</div>
          <div>
            No. {p.cheque_no}
            {p.cheque_bank ? ` · ${p.cheque_bank}` : ''}
            {p.cheque_date ? ` · dated ${formatDate(p.cheque_date)}` : ''}
          </div>
          <div className={p.status === 'pending' ? 'doc-emphasis' : undefined}>
            {p.status === 'pending'
              ? 'Pending until cleared'
              : p.status === 'cleared'
                ? `Cleared on ${formatDate(p.cleared_date)}`
                : (STATUS_LABELS[p.status] ?? p.status)}
          </div>
        </section>
      )}
      {p.status === 'bounced' && <p className="doc-text doc-emphasis">This cheque bounced{p.status_reason ? `: ${p.status_reason}` : ''}.</p>}

      {settles.length > 0 && (
        <table className="doc-lines">
          <thead>
            <tr>
              <th>Settles invoice</th>
              <th>Invoice date</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {settles.map((a) => (
              <tr key={a.invoice_id}>
                <td className="mono">{a.invoice_no}</td>
                <td>{formatDate(a.invoice_date)}</td>
                <td className="num">{formatMoney(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="doc-totals">
        <span>Received</span>
        <span className="v">{formatMoney(p.amount)}</span>
        <span>Against invoices</span>
        <span className="v">{formatMoney(settles.reduce((s, a) => s + a.amount, 0))}</span>
        {refunded > 0 && (
          <>
            <span>Paid back</span>
            <span className="v">{formatMoney(refunded)}</span>
          </>
        )}
        <span className="grand">Kept as advance</span>
        <span className="v grand">{formatMoney(p.status === 'cleared' || p.status === 'pending' ? p.available : 0)}</span>
      </div>

      {p.method === 'cheque' && <p className="doc-text">A cheque counts only when it is cleared.</p>}
      {p.note && <p className="doc-text">Note: {p.note}</p>}
      <DocFooterTexts texts={[p.settings?.receipt_footer]} />
      <p className="doc-text">Received by {p.created_by_name ?? '—'}</p>
      <DocSignatures left="Customer signature" right="Received by" />
    </PrintShell>
  );
}

export default PaymentReceiptPrint;

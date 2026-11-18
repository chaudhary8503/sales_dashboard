import { getDocument } from '../api';
import { Banner, Loading } from '../components/Common';
import PrintShell, { DocFooterTexts, DocSignatures } from '../components/PrintShell';
import { formatDate, formatMoney, round2 } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';
import { qtyText, rateText } from './docText';

/** "SALE ORDER": lines with prices, expected date, advance received and what remains. */
function SaleOrderPrint({ session, orderId, auto }: { session: Session; orderId: string; auto: boolean }) {
  const { data: so, error, loading } = useAsync(() => getDocument('sale_order', orderId), [orderId]);
  if (loading && !so) return <Loading />;
  if (error || !so) return <Banner kind="error">{error ?? 'Sale order not found.'}</Banner>;

  const advance = round2(so.advances.filter((a) => a.status === 'cleared' || a.status === 'pending').reduce((s, a) => s + a.amount, 0));
  const pendingCheque = so.advances.some((a) => a.status === 'pending');
  const anyDiscount = so.lines.some((l) => l.discount_amount > 0);

  return (
    <PrintShell
      session={session}
      business={so.business}
      format="a4"
      auto={auto}
      cancelled={so.status === 'cancelled'}
      notice={auto ? <Banner kind="ok">Sale order {so.sale_order_no} saved.</Banner> : undefined}
      toolbar={
        <>
          <a href={href(`orders/${so.id}`)}>← Sale order {so.sale_order_no}</a>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print
          </button>
        </>
      }
      title={
        <>
          <div className="doc-kind">SALE ORDER</div>
          <div className="doc-no">{so.sale_order_no}</div>
          <div className="doc-small">Date: {formatDate(so.order_date)}</div>
          {so.expected_date && <div className="doc-small">Expected: {formatDate(so.expected_date)}</div>}
          {so.location_name && <div className="doc-small">{so.location_name}</div>}
        </>
      }
    >
      <section className="doc-parties">
        <div>
          <div className="doc-label">Customer</div>
          <div className="doc-strong">{so.customer_name}</div>
          <div className="doc-small">{[so.customer_code, so.customer_phone].filter(Boolean).join(' · ')}</div>
        </div>
        <div>
          <div className="doc-label">Credit days</div>
          <div>{so.credit_days}</div>
        </div>
      </section>

      <table className="doc-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="num">Quantity</th>
            <th className="num">Rate</th>
            {anyDiscount && <th className="num">Discount</th>}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {so.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.line_no}</td>
              <td>{l.invoice_name}</td>
              <td className="num">{qtyText(l)}</td>
              <td className="num">{rateText(l.rate, l.entered_unit)}</td>
              {anyDiscount && (
                <td className="num">
                  {l.discount_amount > 0 ? (l.discount_type === 'percent' ? `${l.discount_value}%` : formatMoney(l.discount_amount)) : ''}
                </td>
              )}
              <td className="num">{formatMoney(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-totals">
        <span>Subtotal</span>
        <span className="v">{formatMoney(so.subtotal)}</span>
        {so.discount_total > 0 && (
          <>
            <span>Discounts</span>
            <span className="v">− {formatMoney(so.discount_total)}</span>
          </>
        )}
        <span className="grand">Total</span>
        <span className="v grand">{formatMoney(so.total)}</span>
        <span>Advance received{pendingCheque ? ' (cheque pending)' : ''}</span>
        <span className="v">{formatMoney(advance)}</span>
        <span className="doc-strong">Remaining</span>
        <span className="v doc-strong">{formatMoney(Math.max(round2(so.total - advance), 0))}</span>
      </div>

      {so.note && <p className="doc-text">Note: {so.note}</p>}
      <p className="doc-text">Quantities of cable may vary slightly with bundle lengths; the invoice shows what is delivered.</p>
      <DocFooterTexts texts={[so.settings?.invoice_terms, so.business?.invoice_footer]} />
      <p className="doc-text">Prepared by {so.created_by_name ?? '—'}</p>
      <DocSignatures left="Customer signature" right="For the business" />
    </PrintShell>
  );
}

export default SaleOrderPrint;

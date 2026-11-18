import { getDocument, type InvoiceDoc } from '../api';
import { Banner, Loading } from '../components/Common';
import PrintShell, { DocFooterTexts, DocSignatures } from '../components/PrintShell';
import { formatDate, formatMoney } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';
import { bundleSummary, methodText, qtyText, rateText } from './docText';

interface Props {
  session: Session;
  invoiceId: string;
  format: 'a4' | 'a5';
  auto: boolean;
}

/** Customer invoice: A4 (default) or the compact A5 receipt. Never shows the staff item name, wires or thou. */
function InvoicePrint({ session, invoiceId, format, auto }: Props) {
  const { data: inv, error, loading } = useAsync(() => getDocument('invoice', invoiceId), [invoiceId]);
  if (loading && !inv) return <Loading />;
  if (error || !inv) return <Banner kind="error">{error ?? 'Invoice not found.'}</Banner>;

  return (
    <PrintShell
      session={session}
      business={inv.business}
      format={format}
      auto={auto}
      cancelled={inv.status === 'cancelled'}
      toolbar={<InvoiceToolbar inv={inv} current={format} />}
      notice={auto ? <Banner kind="ok">Sale {inv.invoice_no} posted.</Banner> : undefined}
      title={
        <>
          <div className="doc-kind">INVOICE</div>
          <div className="doc-subkind">{inv.payment_type === 'credit' ? 'Credit sale' : 'Cash sale'}</div>
          <div className="doc-no">{inv.invoice_no}</div>
          <div className="doc-small">Date: {formatDate(inv.invoice_date)}</div>
          {inv.payment_type === 'credit' && inv.due_date && <div className="doc-small">Due: {formatDate(inv.due_date)}</div>}
          {inv.location_name && <div className="doc-small">{inv.location_name}</div>}
        </>
      }
    >
      <InvoiceBody inv={inv} compact={format === 'a5'} />
    </PrintShell>
  );
}

export function InvoiceToolbar({ inv, current }: { inv: InvoiceDoc; current: 'a4' | 'a5' | 'challan' }) {
  const link = (format: string) => href(`invoices/${inv.id}/print`, { format });
  return (
    <>
      <a href={href(`invoices/${inv.id}`)}>← Invoice {inv.invoice_no}</a>
      <div className="form-actions">
        <a className={`btn btn-small ${current === 'a4' ? 'btn-primary' : 'btn-secondary'}`} href={link('a4')}>
          A4
        </a>
        <a className={`btn btn-small ${current === 'a5' ? 'btn-primary' : 'btn-secondary'}`} href={link('a5')}>
          A5 receipt
        </a>
        <a className={`btn btn-small ${current === 'challan' ? 'btn-primary' : 'btn-secondary'}`} href={link('challan')}>
          Delivery challan
        </a>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>
    </>
  );
}

function InvoiceBody({ inv, compact }: { inv: InvoiceDoc; compact: boolean }) {
  const credit = inv.payment_type === 'credit';
  const anyDiscount = inv.lines.some((l) => l.discount_amount > 0);
  const paid = inv.balance?.paid ?? 0;
  const balance = inv.balance?.balance ?? 0;
  const pending = inv.balance?.pending ?? 0;
  return (
    <>
      <section className="doc-parties">
        <div>
          <div className="doc-label">Bill to</div>
          {inv.customer_id ? (
            <>
              <div className="doc-strong">{inv.customer_name}</div>
              {inv.customer_business_name && <div>{inv.customer_business_name}</div>}
              <div className="doc-small">
                {[inv.customer_code, inv.customer_phone].filter(Boolean).join(' · ')}
              </div>
            </>
          ) : (
            <>
              <div className="doc-strong">{inv.walk_in_name || 'Walk-in customer'}</div>
              {inv.walk_in_phone && <div className="doc-small">{inv.walk_in_phone}</div>}
            </>
          )}
        </div>
        {inv.sale_order_no && (
          <div>
            <div className="doc-label">Sale order</div>
            <div className="mono">{inv.sale_order_no}</div>
          </div>
        )}
        {inv.delivery?.vehicle_no && !compact && (
          <div>
            <div className="doc-label">Vehicle</div>
            <div>{inv.delivery.vehicle_no}</div>
          </div>
        )}
      </section>

      <table className="doc-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            {compact ? (
              <th className="num">Qty × rate</th>
            ) : (
              <>
                <th className="num">Quantity</th>
                <th className="num">Rate</th>
                {anyDiscount && <th className="num">Discount</th>}
              </>
            )}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => {
            const discount =
              l.discount_amount > 0 ? (l.discount_type === 'percent' ? `${l.discount_value}%` : formatMoney(l.discount_amount)) : '';
            return (
              <tr key={l.id}>
                <td>{l.line_no}</td>
                <td>
                  {l.invoice_name}
                  {l.bundles.length > 0 && <div className="doc-line-note">Bundles: {bundleSummary(l.bundles)}</div>}
                  {l.source_location_id !== inv.sale_location_id && l.source_location_name && (
                    <div className="doc-line-note">Supplied from {l.source_location_name}</div>
                  )}
                </td>
                {compact ? (
                  <td className="num">
                    {qtyText(l)} × {rateText(l.rate, l.entered_unit)}
                    {discount && <div className="doc-line-note">less {discount}</div>}
                  </td>
                ) : (
                  <>
                    <td className="num">{qtyText(l)}</td>
                    <td className="num">{rateText(l.rate, l.entered_unit)}</td>
                    {anyDiscount && <td className="num">{discount}</td>}
                  </>
                )}
                <td className="num">{formatMoney(l.gross_amount - l.discount_amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="doc-totals">
        <span>Subtotal</span>
        <span className="v">{formatMoney(inv.subtotal)}</span>
        {inv.line_discount_total > 0 && (
          <>
            <span>Line discounts</span>
            <span className="v">− {formatMoney(inv.line_discount_total)}</span>
          </>
        )}
        {inv.invoice_discount_amount > 0 && (
          <>
            <span>Discount{inv.invoice_discount_type === 'percent' ? ` (${inv.invoice_discount_value}%)` : ''}</span>
            <span className="v">− {formatMoney(inv.invoice_discount_amount)}</span>
          </>
        )}
        {inv.tax_total > 0 && (
          <>
            <span>Sales tax</span>
            <span className="v">{formatMoney(inv.tax_total)}</span>
          </>
        )}
        <span className="grand">Total</span>
        <span className="v grand">{formatMoney(inv.total)}</span>
        {credit && (
          <>
            <span>Paid</span>
            <span className="v">{formatMoney(paid)}</span>
            {pending > 0 && (
              <>
                <span>Cheques pending</span>
                <span className="v">{formatMoney(pending)}</span>
              </>
            )}
            <span className="doc-strong">Balance</span>
            <span className="v doc-strong">{formatMoney(balance)}</span>
          </>
        )}
      </div>

      <div className="doc-section">
        {credit ? (
          <p className="doc-text">
            {inv.due_date ? (
              <span className="doc-emphasis">Please pay the balance by {formatDate(inv.due_date)}.</span>
            ) : null}
          </p>
        ) : (
          <p className="doc-text">
            Paid by {methodText(inv.cash_paid_via ?? 'cash').toLowerCase()}
            {inv.cash_reference ? ` (ref. ${inv.cash_reference})` : ''}.
          </p>
        )}
        {inv.note && <p className="doc-text">Note: {inv.note}</p>}
      </div>

      <DocFooterTexts texts={[inv.settings?.invoice_terms, inv.business?.invoice_footer, inv.settings?.receipt_footer]} />
      <p className="doc-text">Prepared by {inv.created_by_name ?? '—'}</p>
      {!compact && <DocSignatures left="Customer signature" right="For the business" />}
    </>
  );
}

export default InvoicePrint;

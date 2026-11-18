import { useRef, useState } from 'react';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, attachmentType, attachPaymentFile, cancelPayment, getDocument, signedUrl, type PaymentDoc } from '../api';
import { AllocateDialog, RefundDialog } from '../components/AdvanceDialogs';
import { BounceChequeDialog, ClearChequeDialog } from '../components/ChequeDialogs';
import { Banner, ConfirmWithReason, Fact, Loading, StatusTag } from '../components/Common';
import { toSalesError } from '../errors';
import { formatDate, formatDateTime, formatMoney, METHOD_LABELS, STATUS_LABELS } from '../format';
import { useAsync } from '../hooks';
import { go, href } from '../router';
import type { Session } from '../session';

type Dialog = 'cancel' | 'allocate' | 'refund' | 'clear' | 'bounce' | null;

/** One payment: status timeline, allocations, refunds and attachments; print, cancel, use or pay back the advance. */
function PaymentPage({ session, paymentId }: { session: Session; paymentId: string }) {
  const { data: p, error, loading, reload } = useAsync(() => getDocument('payment', paymentId), [paymentId]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [done, setDone] = useState<string | null>(null);

  if (loading && !p) return <Loading />;
  if (error || !p) return <Banner kind="error">{error ?? 'Payment not found.'}</Banner>;

  const active = p.status === 'cleared' || p.status === 'pending';
  const canPay = session.can('record_payment') && session.customersLive;
  const canUse = active && canPay && p.available > 0;
  const canRefund = p.status === 'cleared' && canPay && p.available > 0;
  const canCancel = active && session.can('cancel_payment') && p.refunds.length === 0;
  const canCheque = p.method === 'cheque' && p.status === 'pending' && session.can('manage_cheques');
  const finished = (m: string) => {
    setDialog(null);
    setDone(m);
    reload();
  };
  const cheque = { id: p.id, payment_no: p.payment_no, customer_name: p.customer_name, amount: p.amount, cheque_no: p.cheque_no, payment_date: p.payment_date };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Payment <span className="mono">{p.payment_no}</span> <StatusTag status={p.status} />
          </h1>
          <p className="page-sub">
            {p.customer_name} · {formatDate(p.payment_date)}
            {p.location_name ? ` · ${p.location_name}` : ''}
            {p.created_by_name ? ` · recorded by ${p.created_by_name}` : ''}
          </p>
        </div>
        <div className="detail-actions">
          <a className="btn btn-secondary" href={href(`payments/${p.id}/print`)}>
            Print receipt
          </a>
          {canCheque && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => setDialog('clear')}>
                Cheque cleared
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setDialog('bounce')}>
                Bounced
              </button>
            </>
          )}
          {canUse && (
            <button type="button" className="btn btn-secondary" onClick={() => setDialog('allocate')}>
              Use advance
            </button>
          )}
          {canRefund && (
            <button type="button" className="btn btn-secondary" onClick={() => setDialog('refund')}>
              Pay back
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn btn-danger" onClick={() => setDialog('cancel')}>
              Cancel payment
            </button>
          )}
        </div>
      </div>

      <Banner kind="ok">{done}</Banner>
      {p.status === 'pending' && <Banner kind="info">Pending until cleared. A cheque counts only when it is cleared.</Banner>}
      {(p.status === 'bounced' || p.status === 'cancelled') && (
        <Banner kind="warn">
          {STATUS_LABELS[p.status]}
          {p.status_reason ? `: ${p.status_reason}` : ''}. Nothing from this payment counts any more.
        </Banner>
      )}

      <div className="facts">
        <Fact label="Amount">{formatMoney(p.amount)}</Fact>
        <Fact label="Method">{METHOD_LABELS[p.method]}</Fact>
        <Fact label="Against invoices">{formatMoney(p.allocations.filter((a) => !a.released).reduce((s, a) => s + a.amount, 0))}</Fact>
        <Fact label="Unused (advance)">{formatMoney(active ? p.available : 0)}</Fact>
      </div>

      <div className="split">
        <div className="stack">
          <div className="card">
            <div className="section-title">Invoices it settles</div>
            {p.allocations.length === 0 ? (
              <p className="sub">{p.sale_order_no ? `Kept as an advance for sale order ${p.sale_order_no}.` : 'Kept as an advance.'}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.allocations.map((a, i) => (
                    <tr key={`${a.invoice_id}-${i}`}>
                      <td className="mono">
                        <a href={href(`invoices/${a.invoice_id}`)}>{a.invoice_no}</a>
                      </td>
                      <td className="mono">{formatDate(a.invoice_date)}</td>
                      <td className="num mono">{formatMoney(a.amount)}</td>
                      <td>{a.released && <span className="tag muted">Released{a.released_reason ? `: ${a.released_reason}` : ''}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {p.refunds.length > 0 && (
              <>
                <div className="section-title section-gap">Paid back</div>
                <ul className="plain-list">
                  {p.refunds.map((r) => (
                    <li key={r.id}>
                      <a className="mono" href={href(`refunds/${r.id}`)}>
                        {r.number}
                      </a>{' '}
                      {formatMoney(r.amount)} by {METHOD_LABELS[r.method].toLowerCase()} on {formatDate(r.date)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <Attachments session={session} payment={p} onAdded={(m) => finished(m)} />
        </div>

        <div className="stack">
          <div className="card">
            <div className="section-title">Details</div>
            <dl className="kv">
              <dt>Customer</dt>
              <dd>
                {session.customersLive ? <a href={href(`customers/${p.customer_id}`)}>{p.customer_name}</a> : p.customer_name}
                {p.customer_code ? ` (${p.customer_code})` : ''}
              </dd>
              {p.method === 'cheque' && (
                <>
                  <dt>Cheque</dt>
                  <dd>
                    {p.cheque_no}
                    {p.cheque_bank ? ` · ${p.cheque_bank}` : ''}
                  </dd>
                  <dt>Cheque date</dt>
                  <dd>{formatDate(p.cheque_date)}</dd>
                  {p.cleared_date && (
                    <>
                      <dt>Cleared</dt>
                      <dd>{formatDate(p.cleared_date)}</dd>
                    </>
                  )}
                </>
              )}
              {p.reference && (
                <>
                  <dt>Reference</dt>
                  <dd>{p.reference}</dd>
                </>
              )}
              {p.invoice_id && (
                <>
                  <dt>Received with</dt>
                  <dd>
                    <a href={href(`invoices/${p.invoice_id}`)}>the sale</a>
                  </dd>
                </>
              )}
              {p.sale_order_id && (
                <>
                  <dt>Sale order</dt>
                  <dd>
                    <a href={href(`orders/${p.sale_order_id}`)}>{p.sale_order_no}</a>
                  </dd>
                </>
              )}
              {p.note && (
                <>
                  <dt>Note</dt>
                  <dd>{p.note}</dd>
                </>
              )}
            </dl>
          </div>
          <div className="card">
            <div className="section-title">Status history</div>
            <ol className="timeline">
              {p.events.map((e, i) => (
                <li key={i}>
                  <StatusTag status={e.to} /> <span className="mono">{formatDate(e.date)}</span>
                  <div className="sub">
                    {e.reason}
                    {e.by ? ` · ${e.by}` : ''} · {formatDateTime(e.at)}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {dialog === 'cancel' && (
        <ConfirmWithReason
          title={`Cancel payment ${p.payment_no}?`}
          explain={
            p.status === 'cleared'
              ? "The payment is taken back off the customer's account, and the invoices it settled become unpaid again."
              : 'The pending cheque is cancelled and the invoices it was settling become unpaid again.'
          }
          confirmLabel="Cancel the payment"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await cancelPayment(p.id, reason);
            finished(`Payment ${p.payment_no} is cancelled.`);
          }}
        />
      )}
      {dialog === 'allocate' && (
        <AllocateDialog
          session={session}
          customerId={p.customer_id}
          source={{ paymentId: p.id }}
          label={p.payment_no}
          available={p.available}
          onClose={() => setDialog(null)}
          onDone={finished}
        />
      )}
      {dialog === 'refund' && (
        <RefundDialog
          session={session}
          customerId={p.customer_id}
          source={{ paymentId: p.id }}
          label={p.payment_no}
          available={p.available}
          onClose={() => setDialog(null)}
          onDone={(r) => go(`refunds/${r.id}`)}
        />
      )}
      {dialog === 'clear' && <ClearChequeDialog cheque={cheque} today={session.today} onClose={() => setDialog(null)} onDone={finished} />}
      {dialog === 'bounce' && <BounceChequeDialog cheque={cheque} onClose={() => setDialog(null)} onDone={finished} />}
    </>
  );
}

function Attachments({ session, payment, onAdded }: { session: Session; payment: PaymentDoc; onAdded: (m: string) => void }) {
  const canAttach = session.can('record_payment') || session.can('manage_cheques');
  const paths = payment.attachments.map((a) => a.storage_path);
  const urls = useAsync(
    async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await signedUrl('sales-attachments', path)] as const))),
    [paths.join('|')],
  );
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    const mime = attachmentType(file);
    if (!ATTACHMENT_TYPES.includes(mime)) {
      setProblem('Choose a photo (JPEG, PNG, WebP or HEIC) or a PDF.');
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setProblem('The file is bigger than 10 MB. Take a smaller photo or compress the PDF.');
      return;
    }
    setBusy(true);
    try {
      await attachPaymentFile(payment.id, file);
      onAdded(`${file.name} attached to ${payment.payment_no}.`);
    } catch (e) {
      setProblem(toSalesError(e).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="card">
      <div className="page-head">
        <div className="section-title">Attachments</div>
        {canAttach && (
          <>
            <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Uploading…' : 'Attach photo/PDF'}
            </button>
            <input
              ref={input}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </>
        )}
      </div>
      {problem && <Banner kind="error">{problem}</Banner>}
      {payment.attachments.length === 0 ? (
        <p className="sub">No cheque or bank slip photo attached.</p>
      ) : (
        <ul className="attachments">
          {payment.attachments.map((a) => {
            const url = urls.data?.[a.storage_path] ?? null;
            const image = a.mime_type.startsWith('image/') && a.mime_type !== 'image/heic';
            return (
              <li key={a.id}>
                {url && image ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={a.file_name} />
                  </a>
                ) : null}
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    {a.file_name}
                  </a>
                ) : (
                  <span>{a.file_name}</span>
                )}
                <span className="sub"> · {Math.max(1, Math.round(a.size_bytes / 1024))} KB</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="table-note">JPEG, PNG, WebP, HEIC or PDF, up to 10 MB. Files can't be replaced or removed once attached.</p>
    </div>
  );
}

export default PaymentPage;

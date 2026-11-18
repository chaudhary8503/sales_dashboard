import { getDocument } from '../api';
import { Banner, Fact, Loading } from '../components/Common';
import { formatDate, formatDateTime, formatMoney, METHOD_LABELS } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';

/** Money paid back to a customer out of an advance (a payment or a return). */
function RefundPage({ session, refundId }: { session: Session; refundId: string }) {
  const { data: r, error, loading } = useAsync(() => getDocument('refund', refundId), [refundId]);
  if (loading && !r) return <Loading />;
  if (error || !r) return <Banner kind="error">{error ?? 'Refund not found.'}</Banner>;
  const sourceHref = r.source_payment_id ? href(`payments/${r.source_payment_id}`) : href(`credit-notes/${r.source_credit_note_id ?? ''}`);

  return (
    <>
      <h1 className="page-title">
        Refund <span className="mono">{r.refund_no}</span>
      </h1>
      <p className="page-sub">
        Paid back to {session.customersLive ? <a href={href(`customers/${r.customer_id}`)}>{r.customer_name}</a> : r.customer_name} on{' '}
        {formatDate(r.refund_date)}
        {r.created_by_name ? ` by ${r.created_by_name}` : ''}.
      </p>
      <div className="facts">
        <Fact label="Amount">{formatMoney(r.amount)}</Fact>
        <Fact label="Method">{METHOD_LABELS[r.method]}</Fact>
        <Fact label="From">
          <a href={sourceHref}>{r.source_number}</a>
        </Fact>
        <Fact label="Paid at">{r.location_name ?? '—'}</Fact>
      </div>
      <div className="card narrow-card">
        <dl className="kv">
          <dt>Reference</dt>
          <dd>{r.reference || '—'}</dd>
          <dt>Note</dt>
          <dd>{r.note || '—'}</dd>
          <dt>Entered</dt>
          <dd>{formatDateTime(r.created_at)}</dd>
        </dl>
      </div>
    </>
  );
}

export default RefundPage;

import { useState, type FormEvent } from 'react';
import { getCustomerOverview, recordPayment, type Customer, type CustomerOverview, type PaymentPayload } from '../api';
import AllocationTable from '../components/AllocationTable';
import { Banner, ErrorBanner, Loading, LocationSelect } from '../components/Common';
import CustomerSearch, { CustomerCard } from '../components/CustomerSearch';
import PaymentFields from '../components/PaymentFields';
import { formatDate, formatMoney } from '../format';
import { storageGet, useAction, useAsync, useRequestId } from '../hooks';
import { allocationProblem, emptyPayment, paymentProblem, suggestAllocations, type PaymentDraft } from '../payments';
import { go, href } from '../router';
import type { Session } from '../session';

/** Money received from a customer: settles open invoices oldest first (or as chosen); the rest is kept as advance. */
function PaymentNewPage({ session, customerId }: { session: Session; customerId: string | null }) {
  const [chosen, setChosen] = useState<string | null>(customerId);
  const overview = useAsync(() => (chosen ? getCustomerOverview(chosen) : Promise.resolve(null)), [chosen]);

  if (!chosen) {
    return (
      <>
        <h1 className="page-title">Record payment</h1>
        <p className="page-sub">Find the customer who paid.</p>
        <div className="card narrow-card">
          <CustomerSearch id="pay-customer" autoFocus onSelect={(c: Customer) => setChosen(c.customer_id)} />
        </div>
      </>
    );
  }
  if (overview.loading && !overview.data) return <Loading />;
  if (overview.error || !overview.data) return <Banner kind="error">{overview.error ?? 'Customer not found.'}</Banner>;
  return <PaymentForm key={chosen} session={session} overview={overview.data} onChangeCustomer={() => setChosen(null)} />;
}

function PaymentForm({ session, overview, onChangeCustomer }: { session: Session; overview: CustomerOverview; onChangeCustomer: () => void }) {
  const today = session.today;
  const canBackdate = session.can('backdate_sale');
  const c = overview.customer;
  const invoices = overview.open_invoices;
  const [pay, setPay] = useState<PaymentDraft>(() => emptyPayment(today));
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState(() => {
    const last = storageGet('sales:lastLocation');
    return last && session.locations.some((l) => l.location_id === last) ? last : '';
  });
  const [orderId, setOrderId] = useState('');
  const [note, setNote] = useState('');
  // null = untouched suggestion (sent as null: the server allocates oldest first).
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const request = useRequestId();
  const action = useAction();

  const amount = pay.amount.trim() === '' ? 0 : Number(pay.amount);
  const available = Number.isFinite(amount) ? amount : 0;
  const shown = values ?? suggestAllocations(invoices, available);
  const problems = [
    paymentProblem(pay, { required: true }),
    !orderId && allocationProblem(invoices, shown, available),
    date > today && 'Future dates are not allowed.',
  ].filter((x): x is string => Boolean(x));
  const ready = problems.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || action.busy) return;
    const payload: PaymentPayload = {
      request_id: request.id,
      amount,
      method: pay.method,
      reference: pay.reference.trim() || null,
      cheque_no: pay.method === 'cheque' ? pay.chequeNo.trim() : null,
      cheque_bank: pay.method === 'cheque' ? pay.chequeBank.trim() || null : null,
      cheque_date: pay.method === 'cheque' ? pay.chequeDate || null : null,
      location_id: locationId || null,
      sale_order_id: orderId || null,
      note: note.trim() || null,
    };
    if (canBackdate && date !== today) payload.payment_date = date;
    const allocations = orderId
      ? []
      : values === null
        ? null
        : invoices.map((i) => ({ invoice_id: i.invoice_id, amount: Number(values[i.invoice_id] || 0) })).filter((a) => a.amount > 0);
    let id = '';
    const ok = await action.run(async () => {
      id = (await recordPayment(c.customer_id, payload, allocations)).id;
    });
    if (ok && id) {
      request.renew();
      go(`payments/${id}/print`, { auto: '1' });
    }
  };

  return (
    <>
      <h1 className="page-title">Record payment</h1>
      <p className="page-sub">
        Money received from a customer. It settles open invoices oldest first unless you change the amounts; anything left over is kept as an
        advance.
      </p>
      <form onSubmit={submit} noValidate className="stack">
        <div className="card">
          <div className="form-grid">
            <div className="field span-2">
              <span className="label">Customer</span>
              <CustomerCard customer={c} onChange={onChangeCustomer} />
              {session.can('view_customer_balances') || session.can('view_customer_invoices') ? (
                <div className="hint">
                  Outstanding {formatMoney(overview.balance.outstanding)} · overdue {formatMoney(overview.balance.overdue)} · cheques pending{' '}
                  {formatMoney(overview.balance.pending_cheques)}
                </div>
              ) : null}
            </div>
            {c.blocked && (
              <div className="span-2">
                <Banner kind="info">This customer is blocked for sales, but payments are still accepted.</Banner>
              </div>
            )}
            <div className="field">
              <label htmlFor="pay-loc">Received at</label>
              <LocationSelect id="pay-loc" locations={session.locations} value={locationId} onChange={setLocationId} placeholder="Not recorded" />
            </div>
            <div className="field">
              {canBackdate ? (
                <>
                  <label htmlFor="pay-date">Date received</label>
                  <input id="pay-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                </>
              ) : (
                <>
                  <span className="label">Date received</span>
                  <div className="ns-static">{formatDate(today)}</div>
                </>
              )}
            </div>
          </div>
          <PaymentFields idPrefix="pay" value={pay} onChange={setPay} />
          {pay.method === 'cheque' && (
            <Banner kind="info">A cheque counts only when it is cleared. Until then it shows as pending on the invoices it settles.</Banner>
          )}
          <div className="form-grid">
            {overview.open_sale_orders.length > 0 && (
              <div className="field">
                <label htmlFor="pay-order">Advance for a sale order (optional)</label>
                <select id="pay-order" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                  <option value="">No — settle invoices</option>
                  {overview.open_sale_orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {formatMoney(o.total)}
                    </option>
                  ))}
                </select>
                {orderId && <div className="hint">The whole amount is kept with the order and used when it is delivered.</div>}
              </div>
            )}
            <div className={`field${overview.open_sale_orders.length > 0 ? '' : ' span-2'}`}>
              <label htmlFor="pay-note">Note (optional)</label>
              <input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>

        {!orderId && (
          <div className="card">
            <div className="page-head">
              <div className="section-title">Settle invoices</div>
              {invoices.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setValues(Object.fromEntries(invoices.map((i) => [i.invoice_id, ''])))}
                >
                  Keep it all as advance
                </button>
              )}
            </div>
            <AllocationTable
              invoices={invoices}
              values={shown}
              onChange={setValues}
              available={available}
              suggested={values === null}
              onReset={() => setValues(null)}
              today={today}
            />
          </div>
        )}

        <div className="card">
          <ErrorBanner error={action.failure} />
          {!ready && pay.amount !== '' && <p className="sub ns-problems">{problems[0]}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
              {action.busy ? 'Saving…' : `Record ${available > 0 ? formatMoney(available) : 'payment'}`}
            </button>
            <a className="btn btn-secondary" href={href(`customers/${c.customer_id}`)}>
              Back to the customer
            </a>
          </div>
        </div>
      </form>
    </>
  );
}

export default PaymentNewPage;

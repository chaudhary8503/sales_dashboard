import { useMemo, useState, type FormEvent } from 'react';
import { createSaleOrder, getCustomerOverview, type Customer, type SaleOrderHeader } from '../api';
import { Banner, ErrorBanner, Loading, LocationSelect } from '../components/Common';
import CustomerSearch, { CustomerCard } from '../components/CustomerSearch';
import LineEditor from '../components/LineEditor';
import PaymentFields from '../components/PaymentFields';
import { formatDate, formatMoney } from '../format';
import { storageGet, useAction, useAsync, useRequestId } from '../hooks';
import { newLine, priceLines, RAW_MATERIALS, SELLABLE, toPayload, type DraftLine } from '../lines';
import { emptyPayment, paymentProblem, toPaymentNow, type PaymentDraft } from '../payments';
import { go } from '../router';
import { itemById, type Session } from '../session';

/** A sale order: a named customer, lines with rates (no supply location or bundles), an expected date and an optional advance. */
function SaleOrderNewPage({ session, customerId }: { session: Session; customerId: string | null }) {
  const preset = useAsync(() => (customerId ? getCustomerOverview(customerId).then((o) => o.customer) : Promise.resolve(null)), [customerId]);
  if (customerId && preset.loading && preset.data === undefined) return <Loading />;
  return <OrderForm key={preset.data?.customer_id ?? 'new'} session={session} presetCustomer={preset.data ?? null} />;
}

function OrderForm({ session, presetCustomer }: { session: Session; presetCustomer: Customer | null }) {
  const today = session.today;
  const canBackdate = session.can('backdate_sale');
  const [customer, setCustomer] = useState<Customer | null>(presetCustomer);
  const [locationId, setLocationId] = useState(() => {
    const last = storageGet('sales:lastLocation');
    if (last && session.locations.some((l) => l.location_id === last)) return last;
    return session.locations.length === 1 ? session.locations[0].location_id : '';
  });
  const [date, setDate] = useState(today);
  const [expected, setExpected] = useState('');
  const [creditDays, setCreditDays] = useState(presetCustomer?.payment_terms_days != null ? String(presetCustomer.payment_terms_days) : '');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [showRaw, setShowRaw] = useState(false);
  const [note, setNote] = useState('');
  const [advance, setAdvance] = useState<PaymentDraft>(() => emptyPayment(today));
  const request = useRequestId();
  const action = useAction();

  const priced = useMemo(() => priceLines(lines, (id) => itemById(session, id), {}), [lines, session]);
  const filled = priced.lines.filter((p) => !p.empty);
  const days = creditDays.trim() === '' ? null : Number(creditDays);
  const daysOk = days === null || (Number.isInteger(days) && days >= 0 && days <= 3650);
  const advanceProblem = paymentProblem(advance, { max: priced.total, maxLabel: `the order total (${formatMoney(priced.total)})` });
  const problems = [
    !customer && 'Choose the customer.',
    !locationId && 'Choose the location taking the order.',
    filled.length === 0 && 'Add at least one item.',
    filled.some((p) => p.problem) && 'Fix the lines marked in amber.',
    !daysOk && 'Credit days must be a whole number from 0 to 3650.',
    expected && expected < date && "The expected date can't be before the order date.",
    advanceProblem,
  ].filter((x): x is string => Boolean(x));
  const blocked = Boolean(customer?.blocked);
  const ready = problems.length === 0 && !blocked;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !customer || action.busy) return;
    const header: SaleOrderHeader = {
      request_id: request.id,
      customer_id: customer.customer_id,
      sale_location_id: locationId,
      expected_date: expected || null,
      credit_days: days,
      note: note.trim() || null,
    };
    if (canBackdate && date !== today) header.order_date = date;
    let id = '';
    const ok = await action.run(async () => {
      const res = await createSaleOrder(
        header,
        filled.map((p) => {
          const { item_id, quantity, unit, rate, discount_type, discount_value } = toPayload(p, locationId, false);
          return { item_id, quantity, unit, rate, discount_type, discount_value };
        }),
        toPaymentNow(advance),
      );
      id = res.id;
    });
    if (ok && id) {
      request.renew();
      go(`orders/${id}/print`, { auto: '1' });
    }
  };

  return (
    <>
      <h1 className="page-title">New sale order</h1>
      <p className="page-sub">For goods to be made or delivered later. Deliveries are made from the order with "Deliver".</p>
      <form onSubmit={submit} noValidate className="stack">
        <div className="card">
          <div className="form-grid">
            <div className="field span-2">
              <span className="label">Customer</span>
              {customer ? (
                <CustomerCard customer={customer} onChange={() => setCustomer(null)} />
              ) : (
                <CustomerSearch
                  id="so-customer"
                  canAdd={session.can('add_customer')}
                  onSelect={(c) => {
                    setCustomer(c);
                    if (c.payment_terms_days !== null) setCreditDays(String(c.payment_terms_days));
                  }}
                />
              )}
            </div>
            {blocked && customer && (
              <div className="span-2">
                <Banner kind="warn">
                  Blocked{customer.block_reason ? `: ${customer.block_reason}` : ''}. No sales or orders until the owner unblocks them.
                </Banner>
              </div>
            )}
            <div className="field">
              <label htmlFor="so-location">Location taking the order</label>
              <LocationSelect id="so-location" locations={session.locations} value={locationId} onChange={setLocationId} />
            </div>
            <div className="field">
              {canBackdate ? (
                <>
                  <label htmlFor="so-date">Order date</label>
                  <input id="so-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                </>
              ) : (
                <>
                  <span className="label">Order date</span>
                  <div className="ns-static">{formatDate(today)}</div>
                </>
              )}
            </div>
            <div className="field">
              <label htmlFor="so-expected">Expected delivery (optional)</label>
              <input id="so-expected" type="date" value={expected} min={date} onChange={(e) => setExpected(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="so-days">Credit days for the deliveries</label>
              <input id="so-days" type="number" min={0} max={3650} step={1} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="so-note">Note (optional)</label>
              <input id="so-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ns-lines-head">
            <div className="section-title">Items</div>
            <label className="checkbox">
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
              Show raw materials
            </label>
          </div>
          <LineEditor
            session={session}
            lines={lines}
            priced={priced.lines}
            onChange={setLines}
            mode="order"
            categories={showRaw ? [...SELLABLE, ...RAW_MATERIALS] : SELLABLE}
            saleLocationId={locationId}
          />
          <div className="totals totals-gap">
            <span className="total-label">Subtotal</span>
            <span className="total-value">{formatMoney(priced.subtotal)}</span>
            {priced.lineDiscounts > 0 && (
              <>
                <span className="total-label">Discounts</span>
                <span className="total-value">− {formatMoney(priced.lineDiscounts)}</span>
              </>
            )}
            <span className="total-label grand">Order total</span>
            <span className="total-value grand">{formatMoney(priced.total)}</span>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Advance (optional)</div>
          <p className="sub card-intro">Money taken now against this order. It is used first when the order is delivered.</p>
          <PaymentFields idPrefix="so-adv" value={advance} onChange={setAdvance} amountLabel="Advance amount" />
          <ErrorBanner error={action.failure} />
          {!ready && problems.length > 0 && (customer || filled.length > 0) && <p className="sub ns-problems">{problems[0]}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
              {action.busy ? 'Saving…' : 'Save and print order'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

export default SaleOrderNewPage;

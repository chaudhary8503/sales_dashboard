import { useMemo, useState, type FormEvent } from 'react';
import { getCustomerOverview, getDocument, recordSale, type CashVia, type Customer, type Method, type SaleHeader, type SaleOrderDoc } from '../api';
import BundlePicker from '../components/BundlePicker';
import { Banner, CUSTOMERS_NOT_LIVE, ErrorBanner, Loading, LocationSelect } from '../components/Common';
import CustomerSearch, { CustomerCard } from '../components/CustomerSearch';
import LineEditor from '../components/LineEditor';
import StockPanel from '../components/StockPanel';
import { bundleNoFromError } from '../errors';
import { addDays, formatDate, formatMoney, round2 } from '../format';
import { storageGet, storageSet, useAction, useAsync, useRequestId } from '../hooks';
import { newLine, priceLines, RAW_MATERIALS, SELLABLE, toPayload, type DraftLine } from '../lines';
import { go, href } from '../router';
import { itemById, locationName, locationTaxRegistered, type Session } from '../session';
import { fromBase } from '../units';
import './NewSalePage.css';

const LAST_LOCATION_KEY = 'sales:lastLocation';

/** New sale, or a delivery against a sale order (#/new-sale?order=<id>). */
function NewSalePage({ session, orderId, customerId }: { session: Session; orderId: string | null; customerId: string | null }) {
  const order = useAsync(() => (orderId ? getDocument('sale_order', orderId) : Promise.resolve(null)), [orderId]);
  // "New sale for this customer" from the customer page.
  const preset = useAsync(
    () => (customerId && !orderId && session.customersLive ? getCustomerOverview(customerId).then((o) => o.customer) : Promise.resolve(null)),
    [customerId, orderId],
  );
  if (orderId && order.loading && !order.data) return <Loading />;
  if (orderId && (order.error || !order.data)) return <Banner kind="error">{order.error ?? 'Sale order not found.'}</Banner>;
  if (customerId && preset.loading && preset.data === undefined) return <Loading />;
  return (
    <SaleForm
      key={`${orderId ?? 'new'}-${preset.data?.customer_id ?? ''}`}
      session={session}
      order={order.data ?? null}
      presetCustomer={preset.data ?? null}
    />
  );
}

interface PayNow {
  amount: string;
  method: Method;
  reference: string;
  chequeNo: string;
  chequeBank: string;
  chequeDate: string;
}

function initialLines(session: Session, order: SaleOrderDoc | null): DraftLine[] {
  if (!order) return [newLine()];
  const lines = order.lines
    .map((ol) => {
      const item = itemById(session, ol.item_id);
      const remainingBase = Math.round((ol.base_qty - ol.delivered_base_qty) * 1000) / 1000;
      if (remainingBase <= 0) return null;
      const qty = item ? fromBase(item, remainingBase, ol.entered_unit) : remainingBase / ol.factor_to_base;
      const share = ol.base_qty > 0 ? remainingBase / ol.base_qty : 1;
      return newLine({
        itemId: ol.item_id,
        qty: String(Math.round(qty * 1000) / 1000),
        unit: ol.entered_unit,
        rate: String(ol.rate),
        discType: ol.discount_type ?? 'amount',
        discValue:
          ol.discount_amount > 0 ? String(ol.discount_type === 'percent' ? ol.discount_value : round2(ol.discount_amount * share)) : '',
        saleOrderLineId: ol.id,
        orderRemainingBase: remainingBase,
      });
    })
    .filter((l): l is DraftLine => l !== null);
  return lines.length ? lines : [newLine()];
}

function SaleForm({ session, order, presetCustomer }: { session: Session; order: SaleOrderDoc | null; presetCustomer: Customer | null }) {
  const today = session.today;
  const canCredit = session.can('credit_sale') && session.customersLive;
  const canBackdate = session.can('backdate_sale');
  const canDiscount = session.can('give_discount');

  const advance = order
    ? round2(order.advances.filter((a) => a.status === 'cleared' || a.status === 'pending').reduce((s, a) => s + a.available, 0))
    : 0;

  const [locationId, setLocationId] = useState(() => {
    if (order) return order.sale_location_id;
    const last = storageGet(LAST_LOCATION_KEY);
    if (last && session.locations.some((l) => l.location_id === last)) return last;
    return session.locations.length === 1 ? session.locations[0].location_id : '';
  });
  const [date, setDate] = useState(today);
  const [payType, setPayType] = useState<'cash' | 'credit'>(order && advance > 0 ? 'credit' : 'cash');
  const [customer, setCustomer] = useState<Customer | null>(() =>
    order
      ? {
          customer_id: order.customer_id,
          customer_code: order.customer_code,
          name: order.customer_name,
          business_name: null,
          phone: order.customer_phone,
          city: null,
          payment_terms_days: order.credit_days,
          balance: null,
          blocked: false,
          block_reason: null,
        }
      : presetCustomer,
  );
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [cashVia, setCashVia] = useState<CashVia>('cash');
  const [cashRef, setCashRef] = useState('');
  const [creditDays, setCreditDays] = useState(
    order ? String(order.credit_days) : presetCustomer?.payment_terms_days != null ? String(presetCustomer.payment_terms_days) : '',
  );
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines(session, order));
  const [showRaw, setShowRaw] = useState(false);
  const [invDiscType, setInvDiscType] = useState<'amount' | 'percent'>('amount');
  const [invDiscValue, setInvDiscValue] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState<PayNow>({ amount: '', method: 'cash', reference: '', chequeNo: '', chequeBank: '', chequeDate: today });
  const [picker, setPicker] = useState<{ key: number; notice: string | null } | null>(null);
  const [stockTick, setStockTick] = useState(0);
  const request = useRequestId();
  const action = useAction();

  const taxRate = locationTaxRegistered(session, locationId) ? (session.settings.default_tax_rate ?? 0) : 0;
  const priced = useMemo(
    () =>
      priceLines(lines, (id) => itemById(session, id), {
        invoiceDiscType: invDiscType,
        invoiceDiscValue: canDiscount ? invDiscValue : '',
        taxRate,
      }),
    [lines, session, invDiscType, invDiscValue, canDiscount, taxRate],
  );

  const filled = priced.lines.filter((p) => !p.empty);
  const needs = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of filled) {
      const key = `${p.line.itemId}|${p.line.sourceId || locationId}`;
      m.set(key, (m.get(key) ?? 0) + (p.baseQty ?? 0));
    }
    return m;
  }, [filled, locationId]);

  const credit = payType === 'credit';
  const days = creditDays.trim() === '' ? null : Number(creditDays);
  const daysOk = !credit || (days !== null && Number.isInteger(days) && days >= 0 && days <= 3650);
  const payAmount = pay.amount.trim() === '' ? 0 : Number(pay.amount);
  const payProblem = !credit
    ? null
    : !Number.isFinite(payAmount) || payAmount < 0
      ? 'The amount received now is not valid.'
      : payAmount > priced.total
        ? `The amount received now can't be more than the total (${formatMoney(priced.total)}).`
        : payAmount > 0 && pay.method === 'cheque' && !pay.chequeNo.trim()
          ? 'Enter the cheque number.'
          : null;
  const blocked = Boolean(customer?.blocked);
  const problems = [
    !locationId && 'Choose the sale location.',
    filled.length === 0 && 'Add at least one item.',
    filled.some((p) => p.problem) && 'Fix the lines marked in amber.',
    priced.invoiceDiscountProblem,
    credit && !customer && 'A credit sale needs a named customer.',
    credit && !daysOk && 'Credit days must be a whole number from 0 to 3650.',
    payProblem,
    date > today && 'Future dates are not allowed.',
    order && advance > 0 && !canCredit && 'This order has an advance, so the delivery must be a credit sale, which you are not allowed to make.',
  ].filter((x): x is string => Boolean(x));
  const ready = problems.length === 0 && !blocked;

  const chooseCustomer = (c: Customer | null) => {
    setCustomer(c);
    if (c?.payment_terms_days !== null && c?.payment_terms_days !== undefined) setCreditDays(String(c.payment_terms_days));
    if (!c) setPayType('cash');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || action.busy) return;
    const header: SaleHeader = {
      request_id: request.id,
      sale_location_id: locationId,
      payment_type: payType,
      customer_id: customer?.customer_id ?? null,
      invoice_discount_type: canDiscount && Number(invDiscValue) > 0 ? invDiscType : null,
      invoice_discount_value: canDiscount && invDiscValue.trim() !== '' ? Number(invDiscValue) : 0,
      note: note.trim() || null,
    };
    if (canBackdate && date !== today) header.invoice_date = date;
    if (credit) header.credit_days = days;
    else {
      header.cash_paid_via = cashVia;
      header.cash_reference = cashRef.trim() || null;
    }
    if (!customer) {
      header.walk_in_name = walkInName.trim() || null;
      header.walk_in_phone = walkInPhone.trim() || null;
    }
    if (order) header.sale_order_id = order.id;
    const payment =
      credit && payAmount > 0
        ? {
            amount: payAmount,
            method: pay.method,
            reference: pay.reference.trim() || null,
            cheque_no: pay.method === 'cheque' ? pay.chequeNo.trim() : null,
            cheque_bank: pay.method === 'cheque' ? pay.chequeBank.trim() || null : null,
            cheque_date: pay.method === 'cheque' ? pay.chequeDate || null : null,
          }
        : null;

    let result: { id: string } | null = null;
    const ok = await action.run(async () => {
      result = await recordSale(header, filled.map((p) => toPayload(p, locationId, true)), payment);
    });
    if (ok && result) {
      storageSet(LAST_LOCATION_KEY, locationId);
      request.renew();
      setStockTick((t) => t + 1);
      go(`invoices/${(result as { id: string }).id}/print`, { format: session.settings.default_receipt_format, auto: '1' });
    }
  };

  // A bundle the seller chose turned out shorter: re-open the picker on that line.
  const failure = action.failure;
  const onFailureBundle = failure?.hint === 'bundle_short' ? bundleNoFromError(failure) : null;
  const shortLine = onFailureBundle ? lines.find((l) => l.bundles.some((b) => b.bundle_no === onFailureBundle)) : undefined;

  const pickerLine = picker ? lines.find((l) => l.key === picker.key) : undefined;
  const pickerPriced = picker ? priced.lines.find((p) => p.line.key === picker.key) : undefined;
  const pickerItem = pickerLine ? itemById(session, pickerLine.itemId) : undefined;
  const pickerSource = pickerLine ? pickerLine.sourceId || locationId : '';

  const categories = showRaw ? [...SELLABLE, ...RAW_MATERIALS] : SELLABLE;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{order ? `Deliver sale order ${order.sale_order_no}` : 'New sale'}</h1>
          <p className="page-sub">
            {order ? (
              <>
                Delivering to {order.customer_name}. <a href={href(`orders/${order.id}`)}>Back to the order</a>
              </>
            ) : (
              'Pick the items, enter quantities and rates, then post. The invoice opens ready to print.'
            )}
          </p>
        </div>
      </div>

      {!session.customersLive && <Banner kind="info">{CUSTOMERS_NOT_LIVE}</Banner>}

      <form onSubmit={submit} noValidate className="new-sale">
        <div className="card ns-head">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ns-location">Sale location</label>
              <LocationSelect
                id="ns-location"
                locations={session.locations}
                value={locationId}
                disabled={Boolean(order)}
                onChange={(id) => {
                  setLocationId(id);
                  setLines((ls) => ls.map((l) => ({ ...l, bundles: l.sourceId ? l.bundles : [] })));
                }}
              />
            </div>
            <div className="field">
              {canBackdate ? (
                <>
                  <label htmlFor="ns-date">Date</label>
                  <input id="ns-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                </>
              ) : (
                <>
                  <span className="label">Date</span>
                  <div className="ns-static">{formatDate(today)}</div>
                </>
              )}
            </div>

            {canCredit && (
              <div className="field">
                <span className="label">Payment</span>
                <div className="segmented" role="group" aria-label="Cash or credit">
                  <button
                    type="button"
                    aria-pressed={!credit}
                    disabled={Boolean(order && advance > 0)}
                    onClick={() => setPayType('cash')}
                  >
                    Cash
                  </button>
                  <button type="button" aria-pressed={credit} onClick={() => setPayType('credit')}>
                    Credit
                  </button>
                </div>
              </div>
            )}

            {session.customersLive && (
              <div className="field span-2">
                <span className="label">Customer{credit ? '' : ' (optional for cash)'}</span>
                {customer ? (
                  <CustomerCard customer={customer} onChange={order ? undefined : () => chooseCustomer(null)} />
                ) : (
                  <CustomerSearch id="ns-customer" canAdd={session.can('add_customer')} onSelect={chooseCustomer} />
                )}
              </div>
            )}
            {blocked && customer && (
              <div className="span-2">
                <Banner kind="warn">
                  Blocked{customer.block_reason ? `: ${customer.block_reason}` : ''}. No sales or orders until the owner unblocks them.
                </Banner>
              </div>
            )}

            {!customer && (
              <>
                <div className="field">
                  <label htmlFor="ns-walkin">Walk-in name (optional)</label>
                  <input id="ns-walkin" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Walk-in customer" />
                </div>
                <div className="field">
                  <label htmlFor="ns-walkin-phone">Phone (optional)</label>
                  <input id="ns-walkin-phone" type="tel" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
                </div>
              </>
            )}

            {credit ? (
              <div className="field">
                <label htmlFor="ns-days">Credit days</label>
                <input
                  id="ns-days"
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={creditDays}
                  onChange={(e) => setCreditDays(e.target.value)}
                />
                {daysOk && days !== null && <div className="hint">Due on {formatDate(addDays(date, days))}</div>}
              </div>
            ) : (
              <div className="field">
                <label htmlFor="ns-via">Paid by</label>
                <div className="inline-input">
                  <select id="ns-via" value={cashVia} onChange={(e) => setCashVia(e.target.value as CashVia)}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="online">Online</option>
                  </select>
                  <input
                    aria-label="Reference (optional)"
                    placeholder="Reference (optional)"
                    value={cashRef}
                    onChange={(e) => setCashRef(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          {order && advance > 0 && (
            <Banner kind="info">
              The advance of {formatMoney(advance)} is used first; enter anything else received under "amount received now".
            </Banner>
          )}
        </div>

        <div className="card ns-lines">
          <div className="ns-lines-head">
            <div className="section-title">Items</div>
            {!order && (
              <label className="checkbox">
                <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
                Show raw materials
              </label>
            )}
          </div>
          <LineEditor
            session={session}
            lines={lines}
            priced={priced.lines}
            onChange={setLines}
            mode="invoice"
            categories={categories}
            saleLocationId={locationId}
            onChooseBundles={(key) => setPicker({ key, notice: null })}
          />
        </div>

        <div className="ns-stock">
          <StockPanel session={session} itemIds={filled.map((p) => p.line.itemId)} needs={needs} refreshKey={stockTick} />
        </div>

        <div className="card ns-totals">
          {canDiscount && (
            <div className="field ns-invdisc">
              <label htmlFor="ns-invdisc">Invoice discount</label>
              <div className="inline-input">
                <input
                  id="ns-invdisc"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={invDiscValue}
                  onChange={(e) => setInvDiscValue(e.target.value)}
                />
                <select aria-label="Invoice discount type" value={invDiscType} onChange={(e) => setInvDiscType(e.target.value as 'amount' | 'percent')}>
                  <option value="amount">Rs</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>
          )}

          <div className="totals">
            <span className="total-label">Subtotal</span>
            <span className="total-value">{formatMoney(priced.subtotal)}</span>
            {priced.lineDiscounts > 0 && (
              <>
                <span className="total-label">Line discounts</span>
                <span className="total-value">− {formatMoney(priced.lineDiscounts)}</span>
              </>
            )}
            {priced.invoiceDiscount > 0 && (
              <>
                <span className="total-label">Invoice discount</span>
                <span className="total-value">− {formatMoney(priced.invoiceDiscount)}</span>
              </>
            )}
            {taxRate > 0 && (
              <>
                <span className="total-label">Sales tax ({taxRate}%)</span>
                <span className="total-value">{formatMoney(priced.tax)}</span>
              </>
            )}
            <span className="total-label grand">Total</span>
            <span className="total-value grand">{formatMoney(priced.total)}</span>
          </div>
          <p className="table-note">Totals are a preview; the server works them out again when you post.</p>

          {credit && (
            <div className="ns-paynow">
              <div className="section-title">Amount received now</div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="ns-pay-amount">Amount</label>
                  <input
                    id="ns-pay-amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={pay.amount}
                    onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ns-pay-method">Method</label>
                  <select id="ns-pay-method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as Method })}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="online">Online</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                {pay.method === 'cheque' ? (
                  <>
                    <div className="field">
                      <label htmlFor="ns-cheque-no">Cheque number</label>
                      <input id="ns-cheque-no" value={pay.chequeNo} onChange={(e) => setPay({ ...pay, chequeNo: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor="ns-cheque-bank">Bank</label>
                      <input id="ns-cheque-bank" value={pay.chequeBank} onChange={(e) => setPay({ ...pay, chequeBank: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor="ns-cheque-date">Cheque date</label>
                      <input id="ns-cheque-date" type="date" value={pay.chequeDate} onChange={(e) => setPay({ ...pay, chequeDate: e.target.value })} />
                      <div className="hint">A cheque counts only when it is cleared.</div>
                    </div>
                  </>
                ) : (
                  <div className="field">
                    <label htmlFor="ns-pay-ref">Reference (optional)</label>
                    <input id="ns-pay-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="field ns-note">
            <label htmlFor="ns-note">Note (optional)</label>
            <input id="ns-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <ErrorBanner error={failure} />
          {shortLine && (
            <div className="form-actions ns-retry">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setPicker({ key: shortLine.key, notice: failure?.message ?? null })}>
                Change the bundles on that line
              </button>
            </div>
          )}
          {!ready && filled.length > 0 && problems.length > 0 && <p className="sub ns-problems">{problems[0]}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
              {action.busy ? 'Posting…' : `Post ${credit ? 'credit' : 'cash'} sale`}
            </button>
            <span className="sub">
              {locationId ? `At ${locationName(session, locationId)}` : ''}
              {customer ? ` · ${customer.name}` : ' · Walk-in'}
            </span>
          </div>
        </div>
      </form>

      {picker && pickerLine && pickerItem && (
        <BundlePicker
          item={pickerItem}
          locationId={pickerSource}
          locationName={locationName(session, pickerSource)}
          lineFt={pickerPriced?.baseQty ?? null}
          value={pickerLine.bundles}
          notice={picker.notice}
          onClose={() => setPicker(null)}
          onApply={(bundles) => {
            setLines((ls) => ls.map((l) => (l.key === picker.key ? { ...l, bundles } : l)));
            setPicker(null);
            if (failure?.hint === 'bundle_short') action.clear();
          }}
        />
      )}
    </>
  );
}

export default NewSalePage;

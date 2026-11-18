import { useState, type FormEvent } from 'react';
import { getDocument, recordCreditNote, type CreditNoteHeader, type InvoiceDoc, type Method, type Settlement } from '../api';
import { Banner, ErrorBanner, Loading, LocationSelect } from '../components/Common';
import { formatDate, formatEntered, formatMoney, formatNumber, round2 } from '../format';
import { useAction, useAsync, useRequestId } from '../hooks';
import { go, href } from '../router';
import type { Session } from '../session';

interface LineDraft {
  qty: string;
  restock: boolean;
  /** '' = follow the header's return location. */
  locationId: string;
  backToBundle: boolean;
}

/** Accept goods back against one invoice (#/returns/new?invoice=<id>). */
function ReturnNewPage({ session, invoiceId }: { session: Session; invoiceId: string | null }) {
  const { data: inv, error, loading } = useAsync(
    () => (invoiceId ? getDocument('invoice', invoiceId) : Promise.reject(new Error('Open the invoice and press Return.'))),
    [invoiceId],
  );
  if (loading && !inv) return <Loading />;
  if (error || !inv) return <Banner kind="error">{error ?? 'Invoice not found.'}</Banner>;
  if (inv.status !== 'posted') return <Banner kind="warn">Invoice {inv.invoice_no} is cancelled, so nothing can be returned against it.</Banner>;
  if (inv.source !== 'system') return <Banner kind="warn">Returns against imported history aren't supported.</Banner>;
  return <ReturnForm session={session} inv={inv} />;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function settlementChoices(inv: InvoiceDoc): { value: Settlement; label: string; hint: string }[] {
  if (inv.payment_type === 'credit')
    return [
      {
        value: 'reduce_balance',
        label: 'Reduce the balance',
        hint: 'The return comes off what the customer owes on this invoice. Anything beyond that becomes an advance.',
      },
      {
        value: 'cash_refund',
        label: 'Reduce the balance and pay the rest back now',
        hint: 'What is still owed on this invoice is reduced first; the rest is paid back to the customer now.',
      },
    ];
  if (!inv.customer_id) return [{ value: 'cash_refund', label: 'Pay back now', hint: 'A walk-in customer is paid back on the spot.' }];
  return [
    { value: 'cash_refund', label: 'Pay back now', hint: 'The customer is paid back on the spot.' },
    { value: 'keep_as_advance', label: 'Keep as advance', hint: "The value is kept on the customer's account to use on a later sale." },
  ];
}

function ReturnForm({ session, inv }: { session: Session; inv: InvoiceDoc }) {
  const today = session.today;
  const canBackdate = session.can('backdate_sale');
  const choices = settlementChoices(inv);
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState(inv.sale_location_id);
  const [reason, setReason] = useState('');
  const [settlement, setSettlement] = useState<Settlement>(choices[0].value);
  const [refundMethod, setRefundMethod] = useState<Method>('cash');
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(inv.lines.map((l) => [l.id, { qty: '', restock: true, locationId: '', backToBundle: true }])),
  );
  const request = useRequestId();
  const action = useAction();

  const rows = inv.lines.map((l) => {
    const d = lines[l.id];
    const leftBase = r3(l.base_qty - l.returned_base_qty);
    const leftQty = r3(leftBase / l.factor_to_base);
    const qty = d.qty.trim() === '' ? 0 : Number(d.qty);
    const base = r3(qty * l.factor_to_base);
    let problem: string | null = null;
    if (!Number.isFinite(qty) || qty < 0) problem = 'Not a valid quantity.';
    else if ((d.qty.split('.')[1]?.length ?? 0) > 3) problem = 'At most 3 decimals.';
    else if (base > leftBase + 0.0005) problem = `Only ${formatNumber(leftQty)} ${l.entered_unit} can still be returned.`;
    // Same share of the sold line's value as the server (the last piece takes what is left).
    const value = qty > 0 ? round2(base >= leftBase - 0.0005 ? l.line_total - round2((l.line_total * l.returned_base_qty) / l.base_qty) : (l.line_total * base) / l.base_qty) : 0;
    return { l, d, leftBase, leftQty, qty, base, value, problem };
  });
  const chosen = rows.filter((r) => r.qty > 0);
  const total = round2(chosen.reduce((s, r) => s + r.value, 0));
  const owed = inv.balance ? Math.max(round2(inv.balance.total - inv.balance.paid - inv.balance.pending - inv.balance.credited), 0) : 0;
  const offInvoice = inv.payment_type === 'credit' ? Math.min(owed, total) : 0;
  const payBack = inv.payment_type === 'credit' ? (settlement === 'cash_refund' ? round2(total - offInvoice) : 0) : settlement === 'cash_refund' ? total : 0;
  const advance = inv.payment_type === 'credit' ? (settlement === 'reduce_balance' ? round2(total - offInvoice) : 0) : settlement === 'keep_as_advance' ? total : 0;

  const problems = [
    chosen.length === 0 && 'Enter a quantity on at least one line.',
    rows.some((r) => r.problem) && 'Fix the quantities marked in amber.',
    !reason.trim() && 'Give a reason for the return.',
    !locationId && 'Choose where the goods are returned.',
    inv.payment_type === 'credit' && settlement === 'cash_refund' && chosen.length > 0 && payBack <= 0 &&
      'Nothing to pay back: the return only reduces what is still owed. Choose "Reduce the balance".',
    !session.customersLive && (inv.payment_type === 'credit' || settlement === 'keep_as_advance') &&
      'Customer accounts start when Customer Management goes live.',
    date < inv.invoice_date && "A return can't be dated before its invoice.",
  ].filter((x): x is string => Boolean(x));
  const ready = problems.length === 0;
  const set = (id: string, patch: Partial<LineDraft>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || action.busy) return;
    const header: CreditNoteHeader = {
      request_id: request.id,
      location_id: locationId,
      reason: reason.trim(),
      settlement,
      refund_method: settlement === 'cash_refund' ? refundMethod : null,
    };
    if (canBackdate && date !== today) header.credit_date = date;
    let id = '';
    const ok = await action.run(async () => {
      const res = await recordCreditNote(
        inv.id,
        header,
        chosen.map((r) => ({
          invoice_line_id: r.l.id,
          quantity: r.qty,
          restock: r.d.restock,
          return_location_id: r.d.restock ? r.d.locationId || locationId : null,
          back_to_bundle: r.l.category === 'finished_cable' ? r.d.backToBundle : false,
        })),
      );
      id = res.id;
    });
    if (ok && id) {
      request.renew();
      go(`credit-notes/${id}/print`, { auto: '1' });
    }
  };

  return (
    <>
      <h1 className="page-title">Return against {inv.invoice_no}</h1>
      <p className="page-sub">
        {inv.payment_type === 'credit' ? 'Credit sale' : 'Cash sale'} on {formatDate(inv.invoice_date)} to{' '}
        {inv.customer_name ?? (inv.walk_in_name || 'a walk-in customer')}. <a href={href(`invoices/${inv.id}`)}>Back to the invoice</a>
      </p>
      <form onSubmit={submit} noValidate className="stack">
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rt-loc">Returned at</label>
              <LocationSelect id="rt-loc" locations={session.locations} value={locationId} onChange={setLocationId} />
              <div className="hint">Lines put back into stock go here unless you choose another location on the line.</div>
            </div>
            <div className="field">
              {canBackdate ? (
                <>
                  <label htmlFor="rt-date">Return date</label>
                  <input id="rt-date" type="date" value={date} min={inv.invoice_date} max={today} onChange={(e) => setDate(e.target.value)} />
                </>
              ) : (
                <>
                  <span className="label">Return date</span>
                  <div className="ns-static">{formatDate(today)}</div>
                </>
              )}
            </div>
            <div className="field span-2">
              <label htmlFor="rt-reason">Reason</label>
              <input id="rt-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong size delivered" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">What comes back</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Sold</th>
                  <th className="num">Already returned</th>
                  <th>Return now</th>
                  <th>Back into stock</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.l.id}>
                    <td className="wrap">
                      <div>{r.l.invoice_name}</div>
                      {r.l.item_name !== r.l.invoice_name && <div className="sub">{r.l.item_name}</div>}
                    </td>
                    <td className="num">{formatEntered(r.l.entered_qty, r.l.entered_unit, r.l.base_qty, r.l.base_unit)}</td>
                    <td className="num">
                      {r.l.returned_base_qty > 0 ? `${formatNumber(r3(r.l.returned_base_qty / r.l.factor_to_base))} ${r.l.entered_unit}` : '—'}
                    </td>
                    <td>
                      {r.leftBase > 0 ? (
                        <div className="inline-input return-qty">
                          <input
                            className="cell-input narrow"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={r.leftQty}
                            step="any"
                            aria-label={`Return quantity for ${r.l.invoice_name}`}
                            value={r.d.qty}
                            onChange={(e) => set(r.l.id, { qty: e.target.value })}
                          />
                          <span className="unit-label">{r.l.entered_unit}</span>
                          <button type="button" className="link-btn" onClick={() => set(r.l.id, { qty: String(r.leftQty) })}>
                            All {formatNumber(r.leftQty)}
                          </button>
                        </div>
                      ) : (
                        <span className="sub">All returned</span>
                      )}
                      {r.problem && <div className="sub amber">{r.problem}</div>}
                    </td>
                    <td className="wrap">
                      {r.qty > 0 && (
                        <div className="return-options">
                          <label className="checkbox">
                            <input type="checkbox" checked={r.d.restock} onChange={(e) => set(r.l.id, { restock: e.target.checked })} />
                            Put back into stock
                          </label>
                          {!r.d.restock && <span className="sub">Damaged: not put back</span>}
                          {r.d.restock && (
                            <LocationSelect
                              locations={session.locations}
                              value={r.d.locationId || locationId}
                              onChange={(id) => set(r.l.id, { locationId: id === locationId ? '' : id })}
                              ariaLabel={`Return location for ${r.l.invoice_name}`}
                            />
                          )}
                          {r.d.restock && r.l.category === 'finished_cable' && (
                            <label className="checkbox">
                              <input type="checkbox" checked={r.d.backToBundle} onChange={(e) => set(r.l.id, { backToBundle: e.target.checked })} />
                              Back onto the original bundle
                            </label>
                          )}
                          {r.d.restock && r.l.category === 'finished_cable' && !r.d.backToBundle && <span className="sub">A new bundle is made</span>}
                        </div>
                      )}
                    </td>
                    <td className="num mono">{r.qty > 0 ? formatMoney(r.value) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">Values are the same share of each sold line (after discounts). The server works them out again.</p>
        </div>

        <div className="card">
          <div className="section-title">Settlement</div>
          <div className="settle-choices" role="radiogroup" aria-label="Settlement">
            {choices.map((c) => (
              <label key={c.value} className={`settle-choice${settlement === c.value ? ' on' : ''}`}>
                <input type="radio" name="settlement" checked={settlement === c.value} onChange={() => setSettlement(c.value)} />
                <span>
                  <strong>{c.label}</strong>
                  <span className="sub">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {settlement === 'cash_refund' && (
            <div className="field narrow-field">
              <label htmlFor="rt-method">Paid back by</label>
              <select id="rt-method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as Method)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="online">Online</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          )}
          <div className="totals totals-gap">
            <span className="total-label grand">Return value</span>
            <span className="total-value grand">{formatMoney(total)}</span>
            {inv.payment_type === 'credit' && (
              <>
                <span className="total-label">Off this invoice (still owed {formatMoney(owed)})</span>
                <span className="total-value">{formatMoney(offInvoice)}</span>
              </>
            )}
            {payBack > 0 && (
              <>
                <span className="total-label">Paid back now</span>
                <span className="total-value">{formatMoney(payBack)}</span>
              </>
            )}
            {advance > 0 && (
              <>
                <span className="total-label">Kept as advance</span>
                <span className="total-value">{formatMoney(advance)}</span>
              </>
            )}
          </div>
          <ErrorBanner error={action.failure} />
          {!ready && (chosen.length > 0 || reason) && <p className="sub ns-problems">{problems[0]}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
              {action.busy ? 'Saving…' : 'Accept return and print'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

export default ReturnNewPage;

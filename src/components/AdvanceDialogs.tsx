import { useState, type FormEvent } from 'react';
import { allocateAdvance, getCustomerOverview, recordRefund, type Method, type RefundPayload } from '../api';
import { formatDate, formatMoney } from '../format';
import { storageGet, useAction, useAsync, useRequestId } from '../hooks';
import { allocatedTotal, allocationProblem, suggestAllocations } from '../payments';
import type { Session } from '../session';
import AllocationTable from './AllocationTable';
import { Banner, ErrorBanner, Loading, LocationSelect, Modal } from './Common';

export type AdvanceSource = { paymentId: string } | { creditNoteId: string };

interface AllocateProps {
  session: Session;
  customerId: string;
  source: AdvanceSource;
  /** Payment or credit note number. */
  label: string;
  available: number;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Use an advance against open invoices: oldest first unless the amounts are changed. */
export function AllocateDialog({ session, customerId, source, label, available, onClose, onDone }: AllocateProps) {
  const overview = useAsync(() => getCustomerOverview(customerId), [customerId]);
  const invoices = overview.data?.open_invoices ?? [];
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const shown = values ?? suggestAllocations(invoices, available);
  const problem = allocationProblem(invoices, shown, available);
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    const list = values
      ? invoices.map((i) => ({ invoice_id: i.invoice_id, amount: Number(values[i.invoice_id] || 0) })).filter((a) => a.amount > 0)
      : null;
    const ok = await action.run(async () => {
      const res = await allocateAdvance(source, list);
      onDone(`${formatMoney(res.allocated)} of ${label} used against invoices. ${formatMoney(res.left)} is still unused.`);
    });
    if (ok) onClose();
  };

  return (
    <Modal title={`Use ${label} against invoices`} onClose={onClose} wide>
      <div className="modal-explain">
        {formatMoney(available)} is unused. It is spread over the open invoices oldest first; change the amounts to choose.
      </div>
      <ErrorBanner error={action.failure} />
      <Banner kind="error">{overview.error}</Banner>
      {overview.loading && !overview.data ? (
        <Loading />
      ) : (
        <form onSubmit={submit} noValidate>
          <AllocationTable
            invoices={invoices}
            values={shown}
            onChange={setValues}
            available={available}
            suggested={values === null}
            onReset={() => setValues(null)}
            today={session.today}
          />
          {problem && <div className="field-problem">{problem}</div>}
          <div className="form-actions modal-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={Boolean(problem) || action.busy || invoices.length === 0 || allocatedTotal(shown) <= 0}
            >
              {action.busy ? 'Saving…' : 'Use against these invoices'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

interface RefundProps {
  session: Session;
  customerId: string;
  source: AdvanceSource;
  label: string;
  available: number;
  onClose: () => void;
  onDone: (refund: { id: string; number: string }) => void;
}

/** Pay an unused advance back to the customer. */
export function RefundDialog({ session, customerId, source, label, available, onClose, onDone }: RefundProps) {
  const today = session.today;
  const canBackdate = session.can('backdate_sale');
  const [amount, setAmount] = useState(String(available));
  const [method, setMethod] = useState<Method>('cash');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState(() => {
    const last = storageGet('sales:lastLocation');
    return last && session.locations.some((l) => l.location_id === last) ? last : '';
  });
  const [note, setNote] = useState('');
  const request = useRequestId();
  const action = useAction();

  const value = Number(amount);
  const problem =
    !Number.isFinite(value) || value <= 0
      ? 'Enter an amount greater than 0.'
      : value > available + 0.0001
        ? `Only ${formatMoney(available)} is unused.`
        : (amount.split('.')[1]?.length ?? 0) > 2
          ? 'The amount can have at most 2 decimals.'
          : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    const payload: RefundPayload = {
      request_id: request.id,
      amount: value,
      method,
      reference: reference.trim() || null,
      location_id: locationId || null,
      note: note.trim() || null,
      ...('paymentId' in source ? { source_payment_id: source.paymentId } : { source_credit_note_id: source.creditNoteId }),
    };
    if (canBackdate && date !== today) payload.refund_date = date;
    let result: { id: string; number: string } | null = null;
    const ok = await action.run(async () => {
      result = await recordRefund(customerId, payload);
    });
    if (ok && result) {
      request.renew();
      onDone(result);
    }
  };

  return (
    <Modal title={`Pay back from ${label}`} onClose={onClose}>
      <div className="modal-explain">{formatMoney(available)} is unused and can be paid back to the customer.</div>
      <ErrorBanner error={action.failure} />
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rf-amount">Amount</label>
            <input id="rf-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rf-method">Paid back by</label>
            <select id="rf-method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="online">Online</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rf-ref">Reference (optional)</label>
            <input id="rf-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rf-loc">Paid at (optional)</label>
            <LocationSelect id="rf-loc" locations={session.locations} value={locationId} onChange={setLocationId} placeholder="Not recorded" />
          </div>
          {canBackdate && (
            <div className="field">
              <label htmlFor="rf-date">Date</label>
              <input id="rf-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div className="field span-2">
            <label htmlFor="rf-note">Note (optional)</label>
            <input id="rf-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {problem && amount !== '' && <div className="field-problem">{problem}</div>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={Boolean(problem) || action.busy}>
            {action.busy ? 'Saving…' : `Pay back ${Number.isFinite(value) && value > 0 ? formatMoney(value) : ''}`}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
        {!canBackdate && <p className="table-note">Dated {formatDate(today)}.</p>}
      </form>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { bounceCheque, clearCheque } from '../api';
import { formatDate, formatMoney } from '../format';
import { useAction } from '../hooks';
import { ConfirmWithReason, ErrorBanner, Modal } from './Common';

export interface ChequeInfo {
  id: string;
  payment_no: string;
  customer_name: string;
  amount: number;
  cheque_no: string | null;
  payment_date: string;
}

/** Mark a pending cheque cleared on a date (not before it was received, not in the future). */
export function ClearChequeDialog({ cheque, today, onClose, onDone }: { cheque: ChequeInfo; today: string; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today);
  const action = useAction();
  const bad = date > today || date < cheque.payment_date;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (bad) return;
    const ok = await action.run(() => clearCheque(cheque.id, date));
    if (ok) onDone(`Cheque ${cheque.cheque_no ?? ''} (${cheque.payment_no}) is cleared and now counts on ${cheque.customer_name}'s account.`);
  };
  return (
    <Modal title={`Cheque ${cheque.cheque_no ?? ''} cleared`} onClose={onClose}>
      <div className="modal-explain">
        {formatMoney(cheque.amount)} from {cheque.customer_name} ({cheque.payment_no}). Once cleared, the payment counts against the invoices it
        settles.
      </div>
      <ErrorBanner error={action.failure} />
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="clr-date">Cleared on</label>
          <input id="clr-date" type="date" value={date} min={cheque.payment_date} max={today} onChange={(e) => setDate(e.target.value)} />
          <div className="hint">Received {formatDate(cheque.payment_date)}.</div>
        </div>
        <div className="form-actions modal-actions">
          <button type="submit" className="btn btn-primary" disabled={bad || action.busy}>
            {action.busy ? 'Saving…' : 'Mark cleared'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Mark a pending cheque bounced (needs a reason). Its allocations are released. */
export function BounceChequeDialog({ cheque, onClose, onDone }: { cheque: ChequeInfo; onClose: () => void; onDone: (m: string) => void }) {
  return (
    <ConfirmWithReason
      title={`Cheque ${cheque.cheque_no ?? ''} bounced?`}
      explain={`${formatMoney(cheque.amount)} from ${cheque.customer_name} (${cheque.payment_no}). The invoices it was settling become unpaid again.`}
      reasonLabel="Reason (e.g. insufficient funds)"
      confirmLabel="Mark bounced"
      onClose={onClose}
      onConfirm={async (reason) => {
        await bounceCheque(cheque.id, reason);
        onDone(`Cheque ${cheque.cheque_no ?? ''} (${cheque.payment_no}) is marked bounced.`);
      }}
    />
  );
}

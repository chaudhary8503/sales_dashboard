import type { Method } from '../api';
import type { PaymentDraft } from '../payments';

interface PaymentFieldsProps {
  idPrefix: string;
  value: PaymentDraft;
  onChange: (v: PaymentDraft) => void;
  amountLabel?: string;
  /** Hide the cheque option (e.g. refunds can still be by cheque, so default is shown). */
  methods?: Method[];
}

/** Amount, method and reference; cheque number, bank and date when the method is cheque. */
function PaymentFields({ idPrefix, value, onChange, amountLabel = 'Amount', methods = ['cash', 'bank_transfer', 'online', 'cheque'] }: PaymentFieldsProps) {
  const set = (patch: Partial<PaymentDraft>) => onChange({ ...value, ...patch });
  const labels: Record<Method, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', online: 'Online', cheque: 'Cheque' };
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${idPrefix}-amount`}>{amountLabel}</label>
        <input
          id={`${idPrefix}-amount`}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="0.00"
          value={value.amount}
          onChange={(e) => set({ amount: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-method`}>Method</label>
        <select id={`${idPrefix}-method`} value={value.method} onChange={(e) => set({ method: e.target.value as Method })}>
          {methods.map((m) => (
            <option key={m} value={m}>
              {labels[m]}
            </option>
          ))}
        </select>
      </div>
      {value.method === 'cheque' ? (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-cheque-no`}>Cheque number</label>
            <input id={`${idPrefix}-cheque-no`} value={value.chequeNo} onChange={(e) => set({ chequeNo: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-cheque-bank`}>Bank</label>
            <input id={`${idPrefix}-cheque-bank`} value={value.chequeBank} onChange={(e) => set({ chequeBank: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-cheque-date`}>Cheque date</label>
            <input id={`${idPrefix}-cheque-date`} type="date" value={value.chequeDate} onChange={(e) => set({ chequeDate: e.target.value })} />
            <div className="hint">A cheque counts only when it is cleared.</div>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor={`${idPrefix}-ref`}>Reference (optional)</label>
          <input id={`${idPrefix}-ref`} value={value.reference} onChange={(e) => set({ reference: e.target.value })} />
        </div>
      )}
    </div>
  );
}

export default PaymentFields;

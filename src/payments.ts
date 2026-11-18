/* Payment form drafts (amount received now, advances, payments, refunds). */
import type { Method, PaymentNow } from './api';

export interface PaymentDraft {
  amount: string;
  method: Method;
  reference: string;
  chequeNo: string;
  chequeBank: string;
  chequeDate: string;
}

export function emptyPayment(today: string, method: Method = 'cash'): PaymentDraft {
  return { amount: '', method, reference: '', chequeNo: '', chequeBank: '', chequeDate: today };
}

/** Problem text for a payment draft, or null. `required` = the amount must be > 0. */
export function paymentProblem(p: PaymentDraft, opts: { required?: boolean; max?: number; maxLabel?: string } = {}): string | null {
  const amount = p.amount.trim() === '' ? 0 : Number(p.amount);
  if (!Number.isFinite(amount) || amount < 0) return 'The amount is not valid.';
  if (opts.required && amount <= 0) return 'Enter an amount greater than 0.';
  if ((p.amount.split('.')[1]?.length ?? 0) > 2) return 'The amount can have at most 2 decimals.';
  if (opts.max !== undefined && amount > opts.max + 0.0001) return `The amount can't be more than ${opts.maxLabel ?? opts.max}.`;
  if (amount > 0 && p.method === 'cheque' && !p.chequeNo.trim()) return 'Enter the cheque number.';
  return null;
}

/** The JSON the server takes ({amount, method, reference, cheque_*}), or null when the amount is 0. */
export function toPaymentNow(p: PaymentDraft): PaymentNow | null {
  const amount = p.amount.trim() === '' ? 0 : Number(p.amount);
  if (!(amount > 0)) return null;
  const cheque = p.method === 'cheque';
  return {
    amount,
    method: p.method,
    reference: p.reference.trim() || null,
    cheque_no: cheque ? p.chequeNo.trim() : null,
    cheque_bank: cheque ? p.chequeBank.trim() || null : null,
    cheque_date: cheque ? p.chequeDate || null : null,
  };
}

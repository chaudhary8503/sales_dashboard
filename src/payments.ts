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

export interface OpenForAllocation {
  invoice_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  balance: number;
  /** What can still be allocated (balance less pending cheques already allocated). */
  open_to_allocate: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** Oldest first (the order the server lists them, by due date), like the server's "null" allocation. */
export function suggestAllocations(invoices: OpenForAllocation[], amount: number): Record<string, string> {
  let left = cents(Math.max(amount, 0));
  const out: Record<string, string> = {};
  for (const inv of invoices) {
    const take = cents(Math.min(inv.open_to_allocate, left));
    out[inv.invoice_id] = take > 0 ? String(take) : '';
    left = cents(left - take);
  }
  return out;
}

/** Sum of typed allocation amounts. */
export function allocatedTotal(values: Record<string, string>): number {
  return cents(Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0));
}

/** First problem with typed allocations, or null. */
export function allocationProblem(invoices: OpenForAllocation[], values: Record<string, string>, available: number): string | null {
  for (const inv of invoices) {
    const raw = values[inv.invoice_id] ?? '';
    if (raw.trim() === '') continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return `${inv.invoice_no}: the amount is not valid.`;
    if (v > inv.open_to_allocate + 0.0001) return `${inv.invoice_no} only has ${inv.open_to_allocate.toFixed(2)} left to pay.`;
  }
  if (allocatedTotal(values) > available + 0.0001) return 'The amounts add up to more than the money available.';
  return null;
}

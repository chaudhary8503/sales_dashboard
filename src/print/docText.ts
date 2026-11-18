import type { DocBundle, Method, Settlement } from '../api';
import { formatEntered, formatMoney, formatQty, METHOD_LABELS } from '../format';

/** "B-2026-00012 (400 ft), B-2026-00015 (100 ft)" — one entry per bundle, lengths added up. */
export function bundleSummary(bundles: DocBundle[]): string {
  const byNo = new Map<string, number>();
  for (const b of bundles) byNo.set(b.bundle_no, (byNo.get(b.bundle_no) ?? 0) + b.quantity_ft);
  return [...byNo.entries()].map(([no, ft]) => `${no} (${formatQty(ft, 'ft')})`).join(', ');
}

/** "2 coil (600 ft)", "500 ft", "3 pcs". */
export function qtyText(l: { entered_qty: number; entered_unit: string; base_qty: number; base_unit: string }): string {
  return formatEntered(l.entered_qty, l.entered_unit, l.base_qty, l.base_unit);
}

/** "Rs 15,000.00 / coil" */
export function rateText(rate: number, unit: string): string {
  return `${formatMoney(rate)} / ${unit}`;
}

export function methodText(method: Method | string | null | undefined): string {
  return method ? (METHOD_LABELS[method] ?? method) : '—';
}

/** How a return was settled, in customer words. */
export function settlementText(settlement: Settlement, refundMethod: Method | null, paymentType: 'cash' | 'credit'): string {
  if (settlement === 'keep_as_advance') return 'Kept as advance';
  if (settlement === 'reduce_balance') return 'Reduced the balance';
  const how = refundMethod && refundMethod !== 'cash' ? `by ${methodText(refundMethod).toLowerCase()}` : 'in cash';
  return paymentType === 'credit' ? `Reduced the balance; the rest paid back ${how}` : `Paid back ${how}`;
}

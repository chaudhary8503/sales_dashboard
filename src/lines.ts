/*
  Draft sale / order lines and the totals PREVIEW. The server prices every
  line again (sales._price_lines) and its numbers are the ones saved; this
  file only mirrors the same rounding so the preview matches.
*/
import type { Category, DiscountType, Item, SaleLinePayload } from './api';
import { formatMoney, formatQty, round2 } from './format';
import { toBase } from './units';

/** What Sales sells: cable, part-finished, other and scrap; copper and PVC on request; never consumables. */
export const SELLABLE: Category[] = ['finished_cable', 'semi_finished', 'other', 'scrap'];
export const RAW_MATERIALS: Category[] = ['copper', 'pvc'];

export interface ChosenBundle {
  bundle_id: string;
  bundle_no: string;
  /** Length taken from this bundle, in feet. */
  quantity_ft: number;
  /** What the bundle had when it was chosen, in feet. */
  remaining_ft: number;
}

export interface DraftLine {
  key: number;
  itemId: string;
  qty: string;
  unit: string;
  rate: string;
  discType: DiscountType;
  discValue: string;
  /** Supply location; '' = the sale location. */
  sourceId: string;
  bundles: ChosenBundle[];
  /** Delivering a sale order line. */
  saleOrderLineId?: string;
  /** What is still to deliver on that order line, in base units. */
  orderRemainingBase?: number;
}

let nextKey = 1;
export function newLine(patch: Partial<DraftLine> = {}): DraftLine {
  return { key: nextKey++, itemId: '', qty: '', unit: '', rate: '', discType: 'amount', discValue: '', sourceId: '', bundles: [], ...patch };
}

const decimals = (s: string) => (s.includes('.') ? s.split('.')[1].length : 0);

export interface PricedLine {
  line: DraftLine;
  item: Item | undefined;
  qty: number | null;
  baseQty: number | null;
  rate: number | null;
  gross: number;
  discount: number;
  net: number;
  invoiceShare: number;
  tax: number;
  total: number;
  problem: string | null;
  /** True for a line with no item yet (ignored when posting). */
  empty: boolean;
}

export interface PricedTotals {
  lines: PricedLine[];
  subtotal: number;
  lineDiscounts: number;
  invoiceDiscount: number;
  tax: number;
  total: number;
  invoiceDiscountProblem: string | null;
}

/** Prices the draft like the server does (line discount, invoice discount spread by value, tax). */
export function priceLines(
  drafts: DraftLine[],
  itemOf: (id: string) => Item | undefined,
  opts: { invoiceDiscType?: DiscountType; invoiceDiscValue?: string; taxRate?: number },
): PricedTotals {
  const lines: PricedLine[] = drafts.map((l) => {
    const item = itemOf(l.itemId);
    const base: PricedLine = {
      line: l, item, qty: null, baseQty: null, rate: null, gross: 0, discount: 0, net: 0, invoiceShare: 0, tax: 0, total: 0,
      problem: null, empty: !l.itemId,
    };
    if (!item) return base;
    const qty = l.qty.trim() === '' ? null : Number(l.qty);
    const rate = l.rate.trim() === '' ? null : Number(l.rate);
    const baseQty = qty === null ? null : toBase(item, qty, l.unit || item.base_unit);
    let problem: string | null = null;
    if (qty === null || !Number.isFinite(qty) || qty <= 0) problem = 'Enter a quantity greater than 0.';
    else if (decimals(l.qty) > 3) problem = 'Quantity can have at most 3 decimals.';
    else if (rate === null || !Number.isFinite(rate) || rate < 0) problem = 'Enter the rate.';
    else if (decimals(l.rate) > 2) problem = 'Rate can have at most 2 decimals.';
    const gross = qty !== null && rate !== null && Number.isFinite(qty) && Number.isFinite(rate) ? round2(qty * rate) : 0;
    const dv = l.discValue.trim() === '' ? 0 : Number(l.discValue);
    let discount = 0;
    if (!Number.isFinite(dv) || dv < 0) problem ??= 'The discount is not valid.';
    else if (l.discType === 'percent') {
      if (dv > 100) problem ??= "A discount can't be more than 100%.";
      discount = round2((gross * dv) / 100);
    } else discount = round2(dv);
    if (discount > gross) problem ??= 'The discount is more than the line amount.';
    const chosen = l.bundles.reduce((s, b) => s + b.quantity_ft, 0);
    if (baseQty !== null && chosen > baseQty + 0.0005)
      problem ??= `The chosen bundles add up to ${formatQty(chosen, 'ft')}, more than the ${formatQty(baseQty, 'ft')} sold.`;
    return { ...base, qty, baseQty, rate, gross, discount, net: Math.max(gross - discount, 0), problem };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const lineDiscounts = round2(lines.reduce((s, l) => s + l.discount, 0));
  const sumNet = round2(subtotal - lineDiscounts);
  const idv = (opts.invoiceDiscValue ?? '').trim() === '' ? 0 : Number(opts.invoiceDiscValue);
  let invoiceDiscount = 0;
  let invoiceDiscountProblem: string | null = null;
  if (!Number.isFinite(idv) || idv < 0) invoiceDiscountProblem = 'The invoice discount is not valid.';
  else if (opts.invoiceDiscType === 'percent') {
    if (idv > 100) invoiceDiscountProblem = "The invoice discount can't be more than 100%.";
    invoiceDiscount = round2((sumNet * idv) / 100);
  } else invoiceDiscount = round2(idv);
  if (invoiceDiscount > sumNet) invoiceDiscountProblem = 'The invoice discount is more than the invoice amount.';

  // Spread the invoice discount by value; the last line with value takes the rounding.
  let lastIdx = -1;
  lines.forEach((l, i) => {
    if (l.net > 0) lastIdx = i;
  });
  let shared = 0;
  const taxRate = opts.taxRate ?? 0;
  let tax = 0;
  let total = 0;
  lines.forEach((l, i) => {
    let share = 0;
    if (invoiceDiscount > 0 && l.net > 0) share = i === lastIdx ? round2(invoiceDiscount - shared) : Math.min(round2((invoiceDiscount * l.net) / sumNet), l.net);
    shared = round2(shared + share);
    l.invoiceShare = share;
    l.tax = round2(((l.net - share) * taxRate) / 100);
    l.total = round2(l.net - share + l.tax);
    tax += l.tax;
    total += l.total;
  });

  return { lines, subtotal, lineDiscounts, invoiceDiscount, tax: round2(tax), total: round2(total), invoiceDiscountProblem };
}

/** The JSON line the server expects (quantity in the entered unit, rate per that unit). */
export function toPayload(p: PricedLine, saleLocationId: string, withSource: boolean): SaleLinePayload {
  const l = p.line;
  const discountValue = l.discValue.trim() === '' ? 0 : Number(l.discValue);
  const payload: SaleLinePayload = {
    item_id: l.itemId,
    quantity: p.qty ?? 0,
    unit: l.unit || p.item?.base_unit || '',
    rate: p.rate ?? 0,
    discount_type: discountValue > 0 ? l.discType : null,
    discount_value: discountValue,
  };
  if (withSource) {
    payload.source_location_id = l.sourceId || saleLocationId;
    if (l.saleOrderLineId) payload.sale_order_line_id = l.saleOrderLineId;
    if (l.bundles.length > 0) payload.bundles = l.bundles.map((b) => ({ bundle_id: b.bundle_id, quantity_ft: b.quantity_ft }));
  }
  return payload;
}

export const describeDiscount = (type: DiscountType | null, value: number, amount: number): string =>
  amount <= 0 ? '' : type === 'percent' ? `${value}% (${formatMoney(amount)})` : formatMoney(amount);

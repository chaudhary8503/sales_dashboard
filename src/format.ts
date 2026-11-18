const qtyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/*
  Feet or metres is a personal setting (contract v6). The database always
  stores feet; set once after login, then every length in feet is shown in the
  person's unit. Rope and other items kept in metres are unaffected.
  (Copied from Inventory's format.ts.)
*/
export type LengthUnit = 'ft' | 'm';
export const M_PER_FT = 0.3048;
export const FT_PER_M = 1 / M_PER_FT;
let lengthUnit: LengthUnit = 'ft';

export function setLengthUnit(u: LengthUnit): void {
  lengthUnit = u;
}
export function getLengthUnit(): LengthUnit {
  return lengthUnit;
}

/** The unit a base unit is shown in ("ft" becomes "m" for metre people). */
export function shownUnit(baseUnit: string | undefined): string | undefined {
  return baseUnit === 'ft' && lengthUnit === 'm' ? 'm' : baseUnit;
}

/** A quantity in base units converted to how it's shown. */
export function shownAmount(amount: number, baseUnit: string | undefined): number {
  return baseUnit === 'ft' && lengthUnit === 'm' ? amount * M_PER_FT : amount;
}

/** "1,250.5 ft" (or "381.15 m" for metre people when the unit is ft). */
export function formatQty(amount: number | null | undefined, unit?: string): string {
  if (amount === null || amount === undefined) return '—';
  const shown = shownAmount(amount, unit);
  const u = shownUnit(unit);
  return u ? `${qtyFmt.format(round3(shown))} ${u}` : qtyFmt.format(shown);
}

/** Number only, converted for the base unit (for table cells under a unit heading). */
export function formatQtyIn(amount: number, baseUnit: string): string {
  return qtyFmt.format(round3(shownAmount(amount, baseUnit)));
}

/** A plain number with up to 3 decimals ("2", "2.5"), no unit conversion. */
export function formatNumber(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return qtyFmt.format(round3(amount));
}

/** "900 ft (3 coils)" when a coil size is known. */
export function formatWithCoils(amountFt: number, coilFt: number | null | undefined): string {
  const base = formatQty(amountFt, 'ft');
  if (!coilFt || coilFt <= 0) return base;
  const coils = amountFt / coilFt;
  const whole = Math.abs(coils - Math.round(coils)) < 0.001;
  return `${base} (${whole ? Math.round(coils) : qtyFmt.format(Math.round(coils * 100) / 100)} coil${Math.round(coils) === 1 && whole ? '' : 's'})`;
}

/**
 * A sold quantity as entered, with the base length when it differs:
 * "2 coil (600 ft)", "500 ft", "150 m (492.13 ft)", "3 pcs".
 * The base length follows the person's unit.
 */
export function formatEntered(enteredQty: number, enteredUnit: string, baseQty: number, baseUnit: string): string {
  const entered = `${qtyFmt.format(round3(enteredQty))} ${enteredUnit}`;
  // Same unit the person reads lengths in (or kg / pcs): nothing to add.
  if (enteredUnit === (shownUnit(baseUnit) ?? baseUnit)) return entered;
  return `${entered} (${formatQty(baseQty, baseUnit)})`;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** "Rs 45,000.00" */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `Rs ${moneyFmt.format(amount)}`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Karachi',
});

/** "2026-09-28" -> "28 Sep 2026" (parsed as a calendar date, not UTC). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

/** Timestamp in Karachi time, e.g. "20 Oct, 14:05". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateTimeFmt.format(new Date(iso));
}

/** Today's business date (Asia/Karachi) as YYYY-MM-DD. */
export function todayKarachi(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

/** YYYY-MM-DD n days before today (Karachi). */
export function daysAgo(n: number): string {
  return addDays(todayKarachi(), -n);
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zone drift). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = b.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export const CATEGORY_LABELS: Record<string, string> = {
  copper: 'Copper',
  pvc: 'PVC',
  semi_finished: 'Part-finished',
  finished_cable: 'Cable',
  consumable: 'Consumable',
  scrap: 'Scrap',
  other: 'Other',
};

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  online: 'Online',
  cheque: 'Cheque',
};

export const SETTLEMENT_LABELS: Record<string, string> = {
  cash_refund: 'Paid back',
  reduce_balance: 'Reduced the balance',
  keep_as_advance: 'Kept as advance',
};

/** Invoice balance statuses (sales._balances) and document statuses. */
export const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  partial: 'Part paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  posted: 'Posted',
  open: 'Open',
  part_delivered: 'Part delivered',
  delivered: 'Delivered',
  closed: 'Closed',
  cleared: 'Cleared',
  pending: 'Pending',
  bounced: 'Bounced',
};

/** Tag colour class (ui.css) for a status. */
export function statusTagClass(status: string | null | undefined): string {
  switch (status) {
    case 'paid':
    case 'cleared':
    case 'delivered':
      return 'ok';
    case 'overdue':
    case 'bounced':
      return 'out';
    case 'partial':
    case 'pending':
    case 'part_delivered':
    case 'unpaid':
      return 'low';
    case 'open':
    case 'posted':
      return 'brand';
    default:
      return 'muted';
  }
}

/** Money string for CSV ("1234.50", no "Rs" or commas). */
export function csvMoney(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? '' : amount.toFixed(2);
}

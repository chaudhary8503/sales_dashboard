/*
  Turns Supabase errors into text for staff. The database's own messages are
  already written for staff, so `message` is shown as it is; a few hints get
  extra help (contract section 6). Every API call throws a SalesError, so
  pages can look at `hint` (e.g. to re-open the bundle picker).
*/
import type { Item, Location } from './api';
import { formatQty } from './format';

export type ErrorTone = 'error' | 'info' | 'warn';

export class SalesError extends Error {
  hint: string;
  details: string;
  code: string;
  /** Banner style: info (blue) for "customers not live", warn for blocked customers, else error. */
  tone: ErrorTone;
  network: boolean;

  constructor(message: string, opts: { hint?: string; details?: string; code?: string; tone?: ErrorTone; network?: boolean } = {}) {
    super(message);
    this.name = 'SalesError';
    this.hint = opts.hint ?? '';
    this.details = opts.details ?? '';
    this.code = opts.code ?? '';
    this.tone = opts.tone ?? 'error';
    this.network = opts.network ?? false;
  }
}

// Shared lists for the insufficient_stock message; set by App after login.
let ctxItems: Item[] = [];
let ctxLocations: Location[] = [];
export function setErrorContext(items: Item[], locations: Location[]): void {
  ctxItems = items;
  ctxLocations = locations;
}

const NETWORK_TEXT = "Can't reach the server. Check the internet connection and try again.";

function isNetworkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('fetch failed')
  );
}

function insufficientStockText(message: string, details: string): string {
  try {
    const d = JSON.parse(details) as { item_id?: string; location_id?: string; available?: number; requested?: number };
    const item = ctxItems.find((i) => i.item_id === d.item_id);
    const location = ctxLocations.find((l) => l.location_id === d.location_id);
    if (!item || d.available === undefined || d.requested === undefined) return message;
    const name = item.invoice_name || item.name;
    return `${location?.name ?? 'This location'} has only ${formatQty(Number(d.available), item.base_unit)} of ${name} (this sale needs ${formatQty(Number(d.requested), item.base_unit)}). Choose another supply location or a smaller quantity.`;
  } catch {
    return message;
  }
}

/** Any thrown value or Supabase error object -> SalesError with friendly text. */
export function toSalesError(err: unknown): SalesError {
  if (err instanceof SalesError) return err;
  const e = (err && typeof err === 'object' ? err : {}) as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  const message = typeof e.message === 'string' && e.message ? e.message : err instanceof Error ? err.message : String(err ?? '');
  const hint = typeof e.hint === 'string' ? e.hint : '';
  const details = typeof e.details === 'string' ? e.details : '';
  const code = typeof e.code === 'string' ? e.code : '';

  if (isNetworkFailure(message)) return new SalesError(NETWORK_TEXT, { network: true, code });

  switch (hint) {
    case 'insufficient_stock':
      return new SalesError(insufficientStockText(message, details), { hint, details, code });
    case 'customer_blocked':
      return new SalesError(message, { hint, details, code, tone: 'warn' });
    case 'customers_not_live':
      return new SalesError(message, { hint, details, code, tone: 'info' });
    case 'not_allowed':
      return new SalesError(`You don't have permission for this. Ask the owner. (${message})`, { hint, details, code });
  }
  if (code === '42501') return new SalesError(`You don't have permission for this. Ask the owner. (${message})`, { hint, details, code });
  return new SalesError(message || 'Something went wrong. Please try again.', { hint, details, code });
}

/** The bundle number named in a bundle_short message ("Bundle B-2026-00012 has only ..."). */
export function bundleNoFromError(err: SalesError): string | null {
  return /Bundle (\S+) has only/.exec(err.message)?.[1] ?? null;
}

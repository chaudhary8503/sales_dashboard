/*
  Every database call the app makes. Every write goes through a Sales
  function (supabase.schema('sales').rpc); reads go through Sales read
  functions, Inventory's read functions, or RLS-filtered selects. The app
  never writes a table and never calls an Inventory or Customers write
  function. Errors are thrown as SalesError (errors.ts).
*/
import { toSalesError } from './errors';
import { supabase } from './lib/supabase';

const sales = () => supabase.schema('sales');
const inv = () => supabase.schema('inventory');

function unwrap<T>(res: { data: unknown; error: unknown }): T {
  if (res.error) throw toSalesError(res.error);
  return res.data as T;
}

/* Numeric columns can arrive as strings for large values; normalise. */
export const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
export const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** Money and quantity keys inside Sales JSON documents, converted with Number() wherever they appear. */
const NUM_KEYS = new Set([
  'amount', 'total', 'subtotal', 'paid', 'pending', 'credited', 'balance', 'available', 'left', 'allocated', 'advance',
  'line_discount_total', 'invoice_discount_value', 'invoice_discount_amount', 'tax_total', 'discount_total',
  'entered_qty', 'factor_to_base', 'base_qty', 'rate', 'gross_amount', 'discount_value', 'discount_amount',
  'invoice_discount_share', 'tax_rate', 'tax_amount', 'line_total', 'quantity_ft', 'returned_base_qty',
  'delivered_base_qty', 'ordered_base_qty', 'value', 'size_bytes', 'cash_total', 'credit_total', 'outstanding',
  'overdue', 'pending_cheques', 'open_to_allocate', 'revenue', 'cash', 'credit', 'discounts', 'returns',
  'invoice_count', 'invoices', 'quantity', 'count', 'overdue_invoices', 'revenue_ex_tax', 'cost_of_sales',
  'returns_value', 'returns_cost', 'gross_profit', 'pending_cost_ft', 'applied_to_invoice', 'days_overdue',
  'credit_days', 'lines', 'lines_delivered', 'total_amount', 'paid_amount', 'default_tax_rate',
  'remaining_ft', 'original_ft', 'payment_terms_days',
]);

/** Walks a JSON value and turns numeric strings under NUM_KEYS into numbers. */
export function normalise<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => normalise(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (NUM_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) out[k] = Number(v);
      else out[k] = v && typeof v === 'object' ? normalise(v) : v;
    }
    return out as T;
  }
  return value as T;
}

// ---------------------------------------------------------------- shared lists

export type Category = 'copper' | 'pvc' | 'semi_finished' | 'finished_cable' | 'consumable' | 'scrap' | 'other';

export interface UnitOption {
  unit: string;
  factor_to_base: number;
}

export interface ItemSpecValues {
  material?: string;
  size_mm2?: string;
  cores?: string;
  flex_standard?: string;
  cable_type?: string;
  double_pvc?: boolean;
  wires?: string;
  thou?: string;
  copper_grade?: string;
  form?: string;
  pvc_colour?: string;
  pvc_grade?: string;
}

export interface Item {
  item_id: string;
  code: string | null;
  /** Staff name: may contain wires / thou. Never on a customer document. */
  name: string;
  /** Customer name: what prints on invoices. */
  invoice_name: string | null;
  category: Category;
  base_unit: string;
  units: UnitOption[];
  specs: ItemSpecValues;
  active: boolean;
}

export interface Location {
  location_id: string;
  name: string;
  code: string | null;
  type: 'shop' | 'factory' | 'warehouse';
  business_id: string;
}

export interface Business {
  id: string;
  legal_name: string;
  trading_name: string;
  tax_registered: boolean;
  logo_path: string | null;
  invoice_footer: string;
}

export interface SalesSettings {
  overdue_warning_days: number;
  overdue_critical_days: number;
  cheque_pending_days: number;
  sale_order_due_days: number;
  default_receipt_format: 'a4' | 'a5';
  receipt_footer: string | null;
  invoice_terms: string | null;
  default_tax_rate: number | null;
}

export interface AppContext {
  customers_live: boolean;
  today: string;
  settings: SalesSettings;
}

export async function getAppContext(): Promise<AppContext> {
  return normalise<AppContext>(unwrap(await sales().rpc('get_app_context')));
}

export async function listLocations(): Promise<Location[]> {
  return unwrap<Location[]>(await inv().rpc('list_locations'));
}

export async function listItems(): Promise<Item[]> {
  const rows = unwrap<Item[]>(await inv().rpc('list_items', { p_include_inactive: false }));
  return rows.map((r) => ({
    ...r,
    specs: r.specs ?? {},
    units: (r.units ?? []).map((u) => ({ ...u, factor_to_base: num(u.factor_to_base) })),
  }));
}

/** The person's length unit from the Portal ('ft' or 'm'); feet when the Portal doesn't have it yet. */
export async function getMyLengthUnit(): Promise<'ft' | 'm'> {
  try {
    const res = await supabase.schema('portal').rpc('get_my_settings');
    const unit = (res.data as { length_unit?: string } | null)?.length_unit;
    return unit === 'm' ? 'm' : 'ft';
  } catch {
    return 'ft';
  }
}

/** Businesses (readable by every signed-in user): tax status for the totals, logo fallback. */
export async function listBusinesses(): Promise<Business[]> {
  try {
    const res = await supabase
      .schema('portal')
      .from('businesses')
      .select('id, legal_name, trading_name, tax_registered, logo_path, invoice_footer');
    return (res.data ?? []) as Business[];
  } catch {
    return [];
  }
}

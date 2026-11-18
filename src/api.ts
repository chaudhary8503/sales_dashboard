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

// ---------------------------------------------------------------- Inventory reads

export interface Availability {
  item_id: string;
  item_name: string;
  location_id: string;
  location_name: string;
  quantity: number;
  unit: string;
}

export async function stockAvailability(itemIds: string[]): Promise<Availability[]> {
  if (itemIds.length === 0) return [];
  const rows = unwrap<Availability[]>(await inv().rpc('get_stock_availability', { p_item_ids: itemIds }));
  return rows.map((r) => ({ ...r, quantity: num(r.quantity) }));
}

export interface Bundle {
  bundle_id: string;
  bundle_no: string;
  item_id: string;
  location_id: string;
  remaining_ft: number;
  original_ft: number;
  opened: boolean;
  created_at: string;
}

/** Bundles of one cable at one location, in auto-pick order (opened first, then oldest). */
export async function listBundles(itemId: string, locationId: string): Promise<Bundle[]> {
  const rows = unwrap<Bundle[]>(
    await inv().rpc('list_bundles', { p_item_id: itemId, p_location_id: locationId, p_include_empty: false }),
  );
  return rows.map((r) => ({ ...r, remaining_ft: num(r.remaining_ft), original_ft: num(r.original_ft) }));
}

// ---------------------------------------------------------------- Customers (reads + quick add only)

export interface Customer {
  customer_id: string;
  customer_code: string | null;
  name: string;
  business_name: string | null;
  phone: string | null;
  city: string | null;
  payment_terms_days: number | null;
  /** Only with a balances permission; null otherwise. */
  balance: number | null;
  blocked: boolean;
  block_reason: string | null;
  tax_registered?: boolean;
  active?: boolean;
}

export async function searchCustomers(query: string, limit = 20): Promise<Customer[]> {
  const rows = unwrap<Customer[]>(
    await supabase.schema('customers').rpc('search_customers', { p_query: query.trim(), p_limit: limit }),
  );
  return rows.map((r) => ({ ...r, balance: numOrNull(r.balance), payment_terms_days: numOrNull(r.payment_terms_days) }));
}

export async function quickAddCustomer(c: { name: string; phone: string; city: string; businessName: string }): Promise<string> {
  return unwrap<string>(
    await supabase.schema('customers').rpc('quick_add_customer', {
      p_name: c.name.trim(),
      p_phone: c.phone.trim() || null,
      p_city: c.city.trim() || null,
      p_business_name: c.businessName.trim() || null,
    }),
  );
}

// ---------------------------------------------------------------- posting (every write)

export type DiscountType = 'amount' | 'percent';
export type CashVia = 'cash' | 'bank_transfer' | 'online';
export type Method = 'cash' | 'bank_transfer' | 'online' | 'cheque';

export interface PostResult {
  id: string;
  number: string;
  duplicate?: boolean;
}

export interface SaleHeader {
  request_id: string;
  sale_location_id: string;
  invoice_date?: string;
  payment_type: 'cash' | 'credit';
  cash_paid_via?: CashVia;
  cash_reference?: string | null;
  customer_id: string | null;
  walk_in_name?: string | null;
  walk_in_phone?: string | null;
  credit_days?: number | null;
  sale_order_id?: string | null;
  invoice_discount_type: DiscountType | null;
  invoice_discount_value: number;
  note?: string | null;
  vehicle_no?: string | null;
  driver_name?: string | null;
}

export interface SaleLinePayload {
  item_id: string;
  quantity: number;
  unit: string;
  rate: number;
  discount_type: DiscountType | null;
  discount_value: number;
  source_location_id?: string | null;
  sale_order_line_id?: string | null;
  bundles?: { bundle_id: string; quantity_ft: number }[];
}

export interface PaymentNow {
  amount: number;
  method: Method;
  reference?: string | null;
  cheque_no?: string | null;
  cheque_bank?: string | null;
  cheque_date?: string | null;
}

export async function recordSale(
  header: SaleHeader,
  lines: SaleLinePayload[],
  payment: PaymentNow | null,
): Promise<PostResult & { total: number; payment_id: string | null; payment_number: string | null }> {
  return normalise(unwrap(await sales().rpc('record_sale', { p_header: header, p_lines: lines, p_payment: payment })));
}

export async function cancelInvoice(invoiceId: string, reason: string): Promise<void> {
  unwrap(await sales().rpc('cancel_invoice', { p_invoice_id: invoiceId, p_reason: reason }));
}

export async function saveDeliveryDetails(invoiceId: string, vehicleNo: string, driverName: string, note: string | null): Promise<void> {
  unwrap(
    await sales().rpc('save_delivery_details', {
      p_invoice_id: invoiceId,
      p_vehicle_no: vehicleNo,
      p_driver_name: driverName,
      p_note: note,
    }),
  );
}

export interface SaleOrderHeader {
  request_id: string;
  customer_id: string;
  sale_location_id: string;
  order_date?: string;
  expected_date: string | null;
  credit_days: number | null;
  note: string | null;
}

export type SaleOrderLinePayload = Omit<SaleLinePayload, 'source_location_id' | 'sale_order_line_id' | 'bundles'>;

export async function createSaleOrder(
  header: SaleOrderHeader,
  lines: SaleOrderLinePayload[],
  advance: PaymentNow | null,
): Promise<PostResult & { payment_id: string | null; payment_number: string | null }> {
  return normalise(unwrap(await sales().rpc('create_sale_order', { p_header: header, p_lines: lines, p_advance: advance })));
}

export async function closeSaleOrder(id: string, reason: string): Promise<void> {
  unwrap(await sales().rpc('close_sale_order', { p_id: id, p_reason: reason }));
}

export async function cancelSaleOrder(id: string, reason: string): Promise<void> {
  unwrap(await sales().rpc('cancel_sale_order', { p_id: id, p_reason: reason }));
}

export interface PaymentPayload extends PaymentNow {
  request_id: string;
  payment_date?: string;
  location_id: string | null;
  sale_order_id?: string | null;
  note?: string | null;
}

export interface Allocation {
  invoice_id: string;
  amount: number;
}

/** allocations: null = oldest first, [] = keep it all as advance, list = exactly these. */
export async function recordPayment(
  customerId: string,
  payment: PaymentPayload,
  allocations: Allocation[] | null,
): Promise<PostResult & { status: string; allocated: number; advance: number }> {
  return normalise(
    unwrap(await sales().rpc('record_payment', { p_customer_id: customerId, p_payment: payment, p_allocations: allocations })),
  );
}

export async function clearCheque(paymentId: string, clearedDate: string): Promise<void> {
  unwrap(await sales().rpc('clear_cheque', { p_payment_id: paymentId, p_cleared_date: clearedDate }));
}

export async function bounceCheque(paymentId: string, reason: string): Promise<void> {
  unwrap(await sales().rpc('bounce_cheque', { p_payment_id: paymentId, p_reason: reason }));
}

export async function cancelPayment(paymentId: string, reason: string): Promise<void> {
  unwrap(await sales().rpc('cancel_payment', { p_payment_id: paymentId, p_reason: reason }));
}

/** Uses an advance (one payment OR one credit note) against invoices. */
export async function allocateAdvance(
  source: { paymentId: string } | { creditNoteId: string },
  allocations: Allocation[] | null,
): Promise<{ allocated: number; left: number }> {
  return normalise(
    unwrap(
      await sales().rpc('allocate_advance', {
        p_payment_id: 'paymentId' in source ? source.paymentId : null,
        p_credit_note_id: 'creditNoteId' in source ? source.creditNoteId : null,
        p_allocations: allocations,
      }),
    ),
  );
}

export interface RefundPayload {
  request_id: string;
  source_payment_id?: string | null;
  source_credit_note_id?: string | null;
  amount: number;
  method: Method;
  reference: string | null;
  refund_date?: string;
  location_id: string | null;
  note: string | null;
}

export async function recordRefund(customerId: string, refund: RefundPayload): Promise<PostResult> {
  return normalise(unwrap(await sales().rpc('record_refund', { p_customer_id: customerId, p_refund: refund })));
}

export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** The file's type as the bucket expects it (some browsers give HEIC photos no type). */
export function attachmentType(file: File): string {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  if (/\.hei[cf]$/i.test(file.name)) return 'image/heic';
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  return '';
}

/** Uploads a cheque / bank slip photo or PDF, then records it on the payment. */
export async function attachPaymentFile(paymentId: string, file: File): Promise<void> {
  const mime = attachmentType(file);
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'file';
  const path = `payments/${paymentId}/${Date.now()}-${safe}`;
  const up = await supabase.storage.from('sales-attachments').upload(path, file, { contentType: mime, upsert: false });
  if (up.error) throw toSalesError(up.error);
  unwrap(
    await sales().rpc('add_payment_attachment', {
      p_payment_id: paymentId,
      p_storage_path: path,
      p_file_name: file.name,
      p_mime_type: mime,
      p_size_bytes: file.size,
    }),
  );
}

/** A temporary link to a private file (branding logos, payment proofs). */
export async function signedUrl(bucket: 'branding' | 'sales-attachments', path: string): Promise<string | null> {
  try {
    const res = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    return res.data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export type Settlement = 'reduce_balance' | 'cash_refund' | 'keep_as_advance';

export interface CreditNoteHeader {
  request_id: string;
  credit_date?: string;
  location_id: string;
  reason: string;
  settlement: Settlement;
  refund_method: Method | null;
}

export interface CreditNoteLinePayload {
  invoice_line_id: string;
  quantity: number;
  restock: boolean;
  return_location_id: string | null;
  back_to_bundle: boolean;
}

export async function recordCreditNote(
  invoiceId: string,
  header: CreditNoteHeader,
  lines: CreditNoteLinePayload[],
): Promise<PostResult & { total: number; applied_to_invoice: number; refund_id: string | null; refund_number: string | null }> {
  return normalise(unwrap(await sales().rpc('record_credit_note', { p_invoice_id: invoiceId, p_header: header, p_lines: lines })));
}

export async function updateSettings(settings: Partial<SalesSettings>): Promise<SalesSettings> {
  return normalise(unwrap(await sales().rpc('update_settings', { p_settings: settings })));
}

// ---------------------------------------------------------------- Sales reads

export type BalanceStatus = 'paid' | 'unpaid' | 'partial' | 'overdue' | 'cancelled';

export interface InvoiceRow {
  invoice_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  sale_location_id: string;
  location_name: string | null;
  payment_type: 'cash' | 'credit';
  customer_id: string | null;
  customer_name: string | null;
  total: number;
  paid: number;
  pending: number;
  credited: number;
  balance: number;
  status: BalanceStatus;
  days_overdue: number;
  source: string;
  created_by: string | null;
  created_by_name: string | null;
}

export interface InvoiceFilters {
  from?: string | null;
  to?: string | null;
  locationId?: string | null;
  paymentType?: string | null;
  status?: string | null;
  customerId?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export async function listInvoices(f: InvoiceFilters): Promise<InvoiceRow[]> {
  return normalise(
    unwrap(
      await sales().rpc('list_invoices', {
        p_from: f.from || null,
        p_to: f.to || null,
        p_location_id: f.locationId || null,
        p_payment_type: f.paymentType || null,
        p_status: f.status || null,
        p_customer_id: f.customerId || null,
        p_search: f.search?.trim() || null,
        p_limit: f.limit ?? 200,
        p_offset: f.offset ?? 0,
      }),
    ),
  );
}

export interface DocBusiness {
  id: string | null;
  name: string | null;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  ntn?: string | null;
  strn?: string | null;
  tax_registered?: boolean;
  logo_path: string | null;
  invoice_footer: string | null;
}

export interface DocBundle {
  bundle_id: string;
  bundle_no: string;
  quantity_ft: number;
  chosen?: boolean;
  original_bundle_id?: string | null;
}

interface SoldLine {
  id: string;
  line_no: number;
  item_id: string;
  category: string;
  item_name: string;
  invoice_name: string;
  entered_qty: number;
  entered_unit: string;
  factor_to_base: number;
  base_qty: number;
  base_unit: string;
  rate: number;
  gross_amount: number;
  discount_type: DiscountType | null;
  discount_value: number;
  discount_amount: number;
  line_total: number;
}

export interface InvoiceLine extends SoldLine {
  source_location_id: string;
  source_location_name: string | null;
  sale_order_line_id: string | null;
  invoice_discount_share: number;
  tax_rate: number;
  tax_amount: number;
  returned_base_qty: number;
  bundles: DocBundle[];
}

export interface InvoiceBalance {
  total: number;
  paid: number;
  pending: number;
  credited: number;
  balance: number;
  status: BalanceStatus;
  days_overdue: number;
}

export interface InvoiceDoc {
  doc_type: 'invoice';
  id: string;
  invoice_no: string;
  source: string;
  sale_location_id: string;
  location_name: string | null;
  invoice_date: string;
  payment_type: 'cash' | 'credit';
  cash_paid_via: CashVia | null;
  cash_reference: string | null;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_business_name: string | null;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  sale_order_id: string | null;
  sale_order_no: string | null;
  credit_days: number | null;
  due_date: string | null;
  subtotal: number;
  line_discount_total: number;
  invoice_discount_type: DiscountType | null;
  invoice_discount_value: number;
  invoice_discount_amount: number;
  tax_total: number;
  total: number;
  status: 'posted' | 'cancelled';
  cancel_reason: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  business: DocBusiness;
  balance: InvoiceBalance | null;
  delivery: { vehicle_no: string | null; driver_name: string | null; note: string | null } | null;
  lines: InvoiceLine[];
  allocations: {
    amount: number;
    released: boolean;
    released_reason: string | null;
    date: string | null;
    source_type: 'payment' | 'credit_note';
    source_id: string;
    source_number: string;
    method: Method | null;
    status: string | null;
    cheque_no: string | null;
  }[];
  credit_notes: { id: string; number: string; date: string; total: number; settlement: Settlement }[];
  settings: SalesSettings;
}

export interface SaleOrderLine extends SoldLine {
  delivered_base_qty: number;
}

export interface SaleOrderDoc {
  doc_type: 'sale_order';
  id: string;
  sale_order_no: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
  customer_phone: string | null;
  sale_location_id: string;
  location_name: string | null;
  order_date: string;
  expected_date: string | null;
  credit_days: number;
  subtotal: number;
  discount_total: number;
  total: number;
  note: string | null;
  status: 'open' | 'closed' | 'cancelled';
  closed_reason: string | null;
  closed_at: string | null;
  created_by_name: string | null;
  business: DocBusiness;
  progress: { status: string; lines: number; lines_delivered: number };
  lines: SaleOrderLine[];
  invoices: { id: string; number: string; date: string; total: number; status: string }[];
  advances: { id: string; number: string; date: string; amount: number; method: Method; status: string; available: number }[];
  settings: SalesSettings;
}

export interface PaymentDoc {
  doc_type: 'payment';
  id: string;
  payment_no: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
  location_id: string | null;
  location_name: string | null;
  payment_date: string;
  amount: number;
  method: Method;
  reference: string | null;
  cheque_no: string | null;
  cheque_bank: string | null;
  cheque_date: string | null;
  status: 'cleared' | 'pending' | 'bounced' | 'cancelled';
  cleared_date: string | null;
  sale_order_id: string | null;
  sale_order_no: string | null;
  invoice_id: string | null;
  status_reason: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  business: DocBusiness | null;
  available: number;
  allocations: { invoice_id: string; invoice_no: string; invoice_date: string; amount: number; released: boolean; released_reason: string | null }[];
  refunds: { id: string; number: string; date: string; amount: number; method: Method }[];
  events: { from: string | null; to: string; date: string; reason: string | null; by: string | null; at: string }[];
  attachments: { id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number }[];
  settings: SalesSettings;
}

export interface CreditNoteLine {
  id: string;
  line_no: number;
  invoice_line_id: string;
  item_id: string;
  invoice_name: string;
  restock: boolean;
  return_location_id: string | null;
  return_location_name: string | null;
  back_to_bundle: boolean;
  entered_qty: number;
  entered_unit: string;
  base_qty: number;
  base_unit: string;
  rate: number;
  value: number;
  bundles: DocBundle[];
}

export interface CreditNoteDoc {
  doc_type: 'credit_note';
  id: string;
  credit_note_no: string;
  invoice_id: string;
  customer_id: string | null;
  customer_name: string | null;
  location_id: string;
  location_name: string | null;
  credit_date: string;
  reason: string;
  settlement: Settlement;
  refund_method: Method | null;
  total: number;
  customer_credit: boolean;
  created_at: string;
  created_by_name: string | null;
  invoice_no: string;
  invoice_date: string;
  payment_type: 'cash' | 'credit';
  walk_in_name: string | null;
  walk_in_phone: string | null;
  customer_phone: string | null;
  business: DocBusiness;
  available: number;
  applied_to_invoice: number;
  lines: CreditNoteLine[];
  refunds: { id: string; number: string; date: string; amount: number; method: Method }[];
  settings: SalesSettings;
}

export interface RefundDoc {
  doc_type: 'refund';
  id: string;
  refund_no: string;
  customer_id: string;
  customer_name: string;
  location_id: string | null;
  location_name: string | null;
  refund_date: string;
  amount: number;
  method: Method;
  reference: string | null;
  source_payment_id: string | null;
  source_credit_note_id: string | null;
  source_number: string | null;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
  settings: SalesSettings;
}

interface DocTypes {
  invoice: InvoiceDoc;
  sale_order: SaleOrderDoc;
  payment: PaymentDoc;
  credit_note: CreditNoteDoc;
  refund: RefundDoc;
}

export async function getDocument<K extends keyof DocTypes>(docType: K, id: string): Promise<DocTypes[K]> {
  return normalise<DocTypes[K]>(unwrap(await sales().rpc('get_document', { p_doc_type: docType, p_id: id })));
}

export interface CustomerOverview {
  customer: Customer;
  totals: { cash_total: number; credit_total: number; last_purchase_date: string | null };
  balance: { outstanding: number; overdue: number; pending_cheques: number };
  open_invoices: {
    invoice_id: string;
    invoice_no: string;
    invoice_date: string;
    due_date: string | null;
    total: number;
    paid: number;
    credited: number;
    pending: number;
    balance: number;
    open_to_allocate: number;
    status: BalanceStatus;
    days_overdue: number;
  }[];
  advances: {
    source_type: 'payment' | 'credit_note';
    id: string;
    number: string;
    date: string;
    amount: number;
    status: string;
    available: number;
    sale_order_id: string | null;
  }[];
  open_sale_orders: { id: string; number: string; order_date: string; expected_date: string | null; total: number; status: string }[];
  pending_cheques: { id: string; number: string; amount: number; cheque_no: string | null; cheque_bank: string | null; cheque_date: string | null }[];
  recent: {
    doc_type: string;
    doc_id: string;
    doc_number: string;
    doc_date: string;
    location_name: string | null;
    payment_type: string | null;
    total_amount: number;
    paid_amount: number | null;
    status: string;
    link_path: string;
  }[];
}

export async function getCustomerOverview(customerId: string): Promise<CustomerOverview> {
  return normalise(unwrap(await sales().rpc('get_customer_overview', { p_customer_id: customerId })));
}

export interface OpenInvoiceRow {
  invoice_id: string;
  invoice_no: string;
  customer_id: string;
  customer_name: string | null;
  invoice_date: string;
  due_date: string;
  total: number;
  paid: number;
  credited: number;
  pending: number;
  balance: number;
  days_overdue: number;
  link_path: string;
}

export async function listOpenInvoices(customerId: string | null, asOf: string | null): Promise<OpenInvoiceRow[]> {
  return normalise(unwrap(await sales().rpc('list_open_invoices', { p_customer_id: customerId, p_as_of: asOf })));
}

export type SaleOrderStatus = 'open' | 'part_delivered' | 'delivered' | 'closed' | 'cancelled' | 'all';

export interface SaleOrderRow {
  sale_order_id: string;
  sale_order_no: string;
  customer_id: string;
  customer_name: string;
  order_date: string;
  expected_date: string | null;
  status: string;
  total: number;
  lines: {
    sale_order_line_id: string;
    item_id: string;
    invoice_name: string;
    ordered_base_qty: number;
    delivered_base_qty: number;
    base_unit: string;
  }[];
}

export async function listSaleOrders(status: SaleOrderStatus, search: string | null): Promise<SaleOrderRow[]> {
  return normalise(unwrap(await sales().rpc('list_sale_orders', { p_status: status, p_search: search?.trim() || null })));
}

export interface Analytics {
  from: string;
  to: string;
  totals: { revenue: number; cash: number; credit: number; discounts: number; invoice_count: number; returns: number };
  by_day: { date: string; revenue: number; cash: number | null; credit: number | null }[];
  by_month: { month: string; revenue: number; cash: number; credit: number }[];
  by_location: { location_id: string; name: string; revenue: number; invoices: number }[];
  by_supply_location: { location_id: string; name: string; revenue: number }[];
  by_product: {
    item_id: string;
    invoice_name: string;
    category: string;
    cable_type: string | null;
    size_mm2: string | null;
    cores: string | null;
    material: string | null;
    base_unit: string;
    quantity: number;
    revenue: number;
  }[];
  by_customer: { customer_id: string | null; name: string; revenue: number; cash: number; credit: number; invoices: number }[];
  receivables: { outstanding: number; overdue: number; overdue_invoices: number; pending_cheques: number };
  open_sale_orders: { count: number; value: number };
  profit: {
    available: boolean;
    revenue_ex_tax: number;
    cost_of_sales?: number;
    returns_value?: number;
    returns_cost?: number;
    gross_profit?: number;
    pending_cost_ft?: number;
    note: string | null;
  };
}

export async function getAnalytics(from: string, to: string, locationIds: string[] | null): Promise<Analytics> {
  return normalise(
    unwrap(
      await sales().rpc('get_analytics', {
        p_from: from,
        p_to: to,
        p_location_ids: locationIds && locationIds.length ? locationIds : null,
      }),
    ),
  );
}

export interface PaymentRow {
  id: string;
  payment_no: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
  location_id: string | null;
  payment_date: string;
  amount: number;
  method: Method;
  reference: string | null;
  cheque_no: string | null;
  cheque_bank: string | null;
  cheque_date: string | null;
  status: 'cleared' | 'pending' | 'bounced' | 'cancelled';
  cleared_date: string | null;
  status_reason: string | null;
  sale_order_id: string | null;
  invoice_id: string | null;
  created_at: string;
}

const PAYMENT_COLUMNS =
  'id, payment_no, customer_id, customer_code, customer_name, location_id, payment_date, amount, method, reference, cheque_no, cheque_bank, cheque_date, status, cleared_date, status_reason, sale_order_id, invoice_id, created_at';

/** Strips characters PostgREST filters treat specially. */
function filterText(s: string | null | undefined): string {
  return (s ?? '').replace(/[,()*%\\]/g, ' ').trim();
}

/** RLS decides whose payments come back (all, cheque managers, or own). Newest first. */
export async function listPayments(f: {
  from?: string | null;
  to?: string | null;
  method?: string | null;
  status?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<PaymentRow[]> {
  let q = sales().from('payments').select(PAYMENT_COLUMNS);
  if (f.from) q = q.gte('payment_date', f.from);
  if (f.to) q = q.lte('payment_date', f.to);
  if (f.method) q = q.eq('method', f.method);
  if (f.status) q = q.eq('status', f.status);
  const s = filterText(f.search);
  if (s) q = q.or(`customer_name.ilike.*${s}*,payment_no.ilike.*${s}*,cheque_no.ilike.*${s}*`);
  const res = await q.order('payment_date', { ascending: false }).order('created_at', { ascending: false }).limit(f.limit ?? 500);
  return normalise(unwrap(res));
}

export async function listCheques(status: 'pending' | 'cleared' | 'bounced'): Promise<PaymentRow[]> {
  const res = await sales()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('method', 'cheque')
    .eq('status', status)
    .order(status === 'pending' ? 'cheque_date' : 'payment_date', { ascending: status === 'pending', nullsFirst: false })
    .limit(500);
  return normalise(unwrap(res));
}

export interface CreditNoteRow {
  id: string;
  credit_note_no: string;
  invoice_id: string;
  customer_name: string | null;
  location_id: string;
  credit_date: string;
  reason: string;
  settlement: Settlement;
  refund_method: Method | null;
  total: number;
  created_at: string;
  invoices: { invoice_no: string } | null;
}

export async function listCreditNotes(f: { from?: string | null; to?: string | null; search?: string | null }): Promise<CreditNoteRow[]> {
  let q = sales()
    .from('credit_notes')
    .select(
      'id, credit_note_no, invoice_id, customer_name, location_id, credit_date, reason, settlement, refund_method, total, created_at, invoices(invoice_no)',
    );
  if (f.from) q = q.gte('credit_date', f.from);
  if (f.to) q = q.lte('credit_date', f.to);
  const s = filterText(f.search);
  if (s) q = q.or(`credit_note_no.ilike.*${s}*,customer_name.ilike.*${s}*,reason.ilike.*${s}*`);
  const res = await q.order('credit_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  return normalise(unwrap(res));
}

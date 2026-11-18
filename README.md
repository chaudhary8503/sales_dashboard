# Sales (Powerant)

Walk-in and credit sales, printed invoices (A4 / A5) and delivery challans, sale orders with advances, customer lookup,
payments and cheques, returns (credit notes), receivables and analytics. Contract v6. React 19 + Vite + TypeScript, data
from the shared Supabase project (schema `sales`, plus Inventory's read functions). Same look as Inventory.

## Run locally

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Same as the Portal |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same as the Portal (publishable key, never the secret / service-role key) |
| `VITE_PORTAL_URL` | Optional. The Portal's address for the "Portal" button. Defaults to `https://portal.powerantcables.com/`. |

Before every commit: `npm run lint` and `npm run build` (both must be clean).

### Against local Supabase (for testing, never the live project)

1. In `powerant-db`: `npx supabase start`, `npx supabase db reset`, then load test data as described in
   `powerant-db/supabase/tests/sales/README.md` (`01_seed.sql`; add `supabase/stubs/customers_v6_stubs.sql` to try credit,
   payments and customers).
2. The local API must expose the module schemas. In `powerant-db/supabase/config.toml`, `[api] schemas` needs
   `"portal", "inventory", "sales", "customers"` next to `public` (then `npx supabase stop && npx supabase start`).
3. `.env.local` here: `VITE_SUPABASE_URL=http://127.0.0.1:54321` and the local publishable key from `npx supabase status`.
4. The seed's users have no passwords; create a local login with Supabase Studio (Authentication) and give it a
   `portal.profiles` row and Sales boxes.

## Deploy (Vercel)

1. Vercel → this project → Settings → Environment Variables: add the variables above, then redeploy.
2. Supabase → Project Settings → Data API → Exposed schemas: `sales`, `inventory`, `portal` (and `customers` once
   Customer Management is live).

## Login

`src/lib/supabase.ts`, `src/auth.ts` and `src/pages/LoginPage.*` are the shared **login kit, copied unchanged** from the
Portal. Don't edit them; updates come from the Portal as a file swap. The app shows the login on `SIGNED_OUT`, then a
"No access" card unless the person is the owner or has at least one Sales box.

## Before Customer Management is live

`sales.get_app_context()` returns `customers_live: false` today. Then:

- New sale shows a blue notice; there is no Credit option and no customer search. Sales are walk-in cash sales.
- Sale orders, Customer lookup, Payments, Cheques and Receivables show the same notice instead of a form.
- Walk-in cash sales, printing, invoices, cash refunds on returns, and analytics work fully.

Nothing to change in the app when it goes live: the database flag switches it on.

## Screens and the permission that shows them

The database enforces every rule; hiding things is only convenience. Detail and print links (from the Portal's alerts)
open for anyone the database lets see that document.

| Screen (hash route) | Shown with |
|---|---|
| New sale `#/new-sale`, delivery from an order `#/new-sale?order=<id>`, for a customer `#/new-sale?customer=<id>` | `create_sale` (Credit: `credit_sale`; discounts: `give_discount`; other supply location: `supply_from_other_location`; bundles: `choose_bundle`; earlier date: `backdate_sale`; quick add: `add_customer`) |
| Sale orders `#/orders`, new `#/orders/new`, order `#/orders/<id>`, print `#/orders/<id>/print` | `create_sale_order`, `close_sale_order` or `view_all_sales`; Deliver needs `create_sale` + `create_sale_order`; Close / Cancel need `close_sale_order` |
| Invoices `#/invoices`, invoice `#/invoices/<id>`, print `#/invoices/<id>/print?format=a4\|a5\|challan` | `view_own_sales` or `view_all_sales`; Cancel needs `cancel_invoice`; CSV needs `export_data` |
| Customer lookup `#/customers`, customer `#/customers/<id>` | `view_customer_invoices`, `view_customer_balances`, `view_all_sales` or `record_payment`; balances need `view_customer_balances` or `view_customer_invoices` |
| Payments `#/payments`, new `#/payments/new?customer=<id>`, payment `#/payments/<id>`, receipt `#/payments/<id>/print` | `record_payment` or `view_all_sales`; Cancel needs `cancel_payment`; attachments need `record_payment` or `manage_cheques` |
| Cheques `#/cheques` | `manage_cheques` or `record_payment`; Cleared / Bounced need `manage_cheques` |
| Returns `#/returns`, new `#/returns/new?invoice=<id>`, credit note `#/credit-notes/<id>` (+ `/print`), refund `#/refunds/<id>` | `issue_credit_note` or `view_all_sales` |
| Receivables `#/receivables` | `view_customer_balances` |
| Analytics `#/analytics` | `view_analytics` (profit also needs Inventory's stock-cost access) |
| Settings `#/settings` | `manage_settings` |

Any print page opened with `&auto=1` prints as soon as the document and its logo have loaded (used right after posting).

## Rules the app follows

- **Every write** is a `supabase.schema('sales').rpc(...)` call. The app never writes a table and never calls an Inventory
  or Customers write function (only `customers.search_customers` and `customers.quick_add_customer`).
- **Double submit:** each posting form makes a `request_id` when it opens and reuses it on retry; the server returns the
  same document for a repeated id. A new id is made after success.
- **Totals on screen are previews.** The server prices every line again and its numbers are saved.
- **Customer documents** (prints) show the item's `invoice_name` only, never the staff name (wires, thou).
- **Feet or metres:** entry defaults to feet (client decision); metres and the item's own units (coil…) are in the unit
  list. Lengths are *shown* in the person's own unit from `portal.get_my_settings()` (feet when the Portal doesn't have it
  yet). The entered quantity and unit are sent as they are; the server converts.
- **Errors:** the database's messages are shown as they are, with extra help for a few hints (`src/errors.ts`): not enough
  stock (names the location, item and quantities), a bundle shorter than chosen (re-opens the bundle picker), blocked
  customer, customers not live, missing permission, and network failures (the form and its `request_id` are kept).
- **Browser storage** only for conveniences (last sale location, last invoice filters, last order tab), all wrapped.

## Code map

| File | What |
|---|---|
| `src/api.ts` | Every database call, typed; numeric strings normalised |
| `src/errors.ts` | `SalesError` and the staff-friendly error text |
| `src/App.tsx` | Login gate, shared lists, sidebar, every route |
| `src/router.ts` | Hash routes (no router library) |
| `src/session.ts` | Signed-in user, permission check, items, locations, businesses, settings |
| `src/hooks.ts` | `useAsync`, `useAction`, `useDebounced`, `useRequestId`, safe storage |
| `src/format.ts` | Money, dates (Asia/Karachi), quantities and the feet/metres conversion |
| `src/units.ts` | Units offered for an item, conversions, hints |
| `src/lines.ts` | Draft sale / order lines and the totals preview (mirrors the server's rounding) |
| `src/payments.ts` | Payment drafts and oldest-first allocation suggestions |
| `src/csv.ts` | CSV export from loaded rows |
| `src/pages/*` | One file per screen |
| `src/components/*` | Header, sidebar, item picker, customer search, stock panel, bundle picker, line editor, dialogs, print shell |
| `src/print/*` | Printable documents and `print.css` (A4; the A5 receipt sets its own page size) |
| `src/styles/*` | Shared tokens and styles, copied from Inventory |

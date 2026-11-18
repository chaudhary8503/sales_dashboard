import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import './App.css';
import {
  getAppContext,
  getMyLengthUnit,
  listBusinesses,
  listItems,
  listLocations,
  type Business,
  type Item,
  type Location,
  type SalesSettings,
} from './api';
import { canOpenModule, loadSessionUser, signOut, type SessionUser } from './auth';
import { Banner, Loading, NoAccess, NotLive } from './components/Common';
import ErrorBoundary from './components/ErrorBoundary';
import Header, { type NavEntry } from './components/Header';
import Sidebar from './components/Sidebar';
import { MODULE, PORTAL_URL } from './config';
import { setErrorContext, toSalesError } from './errors';
import { setLengthUnit, todayKarachi, type LengthUnit } from './format';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import ChequesPage from './pages/ChequesPage';
import CreditNotePage from './pages/CreditNotePage';
import CustomerPage from './pages/CustomerPage';
import CustomersPage from './pages/CustomersPage';
import InvoicePage from './pages/InvoicePage';
import InvoicesPage from './pages/InvoicesPage';
import NewSalePage from './pages/NewSalePage';
import PaymentNewPage from './pages/PaymentNewPage';
import PaymentPage from './pages/PaymentPage';
import PaymentsPage from './pages/PaymentsPage';
import ReceivablesPage from './pages/ReceivablesPage';
import RefundPage from './pages/RefundPage';
import ReturnNewPage from './pages/ReturnNewPage';
import ReturnsPage from './pages/ReturnsPage';
import SaleOrderNewPage from './pages/SaleOrderNewPage';
import SaleOrderPage from './pages/SaleOrderPage';
import SaleOrdersPage from './pages/SaleOrdersPage';
import ChallanPrint from './print/ChallanPrint';
import CreditNotePrint from './print/CreditNotePrint';
import InvoicePrint from './print/InvoicePrint';
import PaymentReceiptPrint from './print/PaymentReceiptPrint';
import SaleOrderPrint from './print/SaleOrderPrint';
import { useRoute, type Route } from './router';
import { makeCan, type Session } from './session';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setUser(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <LoginPage title="Sales" onSuccess={setUser} />;

  if (!canOpenModule(user, MODULE)) {
    return (
      <div className="login-shell">
        <div className="card login-card">
          <h1 className="page-title">No access</h1>
          <p className="page-sub">You don't have access to this module. Ask the owner.</p>
          <div className="form-actions">
            <a className="btn btn-secondary" href={PORTAL_URL}>
              ← Back to the Portal
            </a>
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <SalesApp user={user} />;
}

const DEFAULT_SETTINGS: SalesSettings = {
  overdue_warning_days: 0,
  overdue_critical_days: 30,
  cheque_pending_days: 3,
  sale_order_due_days: 0,
  default_receipt_format: 'a4',
  receipt_footer: null,
  invoice_terms: null,
  default_tax_rate: null,
};

function SalesApp({ user }: { user: SessionUser }) {
  const route = useRoute();
  const can = useMemo(() => makeCan(user), [user]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [lengthUnit, setUnit] = useState<LengthUnit>('ft');
  const [customersLive, setCustomersLive] = useState(false);
  const [settings, setSettings] = useState<SalesSettings>(DEFAULT_SETTINGS);
  const [today, setToday] = useState(todayKarachi());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [ctx, l, i, unit, b] = await Promise.all([
        getAppContext(),
        listLocations(),
        listItems(),
        getMyLengthUnit(),
        listBusinesses(),
      ]);
      // Feet / metres is the person's own setting (Portal); set before anything renders.
      setLengthUnit(unit);
      setUnit(unit);
      setErrorContext(i, l);
      setCustomersLive(ctx.customers_live);
      setSettings({ ...DEFAULT_SETTINGS, ...ctx.settings });
      setToday(ctx.today ?? todayKarachi());
      setItems(i);
      setLocations(l);
      setBusinesses(b);
      setError(null);
    } catch (e) {
      setError(toSalesError(e).message);
    } finally {
      setReady(true);
    }
  }, []);

  // Loads the shared lists from the database (an external system); state is set after the await.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  const session: Session = { user, can, items, locations, businesses, lengthUnit, customersLive, settings, today, reload };

  // Grouped for the sidebar; entries in the same group must stay next to each other.
  const nav: NavEntry[] = [
    { group: 'Sell', key: 'new-sale', label: 'New sale', allowed: can('create_sale') },
    {
      group: 'Sell',
      key: 'orders',
      label: 'Sale orders',
      allowed: can('create_sale_order') || can('close_sale_order') || can('view_all_sales'),
    },
    { group: 'Sell', key: 'invoices', label: 'Invoices', allowed: can('view_own_sales') || can('view_all_sales') },
    {
      group: 'Customers',
      key: 'customers',
      label: 'Customer lookup',
      allowed: can('view_customer_invoices') || can('view_customer_balances') || can('view_all_sales') || can('record_payment'),
    },
    { group: 'Customers', key: 'payments', label: 'Payments', allowed: can('record_payment') || can('view_all_sales') },
    { group: 'Customers', key: 'cheques', label: 'Cheques', allowed: can('manage_cheques') || can('record_payment') },
    { group: 'Customers', key: 'returns', label: 'Returns', allowed: can('issue_credit_note') || can('view_all_sales') },
    { group: 'Reports', key: 'receivables', label: 'Receivables', allowed: can('view_customer_balances') },
    { group: 'Reports', key: 'analytics', label: 'Analytics', allowed: can('view_analytics') },
    { group: 'Setup', key: 'settings', label: 'Settings', allowed: can('manage_settings') },
  ];
  const firstAllowed = nav.find((n) => n.allowed)?.key;
  const section = route.path[0] ?? firstAllowed ?? '';
  const activeTab = section === 'credit-notes' ? 'returns' : section === 'refunds' ? 'payments' : section;
  const allowed = (key: string) => nav.find((n) => n.key === key)?.allowed ?? false;

  let page: ReactNode;
  if (!ready) page = <Loading />;
  else if (error) page = <Banner kind="error">Couldn't load Sales: {error}</Banner>;
  else page = renderPage(session, route, section, allowed);

  return (
    <div className="app-shell">
      <Header session={session} menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((o) => !o)} />
      <div className="app-frame">
        <Sidebar nav={nav} active={activeTab} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <main className="app-body">
          <div className="page">
            <div className="page-inner">
              <ErrorBoundary resetKey={window.location.hash}>{page}</ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Screens that need Customer Management show a notice until it is live. */
const NEEDS_CUSTOMERS: Record<string, string> = {
  orders: 'Sale orders',
  customers: 'Customer lookup',
  payments: 'Payments',
  cheques: 'Cheques',
  receivables: 'Receivables',
};

function renderPage(session: Session, route: Route, section: string, allowed: (key: string) => boolean): ReactNode {
  const { path } = route;
  if (!session.customersLive && NEEDS_CUSTOMERS[section] && allowed(section)) {
    // Existing documents can still be opened and printed (e.g. a payment link from an alert).
    if (!(path[1] && path[1] !== 'new')) return <NotLive title={NEEDS_CUSTOMERS[section]} />;
  }
  const id = path[1] && path[1] !== 'new' ? path[1] : null;
  const isPrint = path[2] === 'print';
  const auto = route.query.get('auto') === '1';
  // Opening one document (detail or print) is checked by the database (own / all / searched customer);
  // a link from the Portal must work for anyone allowed to see it.
  switch (section) {
    case 'new-sale':
      return allowed(section) ? <NewSalePage session={session} orderId={route.query.get('order')} customerId={route.query.get('customer')} /> : <NoAccess />;
    case 'invoices': {
      if (id && isPrint) {
        const format = route.query.get('format');
        if (format === 'challan') return <ChallanPrint session={session} invoiceId={id} />;
        return <InvoicePrint session={session} invoiceId={id} format={format === 'a5' ? 'a5' : 'a4'} auto={auto} />;
      }
      if (id) return <InvoicePage session={session} invoiceId={id} />;
      return allowed(section) ? <InvoicesPage session={session} /> : <NoAccess />;
    }
    case 'orders': {
      if (id && isPrint) return <SaleOrderPrint session={session} orderId={id} auto={auto} />;
      if (id) return <SaleOrderPage session={session} orderId={id} />;
      if (path[1] === 'new') return session.can('create_sale_order') ? <SaleOrderNewPage session={session} customerId={route.query.get('customer')} /> : <NoAccess />;
      return allowed(section) ? <SaleOrdersPage session={session} /> : <NoAccess />;
    }
    case 'payments': {
      if (id && isPrint) return <PaymentReceiptPrint session={session} paymentId={id} auto={auto} />;
      if (id) return <PaymentPage session={session} paymentId={id} />;
      if (path[1] === 'new')
        return session.can('record_payment') ? <PaymentNewPage session={session} customerId={route.query.get('customer')} /> : <NoAccess />;
      return allowed(section) ? <PaymentsPage session={session} /> : <NoAccess />;
    }
    case 'credit-notes':
      if (id && isPrint) return <CreditNotePrint session={session} creditNoteId={id} auto={auto} />;
      return id ? <CreditNotePage session={session} creditNoteId={id} /> : <NoAccess />;
    case 'refunds':
      return id ? <RefundPage session={session} refundId={id} /> : <NoAccess />;
    case 'returns':
      if (path[1] === 'new')
        return session.can('issue_credit_note') ? <ReturnNewPage session={session} invoiceId={route.query.get('invoice')} /> : <NoAccess />;
      return allowed(section) ? <ReturnsPage session={session} /> : <NoAccess />;
    case 'customers':
      if (!allowed(section)) return <NoAccess />;
      return id ? <CustomerPage session={session} customerId={id} /> : <CustomersPage session={session} />;
    case 'cheques':
      return allowed(section) ? <ChequesPage session={session} /> : <NoAccess />;
    case 'receivables':
      return allowed(section) ? <ReceivablesPage session={session} /> : <NoAccess />;
    case 'analytics':
    case 'settings':
      return allowed(section) ? <Placeholder /> : <NoAccess />;
    default:
      return <NoAccess />;
  }
}

function Placeholder() {
  return (
    <div className="card">
      <h1 className="page-title">Coming soon</h1>
      <p className="page-sub">This screen is being built.</p>
    </div>
  );
}

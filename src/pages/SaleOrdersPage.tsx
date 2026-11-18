import { useState } from 'react';
import { listSaleOrders, type SaleOrderStatus } from '../api';
import { Banner, Empty, Loading, StatusTag } from '../components/Common';
import { formatDate, formatMoney } from '../format';
import { deliveredShare } from '../lines';
import { storageGet, storageSet, useAsync, useDebounced } from '../hooks';
import { go, href } from '../router';
import type { Session } from '../session';

const TABS: { key: SaleOrderStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'part_delivered', label: 'Part delivered' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];
const TAB_KEY = 'sales:ordersTab';

function SaleOrdersPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<SaleOrderStatus>(() => {
    const saved = storageGet(TAB_KEY) as SaleOrderStatus | null;
    return saved && TABS.some((t) => t.key === saved) ? saved : 'open';
  });
  const [search, setSearch] = useState('');
  const settled = useDebounced(search, 300);
  const { data, error, loading } = useAsync(() => listSaleOrders(tab, settled), [tab, settled]);
  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sale orders</h1>
          <p className="page-sub">Orders taken for goods to be made or delivered later. Open one to deliver, print, close or cancel it.</p>
        </div>
        {session.can('create_sale_order') && (
          <a className="btn btn-primary" href={href('orders/new')}>
            New order
          </a>
        )}
      </div>
      <div className="card">
        <div className="tabs" role="group" aria-label="Status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => {
                setTab(t.key);
                storageSet(TAB_KEY, t.key);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="filters">
          <input
            className="grow"
            type="search"
            placeholder="Order number or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
        </div>
        {tab === 'open' && <p className="table-note tab-note">Open includes part-delivered orders (still to deliver).</p>}
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No sale orders here.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Expected</th>
                  <th className="num">Total</th>
                  <th>Delivered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const share = deliveredShare(o.lines);
                  const late = o.expected_date && o.expected_date < session.today && (o.status === 'open' || o.status === 'part_delivered');
                  return (
                    <tr key={o.sale_order_id} className="clickable" onClick={() => go(`orders/${o.sale_order_id}`)}>
                      <td className="mono">
                        <a href={href(`orders/${o.sale_order_id}`)} onClick={(e) => e.stopPropagation()}>
                          {o.sale_order_no}
                        </a>
                      </td>
                      <td className="mono">{formatDate(o.order_date)}</td>
                      <td>{o.customer_name}</td>
                      <td className={`mono${late ? ' amber' : ''}`}>{formatDate(o.expected_date)}</td>
                      <td className="mono num">{formatMoney(o.total)}</td>
                      <td>
                        <div className="progress" title={`${Math.round(share * 100)}% delivered`}>
                          <div style={{ width: `${share * 100}%` }} />
                        </div>
                        <span className="sub">{Math.round(share * 100)}%</span>
                      </td>
                      <td>
                        <StatusTag status={o.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default SaleOrdersPage;

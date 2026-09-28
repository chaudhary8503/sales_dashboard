import { useMemo, useState } from 'react';
import FilterBar, { type Filters } from '../components/FilterBar';
import KpiCard from '../components/KpiCard';
import LocationBreakdown from '../components/LocationBreakdown';
import TransactionTable from '../components/TransactionTable';
import { formatPKR, isoDaysAgo } from '../format';
import { LOCATIONS, SALES } from '../mockData';
import './Dashboard.css';

// Last 30 days including today.
const DEFAULT_FILTERS: Filters = {
  from: isoDaysAgo(29),
  to: isoDaysAgo(0),
  department: 'All',
  location: 'All',
};

function sum(sales: { amount: number }[]): number {
  return sales.reduce((total, s) => total + s.amount, 0);
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}% of total` : '—';
}

function Dashboard() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = useMemo(
    () =>
      SALES.filter(
        (s) =>
          s.date >= filters.from &&
          s.date <= filters.to &&
          (filters.department === 'All' || s.department === filters.department) &&
          (filters.location === 'All' || s.location === filters.location),
      ),
    [filters],
  );

  const cash = filtered.filter((s) => s.paymentType === 'Cash');
  const credit = filtered.filter((s) => s.paymentType === 'Credit');
  const total = sum(filtered);
  const cashTotal = sum(cash);
  const creditTotal = sum(credit);

  const shownLocations = filters.location === 'All' ? LOCATIONS : [filters.location];
  const byLocation = shownLocations
    .map((location) => ({ location, total: sum(filtered.filter((s) => s.location === location)) }))
    .sort((a, b) => b.total - a.total);

  return (
    <>
      <h1 className="page-title">Sales</h1>
      <p className="page-sub">Sales across departments and locations for the selected period.</p>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="kpi-row">
        <KpiCard
          label="Total sales"
          value={formatPKR(total)}
          sub={`${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`}
        />
        <KpiCard label="Cash" value={formatPKR(cashTotal)} sub={pct(cashTotal, total)} />
        <KpiCard label="Credit" value={formatPKR(creditTotal)} sub={pct(creditTotal, total)} />
      </div>

      <LocationBreakdown rows={byLocation} />

      <TransactionTable sales={filtered} />
    </>
  );
}

export default Dashboard;

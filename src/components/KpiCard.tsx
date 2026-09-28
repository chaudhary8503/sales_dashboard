import './KpiCard.css';

interface KpiCardProps {
  label: string;
  value: string;
  /** Small muted line under the value, e.g. transaction count or share. */
  sub?: string;
}

// Same look as production-monitor's MetricCard, plus an optional sub line.
function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export default KpiCard;

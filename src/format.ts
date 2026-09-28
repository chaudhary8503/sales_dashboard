const pkr = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatPKR(amount: number): string {
  return `Rs ${pkr.format(amount)}`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** "2026-09-28" -> "28 Sep 2026" (parsed as a local date, not UTC). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

/** Local date as YYYY-MM-DD, `daysAgo` days before today. */
export function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

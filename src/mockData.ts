/*
  ============================================================================
  TEMPORARY MOCK DATA — NOT REAL SALES.
  ============================================================================
  This whole file is a stand-in until the backend API (fed from Manager.io)
  exists. To go live, replace `SALES` with the result of an API call (e.g. a
  `useSales()` hook that fetches `/api/sales`) returning the same `Sale` shape,
  and delete everything below the types.

  Records are generated from a fixed seed, so amounts/departments/locations
  are identical on every load; dates are anchored to "today" so the default
  last-30-days view always has data.
*/

export type Department = 'Cable' | 'PVC';
export type PaymentType = 'Cash' | 'Credit';

export interface Sale {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:MM (24h). */
  time: string;
  department: Department;
  location: string;
  paymentType: PaymentType;
  /** PKR, whole rupees. */
  amount: number;
}

export const DEPARTMENTS: Department[] = ['Cable', 'PVC'];
export const LOCATIONS = ['Main Branch', 'Shop 1', 'Shop 2', 'Shop 3', 'Shop 4'];

// ---------------------------------------------------------------------------
// Mock generator — delete when the real API is wired up.
// ---------------------------------------------------------------------------

// Small deterministic PRNG (mulberry32) so the dataset is stable across reloads.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260928);

function pickWeighted<T>(options: [T, number][]): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, weight] of options) {
    r -= weight;
    if (r <= 0) return value;
  }
  return options[options.length - 1][0];
}

// Log-uniform between min and max — lots of small tickets, a few big orders.
function logUniform(min: number, max: number): number {
  return Math.exp(Math.log(min) + rand() * (Math.log(max) - Math.log(min)));
}

// Main Branch handles wholesale/contractor orders; shops are mostly walk-in.
const LOCATION_WEIGHTS: [string, number][] = [
  ['Main Branch', 38],
  ['Shop 1', 24],
  ['Shop 2', 17],
  ['Shop 3', 13],
  ['Shop 4', 8],
];

// Share of sales on credit, per location (wholesale buyers run accounts).
const CREDIT_SHARE: Record<string, number> = {
  'Main Branch': 0.58,
  'Shop 1': 0.34,
  'Shop 2': 0.28,
  'Shop 3': 0.22,
  'Shop 4': 0.15,
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateSales(): Sale[] {
  const sales: Sale[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Days 59..0 back from today = 60 days including today.
  for (let daysAgo = 59; daysAgo >= 0; daysAgo--) {
    const day = new Date(today);
    day.setDate(today.getDate() - daysAgo);
    const weekday = day.getDay();

    // Sunday is mostly closed; Saturday is a little busier.
    let count: number;
    if (weekday === 0) count = rand() < 0.3 ? 1 : 0;
    else count = 2 + Math.floor(rand() * (weekday === 6 ? 5 : 4));

    for (let i = 0; i < count; i++) {
      const location = pickWeighted(LOCATION_WEIGHTS);
      const isMain = location === 'Main Branch';
      const department: Department = pickWeighted([
        ['Cable', isMain ? 70 : 60],
        ['PVC', isMain ? 30 : 40],
      ]);
      const paymentType: PaymentType = rand() < CREDIT_SHARE[location] ? 'Credit' : 'Cash';

      // Cable tickets run larger than PVC; Main Branch has the big orders.
      const [min, max] =
        department === 'Cable'
          ? isMain
            ? [15_000, 450_000]
            : [6_000, 180_000]
          : isMain
            ? [8_000, 160_000]
            : [2_500, 75_000];
      // Round to the nearest 50 rupees, like a real invoice total might be.
      const amount = Math.round(logUniform(min, max) / 50) * 50;

      // Business hours 09:30–19:30.
      const minutes = 9 * 60 + 30 + Math.floor(rand() * 600);
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

      sales.push({
        id: `S-${String(sales.length + 1).padStart(4, '0')}`,
        date: toIsoDate(day),
        time,
        department,
        location,
        paymentType,
        amount,
      });
    }
  }

  return sales;
}

export const SALES: Sale[] = generateSales();

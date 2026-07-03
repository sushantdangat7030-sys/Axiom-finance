/** Recurring-payment detection. Ported from the scaffold's detector and extended
 *  with next-billing-date and cost projections. Pure function — testable. */

export type Frequency = "weekly" | "biweekly" | "monthly" | "yearly";

export interface SubTxn {
  merchantKey: string;
  merchant: string;
  amount: number; // negative expense
  currency: string;
  date: string;   // YYYY-MM-DD
  categoryId?: string | null;
}

export interface DetectedSubscription {
  merchant: string;
  merchantKey: string;
  amount: number;          // typical charge (abs)
  currency: string;
  frequency: Frequency;
  lastSeenDate: string;
  nextBillingDate: string;
  monthlyCost: number;
  annualCost: number;
  occurrences: number;
  categoryId?: string | null;
}

const FREQ_DAYS: Record<Frequency, number> = { weekly: 7, biweekly: 14, monthly: 30, yearly: 365 };
const FREQ_MONTHLY: Record<Frequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 };

function classifyInterval(days: number): Frequency | null {
  if (days >= 5 && days <= 9) return "weekly";
  if (days >= 12 && days <= 16) return "biweekly";
  if (days >= 26 && days <= 35) return "monthly";
  if (days >= 350 && days <= 380) return "yearly";
  return null;
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

function mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  let best = values[0], bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}

function detectFrequency(dates: string[]): Frequency | null {
  if (dates.length < 2) return null;
  const buckets: Record<Frequency, number> = { weekly: 0, biweekly: 0, monthly: 0, yearly: 0 };
  for (let i = 1; i < dates.length; i++) {
    const f = classifyInterval(daysBetween(dates[i - 1], dates[i]));
    if (f) buckets[f]++;
  }
  const [top, n] = (Object.entries(buckets) as [Frequency, number][]).sort((a, b) => b[1] - a[1])[0];
  if (n === 0) return null;
  if (dates.length === 2) return top;
  return n >= 2 ? top : null;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Group expenses by merchantKey (amounts within ±15% of the group's typical
 * charge) and detect a stable cadence. Requires ≥2 occurrences.
 */
export function detectSubscriptions(txns: SubTxn[]): DetectedSubscription[] {
  const groups = new Map<string, SubTxn[]>();
  for (const t of txns) {
    if (t.amount >= 0 || !t.merchantKey) continue;
    (groups.get(t.merchantKey) ?? groups.set(t.merchantKey, []).get(t.merchantKey)!).push(t);
  }

  const out: DetectedSubscription[] = [];
  for (const all of groups.values()) {
    all.sort((a, b) => a.date.localeCompare(b.date));
    const typical = Math.abs(mode(all.map((t) => Math.round(Math.abs(t.amount)))));
    const series = all.filter(
      (t) => Math.abs(Math.abs(t.amount) - typical) <= Math.max(1, typical * 0.15)
    );
    if (series.length < 2) continue;
    const freq = detectFrequency(series.map((t) => t.date));
    if (!freq) continue;
    const last = series[series.length - 1];
    const amount = Math.abs(mode(series.map((t) => Math.abs(t.amount))));
    out.push({
      merchant: last.merchant,
      merchantKey: last.merchantKey,
      amount,
      currency: last.currency,
      frequency: freq,
      lastSeenDate: last.date,
      nextBillingDate: addDays(last.date, FREQ_DAYS[freq]),
      monthlyCost: Math.round(amount * FREQ_MONTHLY[freq] * 100) / 100,
      annualCost: Math.round(amount * FREQ_MONTHLY[freq] * 12 * 100) / 100,
      occurrences: series.length,
      categoryId: last.categoryId ?? null,
    });
  }
  return out.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

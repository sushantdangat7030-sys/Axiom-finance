/** Rule-computed financial insights: overspending, subscription waste,
 *  anomalies, savings tips. Pure — an LLM can optionally rewrite `message`s. */

export interface InsightTxn {
  amount: number;        // negative expense
  date: string;          // YYYY-MM-DD
  categoryName: string;
  merchant: string;
  merchantKey: string;
}

export interface SubCost { merchant: string; monthlyCost: number }

export interface Insight {
  kind: "overspend" | "subscription_waste" | "anomaly" | "savings" | "positive";
  severity: "info" | "warning" | "critical";
  message: string;
  data?: Record<string, unknown>;
}

const monthOf = (d: string) => d.slice(0, 7);

function spendByCategory(txns: InsightTxn[], month: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns)
    if (t.amount < 0 && monthOf(t.date) === month)
      m.set(t.categoryName, (m.get(t.categoryName) ?? 0) - t.amount);
  return m;
}

export function generateInsights(
  txns: InsightTxn[],
  subs: SubCost[],
  opts: { month?: string; currency?: (n: number) => string } = {}
): Insight[] {
  const fmt = opts.currency ?? ((n: number) => n.toFixed(0));
  const months = [...new Set(txns.map((t) => monthOf(t.date)))].sort();
  const cur = opts.month ?? months[months.length - 1];
  const prev = cur ? months[months.indexOf(cur) - 1] : undefined;
  const out: Insight[] = [];

  // 1. month-over-month overspend per category (≥20% and meaningful amount)
  if (cur && prev) {
    const now = spendByCategory(txns, cur), before = spendByCategory(txns, prev);
    for (const [cat, amt] of now) {
      const prevAmt = before.get(cat) ?? 0;
      if (prevAmt > 0 && amt > prevAmt * 1.2 && amt - prevAmt > 20) {
        const pct = Math.round(((amt - prevAmt) / prevAmt) * 100);
        out.push({
          kind: "overspend",
          severity: pct >= 50 ? "critical" : "warning",
          message: `You spent ${pct}% more on ${cat} this month (${fmt(amt)} vs ${fmt(prevAmt)}).`,
          data: { category: cat, current: amt, previous: prevAmt, pct },
        });
      }
    }
    // positive reinforcement: biggest drop
    let bestCat = "", bestDrop = 0;
    for (const [cat, prevAmt] of before) {
      const drop = prevAmt - (spendByCategory(txns, cur).get(cat) ?? 0);
      if (drop > bestDrop && drop > 20) { bestDrop = drop; bestCat = cat; }
    }
    if (bestCat)
      out.push({ kind: "positive", severity: "info",
        message: `Nice — ${bestCat} spending is down ${fmt(bestDrop)} vs last month.` });
  }

  // 2. subscription waste: total + overlapping streaming services
  const subTotal = subs.reduce((s, x) => s + x.monthlyCost, 0);
  if (subTotal > 0)
    out.push({ kind: "subscription_waste", severity: "info",
      message: `Subscriptions cost ${fmt(subTotal)}/month (${fmt(subTotal * 12)}/year) across ${subs.length} services.`,
      data: { monthly: subTotal, annual: subTotal * 12, count: subs.length } });
  const streaming = subs.filter((s) =>
    /netflix|hulu|disney|hbo|max|prime|hotstar|spotify|apple (tv|music)|youtube/i.test(s.merchant));
  if (streaming.length >= 3)
    out.push({ kind: "subscription_waste", severity: "warning",
      message: `You pay for ${streaming.length} streaming services (${streaming.map((s) => s.merchant).join(", ")}). Dropping one saves up to ${fmt(Math.max(...streaming.map((s) => s.monthlyCost)) * 12)}/year.` });

  // 3. anomaly: single expense > mean + 2.5σ of that merchant/category history
  const expenses = txns.filter((t) => t.amount < 0 && monthOf(t.date) === cur);
  const history = txns.filter((t) => t.amount < 0 && monthOf(t.date) !== cur);
  if (history.length >= 8) {
    const vals = history.map((t) => -t.amount);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    for (const t of expenses) {
      if (-t.amount > mean + 2.5 * sd && -t.amount > 50)
        out.push({ kind: "anomaly", severity: "warning",
          message: `Unusually large charge: ${fmt(-t.amount)} at ${t.merchant} on ${t.date}.`,
          data: { merchant: t.merchant, amount: -t.amount, date: t.date } });
    }
  }

  // 4. savings tip: top discretionary category this month
  const now = spendByCategory(txns, cur);
  const discretionary = ["Dining", "Shopping", "Entertainment"];
  const top = discretionary
    .map((c) => [c, now.get(c) ?? 0] as const)
    .sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 0)
    out.push({ kind: "savings", severity: "info",
      message: `${top[0]} is your biggest flexible category this month (${fmt(top[1])}). Trimming 20% saves about ${fmt(top[1] * 0.2)}.` });

  return out.slice(0, 8);
}

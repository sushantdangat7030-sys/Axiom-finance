import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateInsights } from "@/lib/engine/insights";
import { merchantKey } from "@/lib/engine/normalize";

export const dynamic = "force-dynamic";

function fmt(n: number, cur: string) {
  return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en", {
    style: "currency", currency: cur, maximumFractionDigits: 0,
  }).format(n);
}
type CatRef = { name: string; emoji?: string } | null;

export default async function Dashboard() {
  const supabase = await supabaseServer();
  const month = new Date().toISOString().slice(0, 7);
  const since = new Date(); since.setMonth(since.getMonth() - 3);
  const [{ data: profile }, { data: txns }, { data: subs }, { count: dupCount }] =
    await Promise.all([
      supabase.from("profiles").select("currency").single(),
      supabase.from("transactions").select("amount,date,merchant,source,categories(name,emoji)")
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: false }).limit(5000),
      supabase.from("subscriptions").select("merchant,monthly_cost").eq("status", "active"),
      supabase.from("duplicate_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);
  const cur = profile?.currency ?? "USD";
  const all = txns ?? [];
  const rows = all.filter((t) => t.date >= `${month}-01`);
  const spend = rows.filter((t) => Number(t.amount) < 0).reduce((s, t) => s - Number(t.amount), 0);
  const income = rows.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const subTotal = (subs ?? []).reduce((s, x) => s + Number(x.monthly_cost), 0);

  const byCat = new Map<string, { emoji: string; total: number }>();
  for (const t of rows) {
    if (Number(t.amount) >= 0) continue;
    const c = t.categories as unknown as CatRef;
    const key = c?.name ?? "Other";
    const e = byCat.get(key) ?? { emoji: c?.emoji ?? "📦", total: 0 };
    e.total -= Number(t.amount);
    byCat.set(key, e);
  }
  const topCats = [...byCat.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  const maxCat = topCats[0]?.[1].total ?? 1;

  const insights = generateInsights(
    all.map((t) => ({
      amount: Number(t.amount), date: t.date, merchant: t.merchant,
      merchantKey: merchantKey(t.merchant),
      categoryName: (t.categories as unknown as CatRef)?.name ?? "Other",
    })),
    (subs ?? []).map((s) => ({ merchant: s.merchant, monthlyCost: Number(s.monthly_cost) })),
    { currency: (n) => fmt(n, cur) }
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        {dupCount ? (
          <Link href="/settings#duplicates">
            <Badge variant="destructive">{dupCount} possible duplicate{dupCount === 1 ? "" : "s"}</Badge>
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Spent this month", fmt(spend, cur)],
          ["Income this month", fmt(income, cur)],
          ["Net", fmt(income - spend, cur)],
          ["Subscriptions / mo", fmt(subTotal, cur)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold tabular-nums">{value}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top categories · this month</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topCats.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No transactions yet — <Link className="underline" href="/import">import a file</Link> or
                connect email in <Link className="underline" href="/settings">Settings</Link>.
              </p>
            )}
            {topCats.map(([name, { emoji, total }]) => (
              <div key={name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{emoji} {name}</span>
                  <span className="tabular-nums">{fmt(total, cur)}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-primary" style={{ width: `${(total / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">AI insights</CardTitle></CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Insights appear once you have a month or two of data.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {insights.map((i, k) => (
                  <li key={k} className="flex gap-2">
                    <span>{i.severity === "critical" ? "🔴" : i.severity === "warning" ? "🟡" : "💡"}</span>
                    <span>{i.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent transactions</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {rows.slice(0, 8).map((t, i) => (
            <div key={i} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">{t.merchant}</div>
                <div className="text-xs text-muted-foreground">
                  {t.date} · {(t.categories as unknown as CatRef)?.name ?? "Other"} · {t.source}
                </div>
              </div>
              <span className={`tabular-nums ${Number(t.amount) > 0 ? "text-green-600" : ""}`}>
                {fmt(Number(t.amount), cur)}
              </span>
            </div>
          ))}
          {rows.length > 0 && (
            <div className="pt-3 text-sm"><Link className="underline" href="/transactions">See all →</Link></div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

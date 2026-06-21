import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatPanel } from "@/components/chat-panel";
import { DashboardActions } from "@/components/dashboard-actions";
import { SpendChart } from "@/components/spend-chart";
import { pool } from "@/lib/db";
import { getMonthlySpendByCategory } from "@/lib/spending";

async function getAccountCount() {
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM accounts");
  return rows[0].count as number;
}

async function getMonthTotals() {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (
         WHERE date >= date_trunc('month', CURRENT_DATE)
       ), 0) AS this_month,
       COALESCE(SUM(amount) FILTER (
         WHERE date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
           AND date < date_trunc('month', CURRENT_DATE)
       ), 0) AS last_month
     FROM transactions
     WHERE amount > 0`
  );
  return {
    thisMonth: Number(rows[0].this_month),
    lastMonth: Number(rows[0].last_month),
  };
}

function buildChartData(rows: { month: string; category_name: string | null; spend: string }[]) {
  const byMonth = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, { month: row.month });
    if (row.category_name) {
      byMonth.get(row.month)![row.category_name] = Number(row.spend);
    }
  }
  return [...byMonth.values()];
}

export default async function DashboardPage() {
  const accountCount = await getAccountCount();

  if (accountCount === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Welcome to Expense Tracker</h1>
        <p className="text-muted-foreground max-w-sm text-center text-sm">
          Connect a bank account to start tracking transactions, subscriptions, and budgets.
        </p>
        <Button asChild>
          <Link href="/connect">Connect a bank</Link>
        </Button>
      </main>
    );
  }

  const [{ thisMonth, lastMonth }, monthlySpend] = await Promise.all([
    getMonthTotals(),
    getMonthlySpendByCategory(6),
  ]);
  const chartData = buildChartData(monthlySpend);
  const delta = lastMonth === 0 ? 0 : ((thisMonth - lastMonth) / lastMonth) * 100;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <DashboardActions />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${thisMonth.toFixed(2)}</p>
            <p className="text-muted-foreground text-sm">
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}% vs last month (${lastMonth.toFixed(2)})
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <SpendChart data={chartData} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No spending data yet. Run a sync first.
            </p>
          )}
        </CardContent>
      </Card>

      <ChatPanel />
    </main>
  );
}

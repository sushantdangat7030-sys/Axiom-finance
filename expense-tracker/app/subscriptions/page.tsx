"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Sub = {
  id: string; merchant: string; amount: number; currency: string;
  frequency: string; next_billing_date: string | null;
  monthly_cost: number; annual_cost: number; status: string;
};

const fmt = (n: number, cur: string) =>
  new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en",
    { style: "currency", currency: cur || "USD", maximumFractionDigits: 2 }).format(n);

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/subscriptions")).json();
    setSubs(d.subscriptions ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function redetect() {
    setBusy(true);
    await fetch("/api/subscriptions", { method: "POST" });
    await load();
    setBusy(false);
  }

  const active = subs.filter((s) => s.status === "active");
  const monthly = active.reduce((s, x) => s + Number(x.monthly_cost), 0);
  const cur = active[0]?.currency ?? "USD";

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <Button variant="outline" size="sm" onClick={redetect} disabled={busy}>
          {busy ? "Detecting…" : "Re-detect from transactions"}
        </Button>
      </div>
      {active.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {active.length} active · {fmt(monthly, cur)}/month · {fmt(monthly * 12, cur)}/year projected
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {active.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No recurring payments detected yet. Import a few months of data, then re-detect.
          </p>
        )}
        {active.map((s) => (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{s.merchant}</span>
                <Badge variant="outline">{s.frequency}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="text-lg font-semibold tabular-nums">{fmt(Number(s.amount), s.currency)}</div>
              {s.next_billing_date && (
                <div className="text-muted-foreground">Next bill: {s.next_billing_date}</div>
              )}
              <div className="text-muted-foreground">
                {fmt(Number(s.monthly_cost), s.currency)}/mo · {fmt(Number(s.annual_cost), s.currency)}/yr
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

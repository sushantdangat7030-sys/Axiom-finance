"use client";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Cat = { id: string; name: string; emoji: string };
type Txn = {
  id: string; merchant: string; amount: number; currency: string; date: string;
  source: string; review_needed: boolean; confidence_score: number;
  category_id: string | null; categories: { name: string; emoji: string } | null;
};

export default function TransactionsPage() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [q, setQ] = useState("");
  const [review, setReview] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ limit: "200" });
    if (q) p.set("q", q);
    if (review) p.set("review", "true");
    const r = await fetch(`/api/transactions?${p}`);
    const d = await r.json();
    setTxns(d.transactions ?? []);
    setLoading(false);
  }, [q, review]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((d) => setCats(d.categories ?? []));
  }, []);

  async function setCategory(id: string, categoryId: string) {
    setTxns((ts) => ts.map((t) => t.id === id
      ? { ...t, category_id: categoryId, review_needed: false,
          categories: cats.find((c) => c.id === categoryId)
            ? { name: cats.find((c) => c.id === categoryId)!.name, emoji: cats.find((c) => c.id === categoryId)!.emoji }
            : t.categories }
      : t));
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ category_id: categoryId }),
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction?")) return;
    setTxns((ts) => ts.filter((t) => t.id !== id));
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="ml-auto flex gap-2">
          <Button variant={review ? "default" : "outline"} size="sm" onClick={() => setReview(!review)}>
            Needs review
          </Button>
          <a href="/api/export?format=csv"><Button variant="outline" size="sm">CSV</Button></a>
          <a href="/api/export?format=xlsx"><Button variant="outline" size="sm">Excel</Button></a>
        </div>
      </div>
      <Input placeholder="Search merchant…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="divide-y rounded-lg border">
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {!loading && txns.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Nothing here yet. Import files or sync email.</p>
        )}
        {txns.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                <span className="truncate">{t.merchant}</span>
                {t.review_needed && <Badge variant="outline" className="text-amber-600">review</Badge>}
                {t.confidence_score < 0.7 && !t.review_needed && (
                  <Badge variant="outline">{Math.round(t.confidence_score * 100)}%</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{t.date} · {t.source}</div>
            </div>
            <select
              className="rounded-md border bg-background px-2 py-1 text-xs"
              value={t.category_id ?? ""}
              onChange={(e) => setCategory(t.id, e.target.value)}>
              <option value="" disabled>category…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
            <span className={`w-24 text-right tabular-nums ${t.amount > 0 ? "text-green-600" : ""}`}>
              {new Intl.NumberFormat(t.currency === "INR" ? "en-IN" : "en",
                { style: "currency", currency: t.currency || "USD" }).format(t.amount)}
            </span>
            <button className="px-1 text-muted-foreground hover:text-red-600" onClick={() => remove(t.id)}>✕</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Changing a category teaches Axiom — the same merchant is categorized automatically next time.
      </p>
    </main>
  );
}

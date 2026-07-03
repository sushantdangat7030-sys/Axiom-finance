import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { generateInsights } from "@/lib/engine/insights";
import { merchantKey } from "@/lib/engine/normalize";

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const since = new Date(); since.setMonth(since.getMonth() - 3);
  const [{ data: txns }, { data: subs }, { data: profile }] = await Promise.all([
    supabase.from("transactions")
      .select("amount,date,merchant,categories(name)")
      .gte("date", since.toISOString().slice(0, 10)).limit(5000),
    supabase.from("subscriptions").select("merchant,monthly_cost").eq("status", "active"),
    supabase.from("profiles").select("currency").single(),
  ]);
  const cur = profile?.currency ?? "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en", {
      style: "currency", currency: cur, maximumFractionDigits: 0,
    }).format(n);

  const insights = generateInsights(
    (txns ?? []).map((t) => ({
      amount: Number(t.amount), date: t.date, merchant: t.merchant,
      merchantKey: merchantKey(t.merchant),
      categoryName: (t.categories as unknown as { name: string } | null)?.name ?? "Other",
    })),
    (subs ?? []).map((s) => ({ merchant: s.merchant, monthlyCost: Number(s.monthly_cost) })),
    { currency: fmt }
  );
  return NextResponse.json({ insights });
});

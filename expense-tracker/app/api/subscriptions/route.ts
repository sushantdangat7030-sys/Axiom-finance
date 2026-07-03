import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { detectSubscriptions } from "@/lib/engine/subscriptions";
import { merchantKey } from "@/lib/engine/normalize";

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("subscriptions").select("*").order("monthly_cost", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ subscriptions: data });
});

/** POST — re-detect from the last 15 months of transactions. */
export const POST = handle(async () => {
  const { supabase, user } = await requireUser();
  const since = new Date(); since.setMonth(since.getMonth() - 15);
  const { data: txns, error } = await supabase
    .from("transactions")
    .select("merchant,amount,currency,date,category_id")
    .gte("date", since.toISOString().slice(0, 10))
    .lt("amount", 0)
    .limit(10000);
  if (error) throw error;

  const detected = detectSubscriptions((txns ?? []).map((t) => ({
    merchant: t.merchant, merchantKey: merchantKey(t.merchant),
    amount: Number(t.amount), currency: t.currency, date: t.date, categoryId: t.category_id,
  })));

  for (const s of detected) {
    await supabase.from("subscriptions").upsert({
      user_id: user.id, merchant: s.merchant, amount: s.amount, currency: s.currency,
      frequency: s.frequency, next_billing_date: s.nextBillingDate,
      last_seen_date: s.lastSeenDate, monthly_cost: s.monthlyCost,
      annual_cost: s.annualCost, category_id: s.categoryId, status: "active",
    }, { onConflict: "user_id,merchant,frequency" });
  }
  return NextResponse.json({ detected: detected.length });
});

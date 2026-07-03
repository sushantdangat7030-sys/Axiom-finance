import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { runPipeline } from "@/lib/pipeline";

/** GET /api/transactions?month=&categoryId=&q=&review=&limit=&offset= */
export const GET = handle(async (req: NextRequest) => {
  const { supabase } = await requireUser();
  const p = req.nextUrl.searchParams;
  let q = supabase
    .from("transactions")
    .select("*, categories(name,emoji)", { count: "exact" })
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (p.get("month")) {
    const m = p.get("month")!;
    q = q.gte("date", `${m}-01`).lt("date", nextMonth(m));
  }
  if (p.get("categoryId")) q = q.eq("category_id", p.get("categoryId")!);
  if (p.get("review") === "true") q = q.eq("review_needed", true);
  if (p.get("q")) q = q.ilike("merchant", `%${p.get("q")}%`);
  const limit = Math.min(Number(p.get("limit") ?? 100), 500);
  const offset = Number(p.get("offset") ?? 0);
  const { data, count, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  return NextResponse.json({ transactions: data, total: count });
});

/** POST /api/transactions — manual entry runs through the same pipeline. */
export const POST = handle(async (req: NextRequest) => {
  const { supabase, user } = await requireUser();
  const b = await req.json();
  if (!b.merchant || !b.amount || !b.date)
    return NextResponse.json({ error: "merchant, amount, date required" }, { status: 400 });
  const result = await runPipeline(supabase, user.id, [{
    merchant: String(b.merchant), description: b.description,
    amount: Number(b.amount), currency: b.currency, date: String(b.date),
    paymentMethod: b.paymentMethod, source: "manual",
    externalId: `manual:${crypto.randomUUID()}`,
  }], { source: "manual" });
  return NextResponse.json(result);
});

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
}

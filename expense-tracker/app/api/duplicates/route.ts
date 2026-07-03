import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("duplicate_alerts")
    .select("*, transaction:transactions!duplicate_alerts_transaction_id_fkey(id,merchant,amount,date,source), candidate:transactions!duplicate_alerts_candidate_id_fkey(id,merchant,amount,date,source)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ alerts: data });
});

/** POST { alertId, action: "merge" | "dismiss" } — merge deletes the newer txn. */
export const POST = handle(async (req: NextRequest) => {
  const { supabase } = await requireUser();
  const { alertId, action } = await req.json();
  const { data: alert } = await supabase.from("duplicate_alerts").select("*").eq("id", alertId).single();
  if (!alert) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "merge") {
    await supabase.from("transactions").delete().eq("id", alert.transaction_id);
    await supabase.from("duplicate_alerts").update({
      status: "merged", resolved_at: new Date().toISOString(),
    }).eq("id", alertId);
  } else {
    await supabase.from("duplicate_alerts").update({
      status: "dismissed", resolved_at: new Date().toISOString(),
    }).eq("id", alertId);
  }
  return NextResponse.json({ ok: true });
});

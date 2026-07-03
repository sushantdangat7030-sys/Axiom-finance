import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { merchantKey } from "@/lib/engine/normalize";
import { ruleFromCorrection } from "@/lib/engine/categorize";

/** PATCH: edit fields. A category change teaches the merchant_rules table. */
export const PATCH = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  const b = await req.json();

  const allowed = ["merchant", "description", "amount", "date", "category_id",
    "subcategory", "payment_method", "tags", "notes", "review_needed"] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) patch[k] = b[k];
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  if ("category_id" in patch) { patch.confidence_score = 1.0; patch.review_needed = false; }

  const { data: before } = await supabase.from("transactions").select("merchant,category_id").eq("id", id).single();
  const { data, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();
  if (error) throw error;

  // learning loop
  if ("category_id" in patch && before && patch.category_id && patch.category_id !== before.category_id) {
    const rule = ruleFromCorrection(merchantKey(before.merchant), String(patch.category_id), b.subcategory);
    if (rule)
      await supabase.from("merchant_rules").upsert(
        { user_id: user.id, pattern: rule.pattern, category_id: rule.categoryId,
          subcategory: rule.subcategory, source: "learned" },
        { onConflict: "user_id,pattern" }
      );
  }
  return NextResponse.json({ transaction: data });
});

export const DELETE = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { supabase } = await requireUser();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

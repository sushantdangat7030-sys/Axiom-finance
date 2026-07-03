/** Server-side ingestion orchestrator: RawTransaction[] → DB.
 *  Single path for email, files, and manual entry. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawTransaction } from "./engine/types";
import { normalize } from "./engine/normalize";
import { categorizeAll } from "./engine/categorize";
import { dedupeBatch, findDuplicate } from "./engine/dedupe";
import { aiCategorizer } from "./ai";

export interface PipelineResult {
  inserted: number;
  duplicatesSkipped: number;
  flagged: number;
  rowsParsed: number;
  importId?: string;
}

export async function runPipeline(
  supabase: SupabaseClient,
  userId: string,
  raws: RawTransaction[],
  meta: { source: string; fileName?: string; connectedAccountId?: string; attachmentId?: string }
): Promise<PipelineResult> {
  const { data: profile } = await supabase.from("profiles").select("currency").single();
  const currency = profile?.currency ?? "USD";

  const normalized = raws
    .map((r) => normalize(r, { currency }))
    .filter((t): t is NonNullable<typeof t> => t !== null);
  const { unique, dropped: batchDropped } = dedupeBatch(normalized);

  const [{ data: cats }, { data: rules }] = await Promise.all([
    supabase.from("categories").select("id,name,is_income"),
    supabase.from("merchant_rules").select("pattern,category_id,subcategory,source"),
  ]);
  const categorized = await categorizeAll(
    unique,
    (cats ?? []).map((c) => ({ id: c.id, name: c.name, isIncome: c.is_income })),
    (rules ?? []).map((r) => ({ pattern: r.pattern, categoryId: r.category_id, subcategory: r.subcategory, source: r.source })),
    aiCategorizer()
  );

  // fetch a comparison window (±40d around batch dates) for cross-import dedupe
  const dates = unique.map((t) => t.date).sort();
  let existing: { id: string; merchantKey: string; amount: number; date: string; orderId?: string | null; externalId?: string | null }[] = [];
  if (dates.length) {
    const { data } = await supabase
      .from("transactions")
      .select("id,merchant,amount,date,order_id,external_id")
      .gte("date", addDays(dates[0], -40))
      .lte("date", addDays(dates[dates.length - 1], 40))
      .limit(5000);
    const { merchantKey } = await import("./engine/normalize");
    existing = (data ?? []).map((t) => ({
      id: t.id, merchantKey: merchantKey(t.merchant), amount: Number(t.amount),
      date: t.date, orderId: t.order_id, externalId: t.external_id,
    }));
  }

  const { data: imp } = await supabase
    .from("import_history")
    .insert({
      user_id: userId, source: meta.source, file_name: meta.fileName ?? null,
      attachment_id: meta.attachmentId ?? null, rows_parsed: raws.length,
    })
    .select("id").single();

  let inserted = 0, duplicatesSkipped = batchDropped, flagged = 0;
  for (const t of categorized) {
    const dup = findDuplicate(t, existing);
    if (dup?.action === "auto_merge") { duplicatesSkipped++; continue; }

    const { data: row, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId, merchant: t.merchant, description: t.description ?? null,
        amount: t.amount, currency: t.currency, date: t.date,
        category_id: t.categoryId, subcategory: t.subcategory ?? null,
        payment_method: t.paymentMethod ?? null, source: t.source,
        order_id: t.orderId ?? null, external_id: t.externalId ?? null,
        connected_account_id: meta.connectedAccountId ?? null,
        import_id: imp?.id ?? null, confidence_score: t.confidence,
        review_needed: t.reviewNeeded,
      })
      .select("id").single();

    if (error) {
      // unique(external_id) race → already imported
      if (error.code === "23505") { duplicatesSkipped++; continue; }
      throw error;
    }
    inserted++;
    existing.push({ id: row.id, merchantKey: t.merchantKey, amount: t.amount, date: t.date, orderId: t.orderId, externalId: t.externalId });

    if (dup) {
      flagged++;
      await supabase.from("duplicate_alerts").insert({
        user_id: userId, transaction_id: row.id, candidate_id: dup.candidateId,
        confidence: dup.confidence, score: dup.score, reason: dup.reason,
      });
    }
  }

  if (imp?.id)
    await supabase.from("import_history").update({
      inserted, duplicates_skipped: duplicatesSkipped, flagged,
      status: inserted || !raws.length ? "ok" : "partial",
    }).eq("id", imp.id);

  return { inserted, duplicatesSkipped, flagged, rowsParsed: raws.length, importId: imp?.id };
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

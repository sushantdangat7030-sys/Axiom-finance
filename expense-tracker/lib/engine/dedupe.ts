import type { DupMatch, ExistingTxn, NormalizedTransaction } from "./types";

function daysApart(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

/** Token-overlap similarity on merchant keys (0..1). */
export function merchantSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(a.split(" ")), tb = new Set(b.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = union ? inter / union : 0;
  // substring containment counts too ("amzn mktp" vs "amzn")
  const contains = a.includes(b) || b.includes(a) ? 0.85 : 0;
  return Math.max(jaccard, contains);
}

/**
 * Score a new transaction against existing ones.
 * Signals: external/email id match, order_id match, amount equality,
 * date proximity (±3 days), merchant similarity.
 */
export function findDuplicate(
  txn: NormalizedTransaction,
  existing: ExistingTxn[]
): DupMatch | null {
  let best: DupMatch | null = null;
  for (const e of existing) {
    // identity matches are definitive
    if (txn.externalId && e.externalId && txn.externalId === e.externalId) {
      return { candidateId: e.id, score: 1, confidence: "high", reason: "same external id", action: "auto_merge" };
    }
    if (txn.orderId && e.orderId && txn.orderId === e.orderId &&
        Math.abs(txn.amount - e.amount) < 0.01) {
      return { candidateId: e.id, score: 0.98, confidence: "high", reason: "same order id + amount", action: "auto_merge" };
    }

    const dd = daysApart(txn.date, e.date);
    if (dd > 3) continue;
    const amountEq = Math.abs(Math.abs(txn.amount) - Math.abs(e.amount)) < 0.01;
    if (!amountEq) continue;
    const sim = merchantSimilarity(txn.merchantKey, e.merchantKey);
    if (sim < 0.3) continue;

    // amount+date+merchant composite
    const score = 0.45 + 0.35 * sim + 0.2 * (1 - dd / 3);
    const m: DupMatch =
      score >= 0.93 && dd === 0
        ? { candidateId: e.id, score, confidence: "high", reason: "same merchant, amount and day", action: "auto_merge" }
        : score >= 0.75
          ? { candidateId: e.id, score, confidence: "medium", reason: `similar merchant, same amount, ${Math.round(dd)}d apart`, action: "flag" }
          : { candidateId: e.id, score, confidence: "low", reason: `same amount within ±3 days`, action: "ask" };
    if (!best || m.score > best.score) best = m;
  }
  return best;
}

/** Also dedupe within a single import batch (same file uploaded rows). */
export function dedupeBatch(txns: NormalizedTransaction[]): {
  unique: NormalizedTransaction[];
  dropped: number;
} {
  const seen = new Set<string>();
  const unique: NormalizedTransaction[] = [];
  let dropped = 0;
  for (const t of txns) {
    const key = t.externalId ?? `${t.merchantKey}|${t.amount}|${t.date}`;
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key);
    unique.push(t);
  }
  return { unique, dropped };
}

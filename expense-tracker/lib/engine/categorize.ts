import type {
  CategorizedTransaction, CategoryRef, MerchantRule, NormalizedTransaction,
} from "./types";
import { matchBuiltin, matchUserRules } from "./rules";

export type AiCategorizer = (
  batch: { merchant: string; description?: string; amount: number }[],
  categoryNames: string[]
) => Promise<(string | null)[]>;

/**
 * Hybrid categorization:
 * 1. user merchant_rules (incl. learned corrections) — confidence 0.99
 * 2. built-in rules — 0.9
 * 3. parser category hint — 0.7
 * 4. AI fallback (optional, batched) — 0.6, review flag
 * 5. Other — 0.2, review flag
 */
export async function categorizeAll(
  txns: NormalizedTransaction[],
  categories: CategoryRef[],
  userRules: MerchantRule[],
  ai?: AiCategorizer
): Promise<CategorizedTransaction[]> {
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const income = categories.find((c) => c.isIncome);
  const other = byName.get("other") ?? null;

  const out: CategorizedTransaction[] = txns.map((t) => {
    const hayA = t.merchantKey, hayB = t.merchant.toLowerCase();
    const user = matchUserRules(hayA, userRules) ?? matchUserRules(hayB, userRules);
    if (user)
      return { ...t, categoryId: user.categoryId, subcategory: user.subcategory ?? undefined,
        confidence: 0.99, reviewNeeded: false, categorizedBy: "rule" };

    const builtin = matchBuiltin(hayA) ?? matchBuiltin(hayB);
    if (builtin) {
      const cat = byName.get(builtin.categoryName.toLowerCase());
      if (cat)
        return { ...t, categoryId: cat.id, subcategory: builtin.subcategory,
          confidence: 0.9, reviewNeeded: false, categorizedBy: "builtin" };
    }

    if (t.categoryHint) {
      const cat = byName.get(t.categoryHint.toLowerCase());
      if (cat)
        return { ...t, categoryId: cat.id, confidence: 0.7, reviewNeeded: false, categorizedBy: "hint" };
    }

    // income sign heuristic before falling to AI
    if (t.amount > 0 && income)
      return { ...t, categoryId: income.id, confidence: 0.6, reviewNeeded: true, categorizedBy: "builtin" };

    return { ...t, categoryId: other?.id ?? null, confidence: 0.2, reviewNeeded: true, categorizedBy: "none" };
  });

  // AI fallback only for the leftovers
  const idx = out.map((t, i) => (t.categorizedBy === "none" ? i : -1)).filter((i) => i >= 0);
  if (ai && idx.length) {
    try {
      const names = categories.map((c) => c.name);
      const answers = await ai(
        idx.map((i) => ({ merchant: out[i].merchant, description: out[i].description, amount: out[i].amount })),
        names
      );
      answers.forEach((name, j) => {
        const cat = name ? byName.get(name.toLowerCase()) : null;
        if (cat) {
          const i = idx[j];
          out[i] = { ...out[i], categoryId: cat.id, confidence: 0.6, reviewNeeded: true, categorizedBy: "ai" };
        }
      });
    } catch {
      /* AI unavailable → keep Other + review flags; never block the pipeline */
    }
  }
  return out;
}

/** Learning loop: a manual category edit becomes a persistent merchant rule. */
export function ruleFromCorrection(
  merchantKeyStr: string,
  categoryId: string,
  subcategory?: string | null
): MerchantRule | null {
  const pattern = merchantKeyStr.trim().toLowerCase();
  if (pattern.length < 3) return null; // too generic to learn safely
  return { pattern, categoryId, subcategory: subcategory ?? null, source: "learned" };
}

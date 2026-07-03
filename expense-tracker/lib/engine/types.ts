/** Unified shapes flowing through the ingestion pipeline. Pure types, no I/O. */

export type Source = "email" | "csv" | "xlsx" | "pdf" | "receipt" | "manual";

/** What a parser/extractor emits before normalization. */
export interface RawTransaction {
  merchant: string;
  description?: string;
  /** negative = expense, positive = income (parsers must convert) */
  amount: number;
  currency?: string;
  /** anything Date-parseable or YYYY-MM-DD */
  date: string;
  orderId?: string;
  /** provider-stable id (email message id, file-row hash) for idempotency */
  externalId?: string;
  paymentMethod?: string;
  categoryHint?: string;
  source: Source;
}

/** Cleaned, ready for categorization/dedupe/insert. */
export interface NormalizedTransaction extends RawTransaction {
  merchant: string;
  currency: string;
  /** always YYYY-MM-DD */
  date: string;
  /** lowercase merchant key used for rule matching + similarity */
  merchantKey: string;
}

export interface CategoryRef {
  id: string;
  name: string;
  isIncome?: boolean;
}

export interface MerchantRule {
  pattern: string; // lowercase substring
  categoryId: string;
  subcategory?: string | null;
  source: "user" | "system" | "learned";
}

export interface CategorizedTransaction extends NormalizedTransaction {
  categoryId: string | null;
  subcategory?: string | null;
  confidence: number; // 0..1
  reviewNeeded: boolean;
  categorizedBy: "rule" | "builtin" | "ai" | "hint" | "none";
}

export interface ExistingTxn {
  id: string;
  merchantKey: string;
  amount: number;
  date: string;
  orderId?: string | null;
  externalId?: string | null;
}

export type DupConfidence = "high" | "medium" | "low";

export interface DupMatch {
  candidateId: string;
  score: number;
  confidence: DupConfidence;
  reason: string;
  /** high → skip insert (auto-merge), medium/low → insert + alert */
  action: "auto_merge" | "flag" | "ask";
}

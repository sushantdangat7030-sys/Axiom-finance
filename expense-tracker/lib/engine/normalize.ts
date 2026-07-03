import { createHash } from "crypto";
import type { NormalizedTransaction, RawTransaction } from "./types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  "₹": "INR", $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "؋": "AFN", "₩": "KRW",
};

/** "1,234.56", "1.234,56", "₹1,299", "(45.00)", "45.00 CR" → signed number */
export function parseAmount(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = input.trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  if (/(^-)|(-$)/.test(s)) { sign = -1; }
  if (/\b(dr|debit)\b\.?$/i.test(s)) sign = -1;
  s = s.replace(/\b(cr|credit|dr|debit)\b\.?/gi, "");
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;
  // decide decimal separator: last of . or , with 1-2 trailing digits
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  if (sep >= 0 && s.length - sep - 1 <= 2) {
    const intPart = s.slice(0, sep).replace(/[.,]/g, "");
    const frac = s.slice(sep + 1);
    s = `${intPart}.${frac}`;
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * n : null;
}

export function detectCurrency(text: string, fallback = "USD"): string {
  const code = text.match(/\b(USD|EUR|GBP|INR|JPY|AUD|CAD|SGD|AED|CHF)\b/i);
  if (code) return code[1].toUpperCase();
  for (const [sym, cur] of Object.entries(CURRENCY_SYMBOLS))
    if (text.includes(sym)) return cur;
  return fallback;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Accepts ISO, DD/MM/YYYY, MM/DD/YYYY (heuristic), "Jan 5, 2026", "5 Jan 2026". → YYYY-MM-DD */
export function parseDate(input: string, opts: { dayFirst?: boolean } = {}): string | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    let [day, mon] = opts.dayFirst ? [a, b] : [b, a];
    if (mon > 12 && day <= 12) [day, mon] = [mon, day]; // disambiguate
    return iso(y, mon, day);
  }
  m = s.match(/([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i); // Jan 5, 2026
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()])
    return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})/i); // 5 Jan 2026
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()])
    return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "AMZN Mktp US*2A34F  amzn.com/bill WA" → "amzn mktp us" (stable matching key) */
export function merchantKey(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*#](?=\w*\d)\w+/g, " ")  // ref codes with digits: *2A34F (keeps *TRIP)
    .replace(/\b\d{4,}\b/g, " ")        // long numbers
    .replace(/\b(pos|ach|debit|credit|purchase|payment|pmt|txn|upi|neft|imps|ref|www)\b/g, " ")
    .replace(/[^a-z\s*]/g, " ")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
}

export function cleanMerchant(merchant: string): string {
  const s = merchant.replace(/\s+/g, " ").trim();
  return s.length > 60 ? s.slice(0, 60).trim() : s;
}

/** Deterministic id for file rows so re-importing the same file is a no-op. */
export function rowHash(parts: (string | number | undefined)[]): string {
  return createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex").slice(0, 32);
}

export function normalize(
  raw: RawTransaction,
  defaults: { currency: string }
): NormalizedTransaction | null {
  const date = parseDate(raw.date) ?? (raw.date.match(/^\d{4}-\d{2}-\d{2}$/) ? raw.date : null);
  if (!date) return null;
  if (!Number.isFinite(raw.amount) || raw.amount === 0) return null;
  const merchant = cleanMerchant(raw.merchant || raw.description || "Unknown");
  return {
    ...raw,
    merchant,
    date,
    amount: Math.round(raw.amount * 100) / 100,
    currency: (raw.currency || defaults.currency).toUpperCase(),
    merchantKey: merchantKey(merchant),
    externalId:
      raw.externalId ??
      rowHash([raw.source, merchant.toLowerCase(), raw.amount, date, raw.orderId]),
  };
}

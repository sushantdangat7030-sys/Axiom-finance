/** Turn OCR text of a single receipt/invoice image into ONE transaction. */
import type { RawTransaction } from "../engine/types";
import { parseAmount, parseDate, detectCurrency, rowHash } from "../engine/normalize";

const TOTAL_RE =
  /\b(grand\s*total|total\s*(?:due|amount|paid)?|amount\s*(?:due|paid)|balance\s*due)\b[:\s]*([₹$€£¥]?\s?-?\d[\d,.]*\.?\d{0,2})/i;
const ANY_DATE_RE =
  /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4})/;

export function receiptTextToTransaction(
  text: string,
  opts: { fileName?: string; dayFirst?: boolean } = {}
): RawTransaction | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // merchant: first non-numeric, reasonably wordy line near the top
  const merchant =
    lines.slice(0, 6).find((l) => /[a-z]{3,}/i.test(l) && !/receipt|invoice|tax|gst|bill/i.test(l) && !ANY_DATE_RE.test(l)) ??
    lines[0];

  // total: prefer explicit total labels (last match wins — grand total prints last)
  let amount: number | null = null;
  for (const l of lines) {
    const m = l.match(TOTAL_RE);
    if (m) {
      const v = parseAmount(m[2]);
      if (v !== null && v !== 0) amount = Math.abs(v);
    }
  }
  // fallback: largest money-looking value on the receipt
  if (amount === null) {
    let max = 0;
    for (const l of lines) {
      for (const m of l.matchAll(/[₹$€£¥]\s?(\d[\d,.]*\.?\d{0,2})/g)) {
        const v = parseAmount(m[1]);
        if (v && v > max) max = v;
      }
    }
    if (max > 0) amount = max;
  }
  if (amount === null) return null;

  const dm = text.match(ANY_DATE_RE);
  const date = (dm && parseDate(dm[1], { dayFirst: opts.dayFirst })) || new Date().toISOString().slice(0, 10);

  return {
    merchant,
    description: `Receipt: ${merchant}`,
    amount: -Math.abs(amount),
    currency: detectCurrency(text),
    date,
    source: "receipt",
    externalId: rowHash(["receipt", opts.fileName, merchant, amount, date]),
  };
}

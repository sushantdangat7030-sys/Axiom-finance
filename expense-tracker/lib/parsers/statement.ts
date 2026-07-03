/** Heuristic line-parser for PDF bank statements and OCR'd documents.
 *  Works on extracted TEXT (pdf.js / tesseract output), one line per row. */
import type { RawTransaction, Source } from "../engine/types";
import { parseAmount, parseDate, rowHash } from "../engine/normalize";

// date at line start: 2026-01-05 | 05/01/2026 | 05 Jan 2026 | Jan 5, 2026
const DATE_RE =
  /^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/;
// money at line end, optional DR/CR marker
const TAIL_AMOUNT_RE =
  /(-?\(?[₹$€£¥]?\s?\d[\d,.]*\.?\d{0,2}\)?)(\s*(?:cr|dr|credit|debit))?\s*$/i;

export function statementTextToTransactions(
  text: string,
  source: Source,
  opts: { dayFirst?: boolean; fileName?: string } = {}
): { txns: RawTransaction[]; skipped: number } {
  const txns: RawTransaction[] = [];
  let skipped = 0;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dm = line.match(DATE_RE);
    if (!dm) continue;
    const date = parseDate(dm[1], { dayFirst: opts.dayFirst });
    if (!date) continue;

    const rest = line.slice(dm[0].length).trim();
    const am = rest.match(TAIL_AMOUNT_RE);
    if (!am) { skipped++; continue; }
    let amount = parseAmount(am[1] + (am[2] ?? ""));
    if (amount === null || amount === 0) { skipped++; continue; }
    const marker = (am[2] ?? "").trim().toLowerCase();
    if (marker.startsWith("cr")) amount = Math.abs(amount);
    else if (marker.startsWith("d")) amount = -Math.abs(amount);
    else if (amount > 0) amount = -amount; // statements default to debits

    let desc = rest.slice(0, rest.length - am[0].length).trim();
    // two amounts on the line → the last was the running balance; the inner
    // one (with its own CR/DR marker) is the real transaction amount
    const second = desc.match(TAIL_AMOUNT_RE);
    if (second && parseAmount(second[1]) !== null) {
      const maybeAmt = parseAmount(second[1])!;
      const innerMarker = (second[2] ?? "").trim().toLowerCase();
      desc = desc.slice(0, desc.length - second[0].length).trim();
      if (innerMarker.startsWith("cr")) amount = Math.abs(maybeAmt);
      else if (innerMarker.startsWith("d")) amount = -Math.abs(maybeAmt);
      else amount = amount < 0 ? -Math.abs(maybeAmt) : Math.abs(maybeAmt);
    }
    if (desc.length < 2) { skipped++; continue; }

    txns.push({
      merchant: desc, description: desc, amount, date, source,
      externalId: rowHash([opts.fileName, i, date, desc, amount]),
    });
  }
  return { txns, skipped };
}

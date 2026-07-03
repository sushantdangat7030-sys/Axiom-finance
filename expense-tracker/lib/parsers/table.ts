/** Shared logic for tabular imports (CSV + XLSX): header detection, column
 *  mapping heuristics, row → RawTransaction. */
import type { RawTransaction, Source } from "../engine/types";
import { parseAmount, parseDate, rowHash } from "../engine/normalize";

export interface ColumnMap {
  date: number;
  description: number;
  amount?: number;      // single signed column
  debit?: number;       // or split debit/credit
  credit?: number;
  currency?: number;
  category?: number;
}

const H = {
  date: /^(date|txn date|transaction date|posted|value date|booking date)$/i,
  description: /^(description|narration|details|merchant|payee|name|particulars|memo|transaction details)$/i,
  amount: /^(amount|transaction amount|amt|value)$/i,
  debit: /^(debit|withdrawal|withdrawals|money out|paid out|dr)$/i,
  credit: /^(credit|deposit|deposits|money in|paid in|cr)$/i,
  currency: /^(currency|ccy|cur)$/i,
  category: /^(category|type)$/i,
};

export function mapColumns(headers: string[]): ColumnMap | null {
  const clean = headers.map((h) => String(h ?? "").trim().replace(/\s+/g, " "));
  const find = (re: RegExp) => clean.findIndex((h) => re.test(h));
  const loose = (re: RegExp) => clean.findIndex((h) => re.source.replace(/[\^\$()]/g, "").split("|").some((w) => h.toLowerCase().includes(w.replace(/\\/g, ""))));
  const date = find(H.date) >= 0 ? find(H.date) : clean.findIndex((h) => /date/i.test(h));
  let description = find(H.description);
  if (description < 0) description = clean.findIndex((h) => /desc|narrat|detail|merchant|payee|particular/i.test(h));
  const amount = find(H.amount) >= 0 ? find(H.amount) : clean.findIndex((h) => /^amount/i.test(h));
  const debit = find(H.debit) >= 0 ? find(H.debit) : loose(H.debit);
  const credit = find(H.credit) >= 0 ? find(H.credit) : loose(H.credit);
  if (date < 0 || description < 0) return null;
  if (amount < 0 && debit < 0 && credit < 0) return null;
  return {
    date, description,
    amount: amount >= 0 ? amount : undefined,
    debit: debit >= 0 ? debit : undefined,
    credit: credit >= 0 ? credit : undefined,
    currency: find(H.currency) >= 0 ? find(H.currency) : undefined,
    category: find(H.category) >= 0 ? find(H.category) : undefined,
  };
}

/** Find the header row within the first rows (bank exports often have preamble). */
export function findHeaderRow(rows: unknown[][]): { index: number; map: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const map = mapColumns((rows[i] ?? []).map(String));
    if (map) return { index: i, map };
  }
  return null;
}

export function rowsToRaw(
  rows: unknown[][],
  source: Source,
  opts: { dayFirst?: boolean; fileName?: string } = {}
): { txns: RawTransaction[]; skipped: number } {
  const header = findHeaderRow(rows);
  if (!header) return { txns: [], skipped: rows.length };
  const { index, map } = header;
  const txns: RawTransaction[] = [];
  let skipped = 0;

  for (let r = index + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const cell = (i?: number) => (i === undefined ? "" : String(row[i] ?? "").trim());
    const dateStr = cell(map.date);
    const desc = cell(map.description);
    if (!dateStr && !desc) continue; // blank
    const date = parseDate(dateStr, { dayFirst: opts.dayFirst });
    let amount: number | null = null;
    if (map.amount !== undefined) amount = parseAmount(cell(map.amount));
    if (amount === null && (map.debit !== undefined || map.credit !== undefined)) {
      const d = map.debit !== undefined ? parseAmount(cell(map.debit)) : null;
      const c = map.credit !== undefined ? parseAmount(cell(map.credit)) : null;
      if (d && d !== 0) amount = -Math.abs(d);
      else if (c && c !== 0) amount = Math.abs(c);
    }
    if (!date || amount === null || amount === 0 || !desc) { skipped++; continue; }
    txns.push({
      merchant: desc,
      description: desc,
      amount,
      date,
      currency: map.currency !== undefined ? cell(map.currency) || undefined : undefined,
      categoryHint: map.category !== undefined ? cell(map.category) || undefined : undefined,
      source,
      externalId: rowHash([opts.fileName, r, date, desc, amount]),
    });
  }
  return { txns, skipped };
}

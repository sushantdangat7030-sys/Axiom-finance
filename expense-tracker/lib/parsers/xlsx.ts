import * as XLSX from "xlsx";
import type { RawTransaction } from "../engine/types";
import { rowsToRaw } from "./table";

/** Parse every sheet of an Excel workbook into transactions. */
export function xlsxToTransactions(
  buf: ArrayBuffer | Buffer,
  opts: { dayFirst?: boolean; fileName?: string } = {}
): { txns: RawTransaction[]; skipped: number } {
  const wb = XLSX.read(buf, { type: buf instanceof ArrayBuffer ? "array" : "buffer", cellDates: true });
  let txns: RawTransaction[] = [];
  let skipped = 0;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "",
    });
    const r = rowsToRaw(rows as unknown[][], "xlsx", { ...opts, fileName: `${opts.fileName ?? "book"}:${name}` });
    txns = txns.concat(r.txns);
    skipped += r.skipped;
  }
  return { txns, skipped };
}

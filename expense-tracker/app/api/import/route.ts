import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { runPipeline } from "@/lib/pipeline";
import { csvToTransactions } from "@/lib/parsers/csv";
import { xlsxToTransactions } from "@/lib/parsers/xlsx";
import { statementTextToTransactions } from "@/lib/parsers/statement";
import { receiptTextToTransaction } from "@/lib/parsers/receipt";
import type { RawTransaction } from "@/lib/engine/types";

export const maxDuration = 60;

/**
 * POST /api/import
 * multipart: file (csv|xlsx) [+ dayFirst]
 * JSON: { kind: "pdf_text"|"receipt_text", text, fileName?, dayFirst?, attachmentId? }
 * (PDF text extraction + OCR run in the browser; server receives text only.)
 */
export const POST = handle(async (req: NextRequest) => {
  const { supabase, user } = await requireUser();
  let raws: RawTransaction[] = [];
  let source = "csv", fileName: string | undefined, attachmentId: string | undefined;
  let dayFirst = false;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
    dayFirst = form.get("dayFirst") === "true";
    fileName = file.name;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || file.type.includes("csv")) {
      source = "csv";
      raws = csvToTransactions(await file.text(), { dayFirst, fileName }).txns;
    } else if (lower.match(/\.xlsx?$/)) {
      source = "xlsx";
      raws = xlsxToTransactions(await file.arrayBuffer(), { dayFirst, fileName }).txns;
    } else {
      return NextResponse.json({ error: "Use CSV/XLSX here; PDFs and images are parsed in the browser" }, { status: 400 });
    }
  } else {
    const body = await req.json();
    fileName = body.fileName; attachmentId = body.attachmentId; dayFirst = !!body.dayFirst;
    if (body.kind === "pdf_text") {
      source = "pdf";
      raws = statementTextToTransactions(String(body.text ?? ""), "pdf", { dayFirst, fileName }).txns;
    } else if (body.kind === "receipt_text") {
      source = "receipt";
      const t = receiptTextToTransaction(String(body.text ?? ""), { fileName, dayFirst });
      raws = t ? [t] : [];
    } else {
      return NextResponse.json({ error: "unknown kind" }, { status: 400 });
    }
  }

  const result = await runPipeline(supabase, user.id, raws, { source, fileName, attachmentId });
  return NextResponse.json(result);
});

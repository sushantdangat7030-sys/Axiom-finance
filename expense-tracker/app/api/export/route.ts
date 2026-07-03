import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";

/** GET /api/export?format=csv|xlsx&from=&to=&categoryId=&merchant= */
export const GET = handle(async (req: NextRequest) => {
  const { supabase } = await requireUser();
  const p = req.nextUrl.searchParams;
  let q = supabase.from("transactions")
    .select("date,merchant,description,amount,currency,subcategory,payment_method,source,order_id,notes,categories(name)")
    .order("date", { ascending: false }).limit(20000);
  if (p.get("from")) q = q.gte("date", p.get("from")!);
  if (p.get("to")) q = q.lte("date", p.get("to")!);
  if (p.get("categoryId")) q = q.eq("category_id", p.get("categoryId")!);
  if (p.get("merchant")) q = q.ilike("merchant", `%${p.get("merchant")}%`);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []).map((t) => ({
    Date: t.date, Merchant: t.merchant,
    Category: (t.categories as unknown as { name: string } | null)?.name ?? "",
    Subcategory: t.subcategory ?? "", Amount: Number(t.amount), Currency: t.currency,
    "Payment method": t.payment_method ?? "", Source: t.source,
    "Order ID": t.order_id ?? "", Notes: t.notes ?? "", Description: t.description ?? "",
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  if ((p.get("format") ?? "csv") === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Transactions");
    // summary sheet: spend by category
    const byCat = new Map<string, number>();
    for (const r of rows) if (r.Amount < 0)
      byCat.set(r.Category || "Other", (byCat.get(r.Category || "Other") ?? 0) - r.Amount);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      [...byCat.entries()].map(([Category, Spend]) => ({ Category, Spend }))
        .sort((a, b) => b.Spend - a.Spend)), "By category");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="axiom-export-${stamp}.xlsx"`,
    }});
  }

  const headers = Object.keys(rows[0] ?? { Date: "" });
  const csv = [headers.join(","), ...rows.map((r) =>
    headers.map((h) => {
      const v = String((r as Record<string, unknown>)[h] ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","))].join("\n");
  return new NextResponse(csv, { headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="axiom-export-${stamp}.csv"`,
  }});
});

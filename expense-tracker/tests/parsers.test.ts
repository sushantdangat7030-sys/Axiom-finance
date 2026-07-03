import { describe, it, expect } from "vitest";
import { parseCsv, csvToTransactions } from "../lib/parsers/csv";
import { xlsxToTransactions } from "../lib/parsers/xlsx";
import { statementTextToTransactions } from "../lib/parsers/statement";
import { receiptTextToTransaction } from "../lib/parsers/receipt";
import { extractFromEmail, isFinancialEmail } from "../lib/email/extract";
import * as XLSX from "xlsx";

describe("csv", () => {
  it("parses quotes and CRLF", () => {
    const rows = parseCsv('a,"b,1","say ""hi"""\r\nx,y,z\n');
    expect(rows).toEqual([["a", "b,1", 'say "hi"'], ["x", "y", "z"]]);
  });
  it("maps a typical bank export (amount column)", () => {
    const { txns } = csvToTransactions(
      "Date,Description,Amount\n2026-07-01,STARBUCKS #123,-5.40\n2026-07-02,PAYROLL ACME,2500.00\n");
    expect(txns.length).toBe(2);
    expect(txns[0]).toMatchObject({ merchant: "STARBUCKS #123", amount: -5.4, date: "2026-07-01", source: "csv" });
    expect(txns[1].amount).toBe(2500);
  });
  it("maps debit/credit columns + preamble rows + skips junk", () => {
    const { txns, skipped } = csvToTransactions(
      'Statement for account 1234\n\nTxn Date,Narration,Withdrawal,Deposit\n01/07/2026,"SWIGGY ORDER",450.00,\n02/07/2026,SALARY,,85000\nbadrow,,,\n',
      { dayFirst: true });
    expect(txns.length).toBe(2);
    expect(txns[0].amount).toBe(-450);
    expect(txns[0].date).toBe("2026-07-01");
    expect(txns[1].amount).toBe(85000);
    expect(skipped).toBeGreaterThan(0);
  });
  it("re-parsing produces identical externalIds (idempotent import)", () => {
    const a = csvToTransactions("Date,Description,Amount\n2026-07-01,X,-1\n", { fileName: "f.csv" });
    const b = csvToTransactions("Date,Description,Amount\n2026-07-01,X,-1\n", { fileName: "f.csv" });
    expect(a.txns[0].externalId).toBe(b.txns[0].externalId);
  });
});

describe("xlsx", () => {
  it("round-trips a generated workbook", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Date", "Description", "Amount"],
      ["2026-07-01", "NETFLIX.COM", "-15.99"],
      ["2026-07-03", "Refund from store", "20.00"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const { txns } = xlsxToTransactions(buf, { fileName: "test.xlsx" });
    expect(txns.length).toBe(2);
    expect(txns[0]).toMatchObject({ amount: -15.99, source: "xlsx" });
  });
});

describe("pdf statement text", () => {
  it("parses date-desc-amount lines incl. CR/DR and balance columns", () => {
    const text = [
      "ACME BANK  Statement Period 01/06/2026 - 30/06/2026",
      "05/06/2026 UPI-SWIGGY BANGALORE 450.00 DR 12,550.00",
      "07/06/2026 NEFT SALARY ACME CORP 85,000.00 CR 97,550.00",
      "Page 1 of 2",
    ].join("\n");
    const { txns } = statementTextToTransactions(text, "pdf", { dayFirst: true, fileName: "stmt.pdf" });
    expect(txns.length).toBe(2);
    expect(txns[0]).toMatchObject({ amount: -450, date: "2026-06-05" });
    expect(txns[1].amount).toBe(85000);
  });
});

describe("receipt OCR text", () => {
  it("extracts merchant, grand total (not subtotal), date", () => {
    const t = receiptTextToTransaction([
      "BLUE BOTTLE COFFEE",
      "123 Market St",
      "Jul 2, 2026 10:15 AM",
      "Latte            $5.50",
      "Croissant        $4.25",
      "Subtotal         $9.75",
      "Tax              $0.86",
      "TOTAL           $10.61",
    ].join("\n"))!;
    expect(t.merchant).toBe("BLUE BOTTLE COFFEE");
    expect(t.amount).toBe(-10.61);
    expect(t.date).toBe("2026-07-02");
    expect(t.currency).toBe("USD");
  });
});

describe("email extraction", () => {
  it("classifies financial vs noise", () => {
    expect(isFinancialEmail({ id: "1", from: "auto-confirm@amazon.in", subject: "Your Amazon.in order #171-29 has shipped", date: "", snippet: "" })).toBe(true);
    expect(isFinancialEmail({ id: "2", from: "news@blog.com", subject: "Weekly newsletter: 10 tips", date: "", snippet: "" })).toBe(false);
  });
  it("extracts amount, merchant, order id from an Amazon receipt", () => {
    const t = extractFromEmail({
      id: "msg123",
      from: '"Amazon.in" <auto-confirm@amazon.in>',
      subject: "Your Amazon.in order of Echo Dot",
      date: "Thu, 2 Jul 2026 08:00:00 +0530",
      snippet: "Order #171-2926384-1234567 Total: ₹4,499.00 Arriving tomorrow",
    })!;
    expect(t.merchant).toBe("Amazon");
    expect(t.amount).toBe(-4499);
    expect(t.currency).toBe("INR");
    expect(t.orderId).toContain("171-2926384");
    expect(t.externalId).toBe("email:msg123");
  });
  it("uber ride + refunds keep sign conventions", () => {
    const ride = extractFromEmail({
      id: "m2", from: "Uber Receipts <noreply@uber.com>",
      subject: "Your Thursday morning trip with Uber",
      date: "2026-07-02", snippet: "Total $23.45 Thanks for riding",
    })!;
    expect(ride.merchant).toBe("Uber");
    expect(ride.amount).toBe(-23.45);
    const refund = extractFromEmail({
      id: "m3", from: "Netflix <info@netflix.com>",
      subject: "Your refund receipt", date: "2026-07-02",
      snippet: "We processed your refund of $15.99",
    })!;
    expect(refund.amount).toBe(15.99);
  });
  it("no amount → null (never invent data)", () => {
    expect(extractFromEmail({
      id: "m4", from: "billing@service.com", subject: "Your invoice is ready",
      date: "2026-07-01", snippet: "Log in to view your invoice.",
    })).toBeNull();
  });
});

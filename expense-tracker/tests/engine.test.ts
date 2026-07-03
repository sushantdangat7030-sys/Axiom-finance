import { describe, it, expect } from "vitest";
import { parseAmount, parseDate, merchantKey, normalize } from "../lib/engine/normalize";
import { matchBuiltin } from "../lib/engine/rules";
import { categorizeAll, ruleFromCorrection } from "../lib/engine/categorize";
import { findDuplicate, dedupeBatch, merchantSimilarity } from "../lib/engine/dedupe";
import { detectSubscriptions } from "../lib/engine/subscriptions";
import { generateInsights } from "../lib/engine/insights";
import type { CategoryRef, NormalizedTransaction } from "../lib/engine/types";

const CATS: CategoryRef[] = [
  { id: "c1", name: "Groceries" }, { id: "c2", name: "Dining" },
  { id: "c3", name: "Transport" }, { id: "c4", name: "Subscriptions" },
  { id: "c5", name: "Travel" }, { id: "c6", name: "Other" },
  { id: "c7", name: "Income", isIncome: true }, { id: "c8", name: "Utilities" },
];

describe("parseAmount", () => {
  it("handles plain, thousands, symbols", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("₹1,299")).toBe(1299);
    expect(parseAmount("$45.00")).toBe(45);
  });
  it("handles european format", () => expect(parseAmount("1.234,56")).toBe(1234.56));
  it("handles negatives / parens / DR-CR", () => {
    expect(parseAmount("(45.00)")).toBe(-45);
    expect(parseAmount("-12.30")).toBe(-12.3);
    expect(parseAmount("500.00 DR")).toBe(-500);
  });
  it("rejects junk", () => expect(parseAmount("abc")).toBeNull());
});

describe("parseDate", () => {
  it("iso", () => expect(parseDate("2026-07-03")).toBe("2026-07-03"));
  it("us slash", () => expect(parseDate("7/3/2026")).toBe("2026-07-03"));
  it("dayFirst", () => expect(parseDate("03/07/2026", { dayFirst: true })).toBe("2026-07-03"));
  it("disambiguates >12", () => expect(parseDate("25/12/2026")).toBe("2026-12-25"));
  it("month names", () => {
    expect(parseDate("Jul 3, 2026")).toBe("2026-07-03");
    expect(parseDate("3 July 2026")).toBe("2026-07-03");
  });
});

describe("merchantKey", () => {
  it("strips noise", () => {
    expect(merchantKey("AMZN Mktp US*2A34F amzn.com/bill WA")).toContain("amzn");
    expect(merchantKey("UBER *TRIP 12345")).toBe("uber trip");
  });
});

describe("categorization", () => {
  const mk = (merchant: string, amount = -100): NormalizedTransaction => ({
    merchant, amount, currency: "USD", date: "2026-07-01",
    merchantKey: merchantKey(merchant), source: "csv",
  });
  it("builtin rules hit the spec merchants", () => {
    expect(matchBuiltin("uber trip")!.categoryName).toBe("Transport");
    expect(matchBuiltin("costco wholesale")!.categoryName).toBe("Groceries");
    expect(matchBuiltin("netflix com")!.categoryName).toBe("Subscriptions");
    expect(matchBuiltin("uber eats order")!.categoryName).toBe("Dining"); // longest wins
    expect(matchBuiltin("booking com hotel")!.categoryName).toBe("Travel");
  });
  it("user rules beat builtin, learning loop creates rules", async () => {
    const learned = ruleFromCorrection("costco wholesale", "c2")!;
    expect(learned.source).toBe("learned");
    const [t] = await categorizeAll([mk("Costco Wholesale")], CATS, [learned]);
    expect(t.categoryId).toBe("c2");
    expect(t.confidence).toBeGreaterThan(0.95);
  });
  it("AI fallback fills unknowns, failure never blocks", async () => {
    const [t] = await categorizeAll([mk("Bob's Mystery Shop")], CATS, [],
      async (batch) => batch.map(() => "Dining"));
    expect(t.categoryId).toBe("c2");
    expect(t.categorizedBy).toBe("ai");
    const [f] = await categorizeAll([mk("Zzz Unknown")], CATS, [],
      async () => { throw new Error("down"); });
    expect(f.categoryId).toBe("c6"); // Other
    expect(f.reviewNeeded).toBe(true);
  });
  it("positive amounts lean Income", async () => {
    const [t] = await categorizeAll([mk("ACME Corp Payroll Dept", 5000)], CATS, []);
    expect(["c7"]).toContain(t.categoryId);
  });
});

describe("dedupe", () => {
  const base: NormalizedTransaction = {
    merchant: "Netflix", merchantKey: "netflix", amount: -15.99,
    currency: "USD", date: "2026-07-01", source: "email", externalId: "email:x1",
  };
  it("external id → auto-merge", () => {
    const m = findDuplicate(base, [{ id: "t1", merchantKey: "netflix", amount: -15.99, date: "2026-07-01", externalId: "email:x1" }]);
    expect(m?.action).toBe("auto_merge");
  });
  it("order id + amount → auto-merge", () => {
    const m = findDuplicate({ ...base, externalId: "y", orderId: "AB-1234567" },
      [{ id: "t1", merchantKey: "netflix inc", amount: -15.99, date: "2026-06-30", orderId: "AB-1234567" }]);
    expect(m?.action).toBe("auto_merge");
  });
  it("same merchant+amount+day → high; ±3d → flagged; >3d → none", () => {
    const ex = [{ id: "t1", merchantKey: "netflix", amount: -15.99, date: "2026-07-01" }];
    expect(findDuplicate({ ...base, externalId: "z" }, ex)?.confidence).toBe("high");
    expect(findDuplicate({ ...base, externalId: "z", date: "2026-07-03" }, ex)?.action).toBe("flag");
    expect(findDuplicate({ ...base, externalId: "z", date: "2026-07-09" }, ex)).toBeNull();
  });
  it("similarity + in-batch dedupe", () => {
    expect(merchantSimilarity("amzn mktp", "amzn")).toBeGreaterThan(0.8);
    const { unique, dropped } = dedupeBatch([base, { ...base }]);
    expect(unique.length).toBe(1);
    expect(dropped).toBe(1);
  });
});

describe("subscriptions", () => {
  it("detects monthly cadence + projections + next billing", () => {
    const subs = detectSubscriptions([
      { merchantKey: "netflix", merchant: "Netflix", amount: -15.99, currency: "USD", date: "2026-04-05" },
      { merchantKey: "netflix", merchant: "Netflix", amount: -15.99, currency: "USD", date: "2026-05-05" },
      { merchantKey: "netflix", merchant: "Netflix", amount: -15.99, currency: "USD", date: "2026-06-05" },
      { merchantKey: "one off shop", merchant: "One Off", amount: -50, currency: "USD", date: "2026-06-01" },
    ]);
    expect(subs.length).toBe(1);
    expect(subs[0].frequency).toBe("monthly");
    expect(subs[0].nextBillingDate).toBe("2026-07-05");
    expect(subs[0].monthlyCost).toBeCloseTo(15.99);
    expect(subs[0].annualCost).toBeCloseTo(191.88);
  });
  it("ignores wobbly amounts outside ±15%", () => {
    const subs = detectSubscriptions([
      { merchantKey: "grocer", merchant: "Grocer", amount: -20, currency: "USD", date: "2026-05-01" },
      { merchantKey: "grocer", merchant: "Grocer", amount: -95, currency: "USD", date: "2026-06-01" },
    ]);
    expect(subs.length).toBe(0);
  });
});

describe("insights", () => {
  it("flags >20% category overspend month-over-month", () => {
    const txns = [
      { amount: -100, date: "2026-06-10", categoryName: "Dining", merchant: "A", merchantKey: "a" },
      { amount: -122, date: "2026-07-10", categoryName: "Dining", merchant: "B", merchantKey: "b" },
    ];
    const out = generateInsights(txns, [], { month: "2026-07" });
    const over = out.find((i) => i.kind === "overspend");
    expect(over?.message).toMatch(/22% more on Dining/);
  });
  it("streaming overlap warning", () => {
    const out = generateInsights([], [
      { merchant: "Netflix", monthlyCost: 15 },
      { merchant: "Disney+", monthlyCost: 10 },
      { merchant: "Spotify", monthlyCost: 9 },
    ]);
    expect(out.some((i) => i.kind === "subscription_waste" && /3 streaming/.test(i.message))).toBe(true);
  });
});

describe("normalize", () => {
  it("produces stable external ids and rejects invalid rows", () => {
    const t = normalize({ merchant: "X", amount: -5, date: "01/02/2026", source: "csv" }, { currency: "INR" })!;
    expect(t.date).toBe("2026-01-02");
    expect(t.currency).toBe("INR");
    expect(t.externalId).toHaveLength(32);
    expect(normalize({ merchant: "X", amount: 0, date: "2026-01-01", source: "csv" }, { currency: "USD" })).toBeNull();
    expect(normalize({ merchant: "X", amount: -5, date: "garbage", source: "csv" }, { currency: "USD" })).toBeNull();
  });
});

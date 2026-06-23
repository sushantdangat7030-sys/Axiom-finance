import { prisma } from "@/lib/prisma";

export async function getTransactions({ from, to }: { from?: Date; to?: Date }) {
  return prisma.transaction.findMany({
    where:
      from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : undefined,
    orderBy: { date: "desc" },
  });
}

export function summarize(transactions: { type: string; amount: number }[]) {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  return { income, expense, net: income - expense };
}

export function summarizeByCategory(
  transactions: { type: string; category: string; amount: number }[]
) {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  return Array.from(totals, ([category, total]) => ({ category, total }));
}

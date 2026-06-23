import { formatCurrency } from "@/lib/format";

type SummaryCardsProps = {
  income: number;
  expense: number;
  net: number;
};

export function SummaryCards({ income, expense, net }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SummaryCard label="Total Income" value={income} tone="positive" />
      <SummaryCard label="Total Expense" value={expense} tone="negative" />
      <SummaryCard
        label="Net Savings"
        value={net}
        tone={net >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

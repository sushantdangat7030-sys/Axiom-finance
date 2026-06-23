"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";

type CategoryChartProps = {
  data: { category: string; total: number }[];
};

export function CategoryChart({ data }: CategoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-black/50 dark:border-white/10 dark:text-white/50">
        No expenses in this range yet.
      </div>
    );
  }

  return (
    <div className="h-64 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
          <XAxis dataKey="category" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={48} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

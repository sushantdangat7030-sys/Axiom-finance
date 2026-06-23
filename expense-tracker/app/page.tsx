import { redirect } from "next/navigation";
import { getTransactions, summarize, summarizeByCategory } from "@/lib/transactions";
import { endOfMonth, startOfMonth } from "@/lib/date";
import { toDateInputValue } from "@/lib/format";
import { getCurrentUserId } from "@/lib/session";
import { DateRangeFilter } from "@/components/date-range-filter";
import { SummaryCards } from "@/components/summary-cards";
import { CategoryChart } from "@/components/category-chart";
import { AddTransactionForm } from "@/components/add-transaction-form";
import { TransactionList } from "@/components/transaction-list";

type HomeProps = {
  searchParams: { from?: string; to?: string };
};

export default async function Home({ searchParams }: HomeProps) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const now = new Date();
  const from = searchParams.from ? new Date(searchParams.from) : startOfMonth(now);
  const to = searchParams.to ? new Date(searchParams.to) : endOfMonth(now);

  const transactions = await getTransactions({ userId, from, to });
  const { income, expense, net } = summarize(transactions);
  const categoryData = summarizeByCategory(transactions);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <DateRangeFilter
        from={searchParams.from ?? toDateInputValue(from)}
        to={searchParams.to ?? toDateInputValue(to)}
      />
      <SummaryCards income={income} expense={expense} net={net} />
      <CategoryChart data={categoryData} />
      <AddTransactionForm />
      <TransactionList transactions={transactions} />
    </main>
  );
}

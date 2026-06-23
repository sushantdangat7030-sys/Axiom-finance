import { TransactionRow, type TransactionRowData } from "@/components/transaction-row";

export function TransactionList({ transactions }: { transactions: TransactionRowData[] }) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-black/50 dark:border-white/10 dark:text-white/50">
        No transactions yet. Add your first one above.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {transactions.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} />
      ))}
    </div>
  );
}

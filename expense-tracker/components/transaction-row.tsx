"use client";

import { useState } from "react";
import { updateTransaction, deleteTransaction } from "@/lib/actions";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { TransactionFormFields } from "@/components/transaction-form-fields";

export type TransactionRowData = {
  id: string;
  type: string;
  category: string;
  amount: number;
  date: Date;
  note: string | null;
};

export function TransactionRow({ transaction }: { transaction: TransactionRowData }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleUpdate(formData: FormData) {
    setPending(true);
    await updateTransaction(transaction.id, formData);
    setPending(false);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this transaction?")) return;
    setPending(true);
    await deleteTransaction(transaction.id);
  }

  if (editing) {
    return (
      <form
        action={handleUpdate}
        className="flex flex-col gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
      >
        <TransactionFormFields
          defaultType={transaction.type}
          defaultCategory={transaction.category}
          defaultAmount={transaction.amount}
          defaultDate={toDateInputValue(transaction.date)}
          defaultNote={transaction.note ?? ""}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 rounded-full ${
            transaction.type === "income" ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
        <div>
          <p className="text-sm font-medium">{transaction.category}</p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {formatDate(transaction.date)}
            {transaction.note ? ` · ${transaction.note}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`text-sm font-semibold ${
            transaction.type === "income"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {transaction.type === "income" ? "+" : "-"}
          {formatCurrency(transaction.amount)}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs underline"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="text-xs text-rose-600 underline dark:text-rose-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

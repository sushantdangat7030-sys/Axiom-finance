"use client";

import { useRef, useState } from "react";
import { createTransaction } from "@/lib/actions";
import { toDateInputValue } from "@/lib/format";
import { TransactionFormFields } from "@/components/transaction-form-fields";

export function AddTransactionForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    await createTransaction(formData);
    formRef.current?.reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        + Add Transaction
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5"
    >
      <TransactionFormFields defaultDate={toDateInputValue(new Date())} />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

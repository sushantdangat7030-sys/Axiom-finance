"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode, type FormEvent } from "react";

type DateRangeFilterProps = {
  from: string;
  to: string;
};

export function DateRangeFilter({ from, to }: DateRangeFilterProps) {
  const router = useRouter();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  function applyFilter(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (fromValue) params.set("from", fromValue);
    if (toValue) params.set("to", toValue);
    router.push(`/?${params.toString()}`);
  }

  function resetFilter() {
    setFromValue("");
    setToValue("");
    router.push("/");
  }

  return (
    <form
      onSubmit={applyFilter}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5"
    >
      <Field label="From">
        <input
          type="date"
          value={fromValue}
          onChange={(event) => setFromValue(event.target.value)}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          value={toValue}
          onChange={(event) => setToValue(event.target.value)}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </Field>
      <button
        type="submit"
        className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={resetFilter}
        className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/20"
      >
        Reset
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
      {label}
      {children}
    </label>
  );
}

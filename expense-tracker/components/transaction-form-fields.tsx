import { CATEGORIES } from "@/lib/categories";

type TransactionFormFieldsProps = {
  defaultType?: string;
  defaultCategory?: string;
  defaultAmount?: number;
  defaultDate?: string;
  defaultNote?: string;
};

export function TransactionFormFields({
  defaultType = "expense",
  defaultCategory = CATEGORIES[0],
  defaultAmount,
  defaultDate,
  defaultNote = "",
}: TransactionFormFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
        Type
        <select
          name="type"
          defaultValue={defaultType}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
        Category
        <select
          name="category"
          defaultValue={defaultCategory}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
        Amount
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={defaultAmount}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
        Date
        <input
          name="date"
          type="date"
          required
          defaultValue={defaultDate}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
        Note
        <input
          name="note"
          type="text"
          placeholder="Optional"
          defaultValue={defaultNote}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </label>
    </div>
  );
}

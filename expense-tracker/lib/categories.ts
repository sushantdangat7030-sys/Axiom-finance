export const CATEGORIES = [
  "Food",
  "Rent",
  "Travel",
  "Bills",
  "Shopping",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const TRANSACTION_TYPES = ["income", "expense"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

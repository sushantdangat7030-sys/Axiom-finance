export const CATEGORY_NAMES = [
  "Restaurants",
  "Groceries",
  "Subscriptions",
  "Transportation",
  "Shopping",
  "Utilities",
  "Entertainment",
  "Health",
  "Travel",
  "Other",
] as const;

export type CategoryName = (typeof CATEGORY_NAMES)[number];

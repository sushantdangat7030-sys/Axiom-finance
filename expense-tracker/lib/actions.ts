"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CATEGORIES, TRANSACTION_TYPES } from "@/lib/categories";

function parseTransactionForm(formData: FormData) {
  const type = formData.get("type");
  const category = formData.get("category");
  const amount = formData.get("amount");
  const date = formData.get("date");
  const note = formData.get("note");

  if (typeof type !== "string" || !TRANSACTION_TYPES.includes(type as never)) {
    throw new Error("Invalid transaction type");
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as never)) {
    throw new Error("Invalid category");
  }
  const parsedAmount = typeof amount === "string" ? Number(amount) : NaN;
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  if (typeof date !== "string" || Number.isNaN(Date.parse(date))) {
    throw new Error("Invalid date");
  }

  return {
    type,
    category,
    amount: parsedAmount,
    date: new Date(date),
    note: typeof note === "string" && note.trim() !== "" ? note.trim() : null,
  };
}

export async function createTransaction(formData: FormData) {
  const data = parseTransactionForm(formData);
  await prisma.transaction.create({ data });
  revalidatePath("/");
}

export async function updateTransaction(id: string, formData: FormData) {
  const data = parseTransactionForm(formData);
  await prisma.transaction.update({ where: { id }, data });
  revalidatePath("/");
}

export async function deleteTransaction(id: string) {
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/");
}

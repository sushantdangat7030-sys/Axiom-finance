import { NextResponse } from "next/server";

import { pool } from "@/lib/db";

type Txn = {
  id: number;
  merchant_name: string;
  amount: string;
  date: string;
  account_id: number;
  category_id: number | null;
};

type Frequency = "weekly" | "biweekly" | "monthly" | "yearly";

const FREQUENCY_DAYS: Record<Frequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  yearly: 365,
};

function classifyInterval(days: number): Frequency | null {
  if (days >= 5 && days <= 9) return "weekly";
  if (days >= 12 && days <= 16) return "biweekly";
  if (days >= 26 && days <= 35) return "monthly";
  if (days >= 350 && days <= 380) return "yearly";
  return null;
}

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function detectFrequency(txns: Txn[]): Frequency | null {
  if (txns.length < 2) return null;

  const buckets: Record<Frequency, number> = {
    weekly: 0,
    biweekly: 0,
    monthly: 0,
    yearly: 0,
  };

  for (let i = 1; i < txns.length; i++) {
    const bucket = classifyInterval(daysBetween(txns[i - 1].date, txns[i].date));
    if (bucket) buckets[bucket] += 1;
  }

  const [topFrequency, topCount] = (Object.entries(buckets) as [Frequency, number][])
    .sort((a, b) => b[1] - a[1])[0];

  if (topCount === 0) return null;
  if (txns.length === 2) return topFrequency;
  return topCount >= 2 ? topFrequency : null;
}

function mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function buildPriceHistory(txns: Txn[]) {
  const history: { date: string; amount: number }[] = [];
  let lastAmount: number | null = null;
  for (const t of txns) {
    const amount = Math.abs(Number(t.amount));
    if (lastAmount === null || Math.abs(amount - lastAmount) > 0.01) {
      history.push({ date: t.date, amount });
      lastAmount = amount;
    }
  }
  return history;
}

export async function POST() {
  try {
    const { rows: transactions } = await pool.query<Txn>(
      `SELECT id, merchant_name, amount, date, account_id, category_id
       FROM transactions
       WHERE merchant_name IS NOT NULL
       ORDER BY merchant_name, date ASC`
    );

    const groups = new Map<string, Txn[]>();
    for (const t of transactions) {
      const key = t.merchant_name.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    let created = 0;
    let updated = 0;
    let priceIncreases = 0;

    for (const [, txns] of groups) {
      const frequency = detectFrequency(txns);
      if (!frequency) continue;

      const latest = txns[txns.length - 1];
      const amount = Math.abs(Number(latest.amount));
      const priceHistory = buildPriceHistory(txns);
      const lastChargeDate = latest.date;
      const nextExpectedDate = new Date(
        new Date(lastChargeDate).getTime() +
          FREQUENCY_DAYS[frequency] * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10);
      const categoryId = mode(txns.map((t) => t.category_id));

      const { rows: existingRows } = await pool.query(
        "SELECT id, amount FROM subscriptions WHERE lower(merchant_name) = lower($1)",
        [latest.merchant_name]
      );

      if (existingRows.length === 0) {
        await pool.query(
          `INSERT INTO subscriptions (
             merchant_name, account_id, category_id, amount, frequency,
             first_detected_date, last_charge_date, next_expected_date, price_history
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            latest.merchant_name,
            latest.account_id,
            categoryId,
            amount,
            frequency,
            txns[0].date,
            lastChargeDate,
            nextExpectedDate,
            JSON.stringify(priceHistory),
          ]
        );
        created += 1;

        await pool.query(
          `INSERT INTO alerts (type, title, message)
           VALUES ('new_subscription', $1, $2)`,
          [
            `New subscription detected: ${latest.merchant_name}`,
            `${latest.merchant_name} appears to be a recurring (${frequency}) charge of $${amount.toFixed(2)}.`,
          ]
        );
      } else {
        const existing = existingRows[0];
        const previousAmount = Math.abs(Number(existing.amount));

        await pool.query(
          `UPDATE subscriptions SET
             amount = $1, frequency = $2, last_charge_date = $3,
             next_expected_date = $4, price_history = $5, account_id = $6,
             category_id = $7, updated_at = now()
           WHERE id = $8`,
          [
            amount,
            frequency,
            lastChargeDate,
            nextExpectedDate,
            JSON.stringify(priceHistory),
            latest.account_id,
            categoryId,
            existing.id,
          ]
        );
        updated += 1;

        if (Math.abs(amount - previousAmount) > 0.01) {
          priceIncreases += 1;
          await pool.query(
            `INSERT INTO alerts (type, title, message, subscription_id)
             VALUES ('price_increase', $1, $2, $3)`,
            [
              `Price change: ${latest.merchant_name}`,
              `${latest.merchant_name} changed from $${previousAmount.toFixed(2)} to $${amount.toFixed(2)}.`,
              existing.id,
            ]
          );
        }
      }
    }

    return NextResponse.json({ created, updated, priceIncreases });
  } catch (error) {
    console.error("Failed to detect subscriptions", error);
    return NextResponse.json(
      { error: "Failed to detect subscriptions" },
      { status: 500 }
    );
  }
}

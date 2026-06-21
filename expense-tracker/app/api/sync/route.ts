import { NextResponse } from "next/server";

import { plaidClient } from "@/lib/plaid";
import { pool } from "@/lib/db";

async function syncItem(item: { id: number; access_token: string; cursor: string | null }) {
  let cursor = item.cursor ?? undefined;
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: item.access_token,
      cursor,
    });
    const data = response.data;

    for (const txn of [...data.added, ...data.modified]) {
      const accountResult = await pool.query(
        "SELECT id FROM accounts WHERE plaid_account_id = $1",
        [txn.account_id]
      );
      if (accountResult.rows.length === 0) continue;
      const accountId = accountResult.rows[0].id;

      await pool.query(
        `INSERT INTO transactions (
           account_id, plaid_transaction_id, amount, iso_currency_code, date,
           authorized_date, merchant_name, name, pending, payment_channel
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (plaid_transaction_id) DO UPDATE SET
           amount = EXCLUDED.amount,
           date = EXCLUDED.date,
           merchant_name = EXCLUDED.merchant_name,
           name = EXCLUDED.name,
           pending = EXCLUDED.pending,
           updated_at = now()`,
        [
          accountId,
          txn.transaction_id,
          txn.amount,
          txn.iso_currency_code ?? "USD",
          txn.date,
          txn.authorized_date,
          txn.merchant_name,
          txn.name,
          txn.pending,
          txn.payment_channel,
        ]
      );
    }
    added += data.added.length;
    modified += data.modified.length;

    for (const txn of data.removed) {
      if (txn.transaction_id) {
        await pool.query(
          "DELETE FROM transactions WHERE plaid_transaction_id = $1",
          [txn.transaction_id]
        );
        removed += 1;
      }
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await pool.query(
    "UPDATE plaid_items SET cursor = $1, updated_at = now() WHERE id = $2",
    [cursor, item.id]
  );

  return { added, modified, removed };
}

export async function POST() {
  try {
    const items = await pool.query(
      "SELECT id, access_token, cursor FROM plaid_items"
    );

    const results = [];
    for (const item of items.rows) {
      results.push({ item_id: item.id, ...(await syncItem(item)) });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Failed to sync transactions", error);
    return NextResponse.json(
      { error: "Failed to sync transactions" },
      { status: 500 }
    );
  }
}

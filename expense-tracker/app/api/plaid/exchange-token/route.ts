import { NextResponse } from "next/server";

import { plaidClient } from "@/lib/plaid";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { public_token, institution } = await request.json();

    if (!public_token) {
      return NextResponse.json(
        { error: "public_token is required" },
        { status: 400 }
      );
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    const { access_token, item_id } = exchangeResponse.data;

    const accountsResponse = await plaidClient.accountsGet({ access_token });

    const itemResult = await pool.query(
      `INSERT INTO plaid_items (item_id, access_token, institution_id, institution_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id) DO UPDATE SET access_token = EXCLUDED.access_token
       RETURNING id`,
      [item_id, access_token, institution?.institution_id ?? null, institution?.name ?? null]
    );
    const plaidItemId = itemResult.rows[0].id;

    for (const account of accountsResponse.data.accounts) {
      await pool.query(
        `INSERT INTO accounts (
           plaid_item_id, plaid_account_id, name, official_name, type, subtype, mask,
           current_balance, available_balance
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (plaid_account_id) DO UPDATE SET
           name = EXCLUDED.name,
           current_balance = EXCLUDED.current_balance,
           available_balance = EXCLUDED.available_balance,
           updated_at = now()`,
        [
          plaidItemId,
          account.account_id,
          account.name,
          account.official_name,
          account.type,
          account.subtype,
          account.mask,
          account.balances.current,
          account.balances.available,
        ]
      );
    }

    return NextResponse.json({ success: true, accounts: accountsResponse.data.accounts.length });
  } catch (error) {
    console.error("Failed to exchange public token", error);
    return NextResponse.json(
      { error: "Failed to exchange public token" },
      { status: 500 }
    );
  }
}

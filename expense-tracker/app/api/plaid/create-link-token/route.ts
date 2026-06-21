import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";

import { plaidClient } from "@/lib/plaid";

export async function POST() {
  try {
    const response = await plaidClient.linkTokenCreate({
      client_name: "Expense Tracker",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: "single-user" },
      products: [Products.Transactions],
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Failed to create link token", error);
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    );
  }
}

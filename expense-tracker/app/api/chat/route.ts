import { NextResponse } from "next/server";

import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const [{ rows: transactions }, { rows: subscriptions }] = await Promise.all([
      pool.query(
        `SELECT t.date, t.merchant_name, t.name, t.amount, c.name AS category
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.date >= CURRENT_DATE - interval '90 days'
         ORDER BY t.date DESC
         LIMIT 1000`
      ),
      pool.query(
        `SELECT merchant_name, amount, frequency, status, next_expected_date, price_history
         FROM subscriptions
         ORDER BY amount DESC`
      ),
    ]);

    const context = `Transactions (last 90 days, JSON):\n${JSON.stringify(transactions)}\n\nSubscriptions (JSON):\n${JSON.stringify(subscriptions)}`;

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system:
        "You are a personal finance assistant. Answer the user's question using only the transaction and subscription data provided below. Be concise and include specific dollar amounts. If the data provided doesn't answer the question, say so.\n\n" +
        context,
      messages: [{ role: "user", content: message }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat request failed", error);
    return NextResponse.json({ error: "Chat request failed" }, { status: 500 });
  }
}

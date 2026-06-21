import { NextResponse } from "next/server";

import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { pool } from "@/lib/db";
import { CATEGORY_NAMES } from "@/lib/categories";

const BATCH_SIZE = 50;

export async function POST() {
  try {
    const { rows: uncategorized } = await pool.query(
      `SELECT id, merchant_name, name, amount, date
       FROM transactions
       WHERE category_id IS NULL
       ORDER BY date DESC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (uncategorized.length === 0) {
      return NextResponse.json({ categorized: 0 });
    }

    const { rows: categories } = await pool.query(
      "SELECT id, name FROM categories"
    );
    const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Categorize each of these bank transactions into exactly one of these categories: ${CATEGORY_NAMES.join(", ")}.\n\nTransactions:\n${JSON.stringify(
            uncategorized.map((t) => ({
              id: t.id,
              merchant: t.merchant_name,
              description: t.name,
              amount: t.amount,
              date: t.date,
            }))
          )}`,
        },
      ],
      tools: [
        {
          name: "categorize_transactions",
          description: "Assign a category and confidence score to each transaction.",
          input_schema: {
            type: "object",
            properties: {
              categorizations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer", description: "transaction id" },
                    category: { type: "string", enum: [...CATEGORY_NAMES] },
                    confidence: { type: "number", description: "0 to 1" },
                  },
                  required: ["id", "category", "confidence"],
                },
              },
            },
            required: ["categorizations"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "categorize_transactions" },
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "No categorization returned" }, { status: 502 });
    }

    const { categorizations } = toolUse.input as {
      categorizations: { id: number; category: string; confidence: number }[];
    };

    let updated = 0;
    for (const c of categorizations) {
      const categoryId = categoryIdByName.get(c.category);
      if (!categoryId) continue;
      await pool.query(
        `UPDATE transactions SET category_id = $1, ai_category_confidence = $2, updated_at = now()
         WHERE id = $3`,
        [categoryId, c.confidence, c.id]
      );
      updated += 1;
    }

    return NextResponse.json({ categorized: updated });
  } catch (error) {
    console.error("Failed to categorize transactions", error);
    return NextResponse.json(
      { error: "Failed to categorize transactions" },
      { status: 500 }
    );
  }
}

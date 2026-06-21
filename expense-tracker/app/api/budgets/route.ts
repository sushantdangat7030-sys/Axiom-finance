import { NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { getCurrentMonthSpendByCategory } from "@/lib/spending";

export async function GET() {
  const { rows: budgets } = await pool.query(
    `SELECT b.*, c.name AS category_name
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     ORDER BY c.name ASC`
  );
  const spendByCategory = await getCurrentMonthSpendByCategory();

  const withSpend = budgets.map((b) => ({
    ...b,
    current_spend: spendByCategory.get(b.category_id) ?? 0,
  }));

  return NextResponse.json({ budgets: withSpend });
}

export async function POST(request: Request) {
  const { category_id, monthly_limit, alert_threshold_pct } = await request.json();

  if (!category_id || !monthly_limit) {
    return NextResponse.json(
      { error: "category_id and monthly_limit are required" },
      { status: 400 }
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO budgets (category_id, monthly_limit, alert_threshold_pct)
     VALUES ($1, $2, $3)
     ON CONFLICT (category_id) DO UPDATE SET
       monthly_limit = EXCLUDED.monthly_limit,
       alert_threshold_pct = EXCLUDED.alert_threshold_pct,
       updated_at = now()
     RETURNING *`,
    [category_id, monthly_limit, alert_threshold_pct ?? 80]
  );

  return NextResponse.json({ budget: rows[0] });
}

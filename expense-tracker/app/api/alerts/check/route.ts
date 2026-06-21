import { NextResponse } from "next/server";

import { pool } from "@/lib/db";
import { getCurrentMonthSpendByCategory } from "@/lib/spending";

export async function POST() {
  const { rows: budgets } = await pool.query(
    `SELECT b.*, c.name AS category_name FROM budgets b JOIN categories c ON c.id = b.category_id`
  );
  const spendByCategory = await getCurrentMonthSpendByCategory();

  let created = 0;
  for (const budget of budgets) {
    const spend = spendByCategory.get(budget.category_id) ?? 0;
    const pct = (spend / Number(budget.monthly_limit)) * 100;
    if (pct < Number(budget.alert_threshold_pct)) continue;

    const { rows: existing } = await pool.query(
      `SELECT id FROM alerts
       WHERE budget_id = $1 AND type = 'budget_threshold'
         AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [budget.id]
    );
    if (existing.length > 0) continue;

    await pool.query(
      `INSERT INTO alerts (type, title, message, budget_id)
       VALUES ('budget_threshold', $1, $2, $3)`,
      [
        `${budget.category_name} budget at ${pct.toFixed(0)}%`,
        `You've spent $${spend.toFixed(2)} of your $${Number(budget.monthly_limit).toFixed(2)} ${budget.category_name} budget this month.`,
        budget.id,
      ]
    );
    created += 1;
  }

  return NextResponse.json({ created });
}

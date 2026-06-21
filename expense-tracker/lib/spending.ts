import { pool } from "@/lib/db";

export async function getCurrentMonthSpendByCategory() {
  const { rows } = await pool.query(
    `SELECT category_id, COALESCE(SUM(amount), 0) AS spend
     FROM transactions
     WHERE amount > 0
       AND date >= date_trunc('month', CURRENT_DATE)
       AND date < date_trunc('month', CURRENT_DATE) + interval '1 month'
     GROUP BY category_id`
  );
  const spendByCategory = new Map<number, number>();
  for (const row of rows) {
    if (row.category_id !== null) {
      spendByCategory.set(row.category_id, Number(row.spend));
    }
  }
  return spendByCategory;
}

export async function getMonthlySpendByCategory(monthsBack = 6) {
  const { rows } = await pool.query(
    `SELECT
       to_char(date_trunc('month', date), 'YYYY-MM') AS month,
       c.name AS category_name,
       COALESCE(SUM(t.amount), 0) AS spend
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.amount > 0
       AND t.date >= date_trunc('month', CURRENT_DATE) - (interval '1 month' * $1)
     GROUP BY month, c.name
     ORDER BY month ASC`,
    [monthsBack]
  );
  return rows as { month: string; category_name: string | null; spend: string }[];
}

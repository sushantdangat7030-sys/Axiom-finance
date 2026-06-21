import { BudgetForm } from "@/components/budget-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pool } from "@/lib/db";
import { getCurrentMonthSpendByCategory } from "@/lib/spending";

async function getBudgets() {
  const { rows } = await pool.query(
    `SELECT b.*, c.name AS category_name
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     ORDER BY c.name ASC`
  );
  return rows;
}

async function getCategories() {
  const { rows } = await pool.query("SELECT id, name FROM categories ORDER BY name ASC");
  return rows;
}

export default async function BudgetsPage() {
  const [budgets, categories, spendByCategory] = await Promise.all([
    getBudgets(),
    getCategories(),
    getCurrentMonthSpendByCategory(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Budgets</h1>

      <Card>
        <CardHeader>
          <CardTitle>Set a monthly budget</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetForm categories={categories} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {budgets.map((b) => {
          const spend = spendByCategory.get(b.category_id) ?? 0;
          const limit = Number(b.monthly_limit);
          const pct = limit > 0 ? Math.min((spend / limit) * 100, 100) : 0;
          const over = spend > limit;
          return (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{b.category_name}</span>
                  <span className={over ? "text-destructive" : "text-muted-foreground"}>
                    ${spend.toFixed(2)} / ${limit.toFixed(2)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress
                  value={pct}
                  indicatorClassName={over ? "bg-destructive" : undefined}
                />
              </CardContent>
            </Card>
          );
        })}
        {budgets.length === 0 && (
          <p className="text-muted-foreground text-sm">No budgets set yet.</p>
        )}
      </div>
    </main>
  );
}

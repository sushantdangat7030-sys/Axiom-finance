import { SubscriptionRow } from "@/components/subscription-row";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pool } from "@/lib/db";

async function getSubscriptions() {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS category_name
     FROM subscriptions s
     LEFT JOIN categories c ON c.id = s.category_id
     ORDER BY s.amount DESC`
  );
  return rows;
}

function SubscriptionTable({ subscriptions }: { subscriptions: Awaited<ReturnType<typeof getSubscriptions>> }) {
  if (subscriptions.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">No subscriptions here.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Merchant</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Frequency</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Next charge</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {subscriptions.map((s) => (
          <SubscriptionRow key={s.id} subscription={s} />
        ))}
      </TableBody>
    </Table>
  );
}

export default async function SubscriptionsPage() {
  const subscriptions = await getSubscriptions();
  const flagged = subscriptions.filter((s) => s.status === "flagged_for_cancellation");

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Subscriptions</h1>
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({subscriptions.length})</TabsTrigger>
          <TabsTrigger value="flagged">Flagged for cancellation ({flagged.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <SubscriptionTable subscriptions={subscriptions} />
        </TabsContent>
        <TabsContent value="flagged">
          <SubscriptionTable subscriptions={flagged} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

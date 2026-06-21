"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

type Subscription = {
  id: number;
  merchant_name: string;
  amount: string;
  frequency: string;
  next_expected_date: string | null;
  status: string;
  category_name: string | null;
};

export function SubscriptionRow({ subscription }: { subscription: Subscription }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(status: string) {
    setLoading(true);
    try {
      await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{subscription.merchant_name}</TableCell>
      <TableCell>${Number(subscription.amount).toFixed(2)}</TableCell>
      <TableCell className="capitalize">{subscription.frequency}</TableCell>
      <TableCell>{subscription.category_name ?? "—"}</TableCell>
      <TableCell>{subscription.next_expected_date ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={subscription.status === "active" ? "secondary" : "outline"}>
          {subscription.status.replace(/_/g, " ")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {subscription.status !== "flagged_for_cancellation" ? (
          <Button size="sm" variant="outline" disabled={loading} onClick={() => setStatus("flagged_for_cancellation")}>
            Flag for cancellation
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => setStatus("active")}>
            Unflag
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

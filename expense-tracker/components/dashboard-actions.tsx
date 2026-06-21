"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function DashboardActions() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runPipeline() {
    setLoading(true);
    setStatus("Syncing transactions...");
    try {
      const syncRes = await fetch("/api/sync", { method: "POST" }).then((r) => r.json());
      setStatus("Categorizing transactions...");
      const catRes = await fetch("/api/categorize", { method: "POST" }).then((r) => r.json());
      setStatus("Detecting subscriptions...");
      const subRes = await fetch("/api/subscriptions/detect", { method: "POST" }).then((r) =>
        r.json()
      );
      setStatus("Checking budget alerts...");
      await fetch("/api/alerts/check", { method: "POST" });

      const added = syncRes.results?.reduce((sum: number, r: { added: number }) => sum + r.added, 0) ?? 0;
      setStatus(
        `Done: ${added} new transactions, ${catRes.categorized ?? 0} categorized, ${subRes.created ?? 0} new subscriptions found.`
      );
      router.refresh();
    } catch {
      setStatus("Sync failed. Check server logs.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={runPipeline} disabled={loading} size="sm">
        {loading ? "Syncing..." : "Sync now"}
      </Button>
      {status && <p className="text-muted-foreground text-xs">{status}</p>}
    </div>
  );
}

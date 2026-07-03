"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseBrowser } from "@/lib/supabase/client";

type Conn = { id: string; provider: string; address: string; status: string; last_synced_at: string | null };
type Alert = {
  id: string; confidence: string; reason: string;
  transaction: { merchant: string; amount: number; date: string; source: string };
  candidate: { merchant: string; amount: number; date: string; source: string };
};

export default function SettingsPage() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [syncMsg, setSyncMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { data } = await supabase.from("connected_accounts")
      .select("id,provider,address,status,last_synced_at");
    setConns(data ?? []);
    const d = await (await fetch("/api/duplicates")).json();
    setAlerts(d.alerts ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sync() {
    setBusy(true); setSyncMsg("Syncing…");
    const d = await (await fetch("/api/email/sync", { method: "POST" })).json();
    setSyncMsg(d.results
      ? d.results.map((r: { address: string; scanned?: number; inserted?: number; error?: string }) =>
          r.error ? `${r.address}: ${r.error}` :
          `${r.address}: scanned ${r.scanned}, added ${r.inserted}`).join(" · ")
      : d.error ?? "done");
    setBusy(false);
    load();
  }

  async function resolve(id: string, action: "merge" | "dismiss") {
    setAlerts((a) => a.filter((x) => x.id !== id));
    await fetch("/api/duplicates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertId: id, action }),
    });
  }

  async function disconnect(id: string) {
    const supabase = supabaseBrowser();
    await supabase.from("connected_accounts").delete().eq("id", id);
    load();
  }

  async function deleteAccount() {
    if (!confirm("Delete your account and ALL data permanently?")) return;
    if (!confirm("This cannot be undone. Export your data first. Continue?")) return;
    await fetch("/api/account/delete", { method: "POST" });
    await supabaseBrowser().auth.signOut();
    location.href = "/login";
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email connections</CardTitle>
          <CardDescription>
            Read-only access. Axiom scans for receipts and payment confirmations, stores only the
            extracted transaction data, and never keeps email content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {conns.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium capitalize">{c.provider}</span> · {c.address}{" "}
                <Badge variant={c.status === "active" ? "outline" : "destructive"}>{c.status}</Badge>
                <div className="text-xs text-muted-foreground">
                  {c.last_synced_at ? `Last synced ${new Date(c.last_synced_at).toLocaleString()}` : "Never synced"}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => disconnect(c.id)}>Disconnect</Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <a href="/api/email/gmail/connect"><Button variant="outline" size="sm">Connect Gmail</Button></a>
            <a href="/api/email/outlook/connect"><Button variant="outline" size="sm">Connect Outlook</Button></a>
            {conns.length > 0 && (
              <Button size="sm" onClick={sync} disabled={busy}>{busy ? "Syncing…" : "Sync now"}</Button>
            )}
          </div>
          {syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}
        </CardContent>
      </Card>

      <Card id="duplicates">
        <CardHeader>
          <CardTitle className="text-base">Duplicate alerts {alerts.length > 0 && `(${alerts.length})`}</CardTitle>
          <CardDescription>Possible duplicates found across sources. Merge keeps the older one.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">No open alerts.</p>}
          {alerts.map((a) => (
            <div key={a.id} className="space-y-1 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{a.confidence}</Badge>
                <span className="text-xs text-muted-foreground">{a.reason}</span>
              </div>
              <div>{a.transaction?.merchant} · {a.transaction?.date} · {a.transaction?.amount} ({a.transaction?.source})</div>
              <div className="text-muted-foreground">{a.candidate?.merchant} · {a.candidate?.date} · {a.candidate?.amount} ({a.candidate?.source})</div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => resolve(a.id, "merge")}>Merge (remove newer)</Button>
                <Button size="sm" variant="ghost" onClick={() => resolve(a.id, "dismiss")}>Keep both</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Export</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <a href="/api/export?format=csv"><Button variant="outline" size="sm">All data (CSV)</Button></a>
          <a href="/api/export?format=xlsx"><Button variant="outline" size="sm">All data (Excel)</Button></a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-red-600">Danger zone</CardTitle>
          <CardDescription>Permanently delete your account, transactions, connections and files.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={deleteAccount}>Delete account & all data</Button>
        </CardContent>
      </Card>
    </main>
  );
}

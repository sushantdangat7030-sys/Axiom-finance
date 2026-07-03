import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { listMessages, refreshAccess, type Provider } from "@/lib/email/providers";
import { extractFromEmail } from "@/lib/email/extract";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 120;

/** POST /api/email/sync — sync all active connections for the current user.
 *  Raw email content is processed in memory and never stored. */
export const POST = handle(async () => {
  const { supabase, user } = await requireUser();
  const { data: accounts } = await supabase
    .from("connected_accounts").select("*").eq("status", "active");
  if (!accounts?.length)
    return NextResponse.json({ error: "No connected email accounts" }, { status: 400 });

  const results = [];
  for (const acc of accounts) {
    const { data: log } = await supabase.from("email_sync_logs")
      .insert({ user_id: user.id, connected_account_id: acc.id }).select("id").single();
    try {
      let accessToken = decryptToken(acc.access_token_enc);
      const expired = acc.token_expires_at && new Date(acc.token_expires_at) < new Date(Date.now() + 60000);
      if (expired && acc.refresh_token_enc) {
        const fresh = await refreshAccess(acc.provider as Provider, decryptToken(acc.refresh_token_enc));
        accessToken = fresh.access_token;
        await supabase.from("connected_accounts").update({
          access_token_enc: encryptToken(fresh.access_token),
          token_expires_at: fresh.expires_in
            ? new Date(Date.now() + fresh.expires_in * 1000).toISOString() : null,
        }).eq("id", acc.id);
      }

      const sinceDays = acc.last_synced_at
        ? Math.min(30, Math.ceil((Date.now() - new Date(acc.last_synced_at).getTime()) / 86400000) + 2)
        : 90;
      const emails = await listMessages(acc.provider as Provider, accessToken, { sinceDays });
      const raws = emails.map(extractFromEmail).filter((t): t is NonNullable<typeof t> => t !== null);

      const r = await runPipeline(supabase, user.id, raws, {
        source: "email", connectedAccountId: acc.id,
      });
      await supabase.from("email_sync_logs").update({
        finished_at: new Date().toISOString(), emails_scanned: emails.length,
        transactions_found: r.inserted, duplicates_skipped: r.duplicatesSkipped, status: "ok",
      }).eq("id", log!.id);
      await supabase.from("connected_accounts")
        .update({ last_synced_at: new Date().toISOString() }).eq("id", acc.id);
      results.push({ provider: acc.provider, address: acc.address, scanned: emails.length, ...r });
    } catch (e) {
      await supabase.from("email_sync_logs").update({
        finished_at: new Date().toISOString(), status: "error", error: String((e as Error).message).slice(0, 500),
      }).eq("id", log!.id);
      await supabase.from("connected_accounts").update({ status: "error" }).eq("id", acc.id);
      results.push({ provider: acc.provider, address: acc.address, error: (e as Error).message });
    }
  }
  return NextResponse.json({ results });
});

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { exchangeCode, emailFromIdToken, type Provider } from "@/lib/email/providers";
import { encryptToken } from "@/lib/crypto";

export const GET = handle(async (req: NextRequest, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  if (provider !== "gmail" && provider !== "outlook")
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  const { supabase, user } = await requireUser();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = req.cookies.get(`oauth_state_${provider}`)?.value;
  if (!code || !state || state !== saved)
    return NextResponse.redirect(new URL("/settings?error=oauth_state", req.nextUrl.origin));

  const redirectUri = `${req.nextUrl.origin}/api/email/${provider}/callback`;
  const tokens = await exchangeCode(provider as Provider, code, redirectUri);
  const address = emailFromIdToken(tokens.id_token) ?? user.email ?? "unknown";

  await supabase.from("connected_accounts").upsert({
    user_id: user.id, provider, address,
    access_token_enc: encryptToken(tokens.access_token),
    refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    token_expires_at: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    scopes: provider === "gmail" ? ["gmail.readonly"] : ["Mail.Read"],
    status: "active",
  }, { onConflict: "user_id,provider,address" });

  const res = NextResponse.redirect(new URL("/settings?connected=" + provider, req.nextUrl.origin));
  res.cookies.delete(`oauth_state_${provider}`);
  return res;
});

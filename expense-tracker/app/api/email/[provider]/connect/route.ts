import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { authorizeUrl, type Provider } from "@/lib/email/providers";

export const GET = handle(async (req: NextRequest, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  if (provider !== "gmail" && provider !== "outlook")
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  await requireUser();
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/email/${provider}/callback`;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(provider as Provider, redirectUri, state));
  res.cookies.set(`oauth_state_${provider}`, state, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
});

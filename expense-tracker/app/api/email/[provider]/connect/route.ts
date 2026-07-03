import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";
import { authorizeUrl, type Provider } from "@/lib/email/providers";

export const GET = handle(async (req: NextRequest, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  if (provider !== "gmail" && provider !== "outlook")
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  await requireUser();
  const id = provider === "gmail"
    ? process.env.GOOGLE_CLIENT_ID?.trim() : process.env.MS_CLIENT_ID?.trim();
  if (!id)
    return NextResponse.json({
      error: `${provider === "gmail" ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : "MS_CLIENT_ID / MS_CLIENT_SECRET"} not set in Vercel environment variables (or the latest deploy didn't include them). Add them, redeploy, then try again.`,
    }, { status: 500 });
  if (provider === "gmail" && !id.endsWith(".apps.googleusercontent.com"))
    return NextResponse.json({
      error: `GOOGLE_CLIENT_ID looks wrong — it should end with ".apps.googleusercontent.com" (got "${id.slice(0, 20)}…"). Fix it in Vercel and redeploy.`,
    }, { status: 500 });
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/email/${provider}/callback`;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(provider as Provider, redirectUri, state));
  res.cookies.set(`oauth_state_${provider}`, state, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
});

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Completes the magic-link sign-in: exchanges the one-time code for a session. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = req.nextUrl.origin;
  if (!code) return NextResponse.redirect(`${origin}/login`);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  return NextResponse.redirect(`${origin}/`);
}

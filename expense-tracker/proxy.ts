import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refresh the Supabase session and gate the app behind login. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || !/^https:\/\/.+\.supabase\.co$/.test(url)) {
    return new NextResponse(
      `Setup problem: the Vercel environment variable ${!url ? "NEXT_PUBLIC_SUPABASE_URL is missing" : !key ? "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing" : `NEXT_PUBLIC_SUPABASE_URL looks wrong (got "${url}", expected https://xxxx.supabase.co)`}. Fix it in Vercel → Settings → Environment Variables, then Redeploy.`,
      { status: 500 }
    );
  }
  let response = NextResponse.next({ request });
  try {
  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/auth");
  if (!user && !isPublic && !pathname.startsWith("/api"))
    return NextResponse.redirect(new URL("/login", request.url));
  if (user && pathname.startsWith("/login"))
    return NextResponse.redirect(new URL("/", request.url));
  return response;
  } catch (e) {
    return new NextResponse(
      `Setup problem while contacting Supabase: ${(e as Error).message}. ` +
      `Check the Supabase URL and keys in Vercel → Settings → Environment Variables, then Redeploy.`,
      { status: 500 }
    );
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)"],
};

/** Gmail + Outlook: OAuth (read-only scopes) and message listing via raw REST.
 *  Only metadata + snippets are fetched; bodies are never persisted. */
import type { EmailMeta } from "./extract";

export type Provider = "gmail" | "outlook";

const CFG = {
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/gmail.readonly openid email",
    clientId: () => process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
  },
  outlook: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "https://graph.microsoft.com/Mail.Read offline_access openid email",
    clientId: () => process.env.MS_CLIENT_ID?.trim() ?? "",
    clientSecret: () => process.env.MS_CLIENT_SECRET?.trim() ?? "",
  },
} as const;

export function authorizeUrl(provider: Provider, redirectUri: string, state: string): string {
  const c = CFG[provider];
  const p = new URLSearchParams({
    client_id: c.clientId(), redirect_uri: redirectUri, response_type: "code",
    scope: c.scope, state, access_type: "offline", prompt: "consent",
  });
  if (provider === "outlook") { p.delete("access_type"); p.delete("prompt"); }
  return `${c.authUrl}?${p}`;
}

export interface TokenSet {
  access_token: string; refresh_token?: string; expires_in?: number; id_token?: string;
}

export async function exchangeCode(provider: Provider, code: string, redirectUri: string): Promise<TokenSet> {
  const c = CFG[provider];
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId(), client_secret: c.clientSecret(),
      code, redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccess(provider: Provider, refreshToken: string): Promise<TokenSet> {
  const c = CFG[provider];
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId(), client_secret: c.clientSecret(),
      refresh_token: refreshToken, grant_type: "refresh_token",
      ...(provider === "outlook" ? { scope: c.scope } : {}),
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  return res.json();
}

export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload.email ?? null;
  } catch { return null; }
}

/** Financial-looking recent messages (metadata + snippet only). */
export async function listMessages(
  provider: Provider, accessToken: string, opts: { sinceDays?: number; max?: number } = {}
): Promise<EmailMeta[]> {
  const since = opts.sinceDays ?? 30, max = Math.min(opts.max ?? 100, 200);
  const headers = { authorization: `Bearer ${accessToken}` };

  if (provider === "gmail") {
    const q = encodeURIComponent(
      `newer_than:${since}d (subject:(receipt OR invoice OR order OR payment OR booking OR subscription OR statement OR debited) OR from:(no-reply OR noreply OR billing OR receipts))`);
    const list = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${max}`, { headers });
    if (!list.ok) throw new Error(`gmail list failed: ${list.status}`);
    const { messages = [] } = await list.json();
    const out: EmailMeta[] = [];
    for (const m of messages as { id: string }[]) {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers });
      if (!r.ok) continue;
      const d = await r.json();
      const h = (name: string) =>
        (d.payload?.headers as { name: string; value: string }[] | undefined)
          ?.find((x) => x.name.toLowerCase() === name)?.value ?? "";
      out.push({ id: d.id, from: h("from"), subject: h("subject"), date: h("date"), snippet: d.snippet ?? "" });
    }
    return out;
  }

  // outlook
  const sinceIso = new Date(Date.now() - since * 86400000).toISOString();
  const url =
    `https://graph.microsoft.com/v1.0/me/messages?$top=${max}&$select=id,subject,from,receivedDateTime,bodyPreview` +
    `&$filter=receivedDateTime ge ${sinceIso}&$orderby=receivedDateTime desc`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`outlook list failed: ${res.status}`);
  const { value = [] } = await res.json();
  return (value as any[]).map((m) => ({
    id: m.id,
    from: `${m.from?.emailAddress?.name ?? ""} <${m.from?.emailAddress?.address ?? ""}>`,
    subject: m.subject ?? "",
    date: m.receivedDateTime ?? "",
    snippet: m.bodyPreview ?? "",
  }));
}

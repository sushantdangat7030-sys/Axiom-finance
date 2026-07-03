# Axiom Finance — Setup (one-time, ~15 minutes, all free tiers)

## 1. Supabase (database + auth + storage)

1. Go to https://supabase.com → New project (free). Pick any name/region.
2. In the project: **SQL Editor → New query** → paste the whole of
   `supabase/migrations/0001_init.sql` → Run.
3. **Project Settings → API** — copy these three values:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)
4. **Authentication → URL Configuration**: set Site URL to your Vercel URL
   (add it after step 2 below).

## 2. Vercel (hosting)

1. https://vercel.com → sign up with GitHub → **Add New Project** → import
   `Axiom-finance` → set **Root Directory** to `expense-tracker`.
2. Add Environment Variables (Settings → Environment Variables):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `TOKEN_ENCRYPTION_KEY` | run `openssl rand -hex 32` (or ask Claude for one) |
| `ANTHROPIC_API_KEY` | *(optional)* enables AI categorization fallback |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(optional)* step 3 |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | *(optional)* step 4 |

3. Deploy. Sign in with your email (magic link). Import a CSV — done.

## 3. Gmail connection (optional)

1. https://console.cloud.google.com → new project → **APIs & Services →
   Enable APIs** → enable **Gmail API**.
2. **OAuth consent screen**: External → fill app name/email → add scope
   `.../auth/gmail.readonly` → add YOURSELF under **Test users**
   (personal use never needs Google verification while in Testing mode).
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URI: `https://<your-vercel-app>/api/email/gmail/callback`
4. Copy client id/secret into Vercel env vars, redeploy, then Settings →
   Connect Gmail → Sync now.

## 4. Outlook connection (optional)

1. https://entra.microsoft.com → App registrations → New: supported accounts
   "Any org + personal Microsoft accounts", redirect URI (Web):
   `https://<your-vercel-app>/api/email/outlook/callback`.
2. Certificates & secrets → new client secret.
3. API permissions: Microsoft Graph → Delegated → `Mail.Read`, `offline_access`.
4. Copy into `MS_CLIENT_ID` / `MS_CLIENT_SECRET`, redeploy.

## Local development

```sh
cd expense-tracker
cp .env.example .env.local   # fill in values
npm install && npm run dev
```

Run tests: `npm test`

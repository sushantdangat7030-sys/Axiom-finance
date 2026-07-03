# Axiom Finance — Production Upgrade Plan

Transform the scaffold into an automated, AI-powered personal finance platform:
connect email / upload files → transactions appear, categorized, deduplicated,
with subscriptions and insights — no manual entry.

## 1. Codebase analysis (done)

| Area | Before | Issue | After |
|---|---|---|---|
| Data layer | raw `pg` → Neon `DATABASE_URL` | no auth, no user isolation, schema not in repo | Supabase Postgres, migrations in repo, RLS on every table |
| Ingestion | Plaid | replaced per spec | Email (Gmail/Outlook) + CSV/XLSX/PDF/receipt OCR |
| Categorization | LLM-only endpoint | slow, costly, no learning | merchant_rules → built-in rules → LLM fallback → learning loop |
| Security | none | plaintext tokens impossible (no tokens), no deletion | AES-256-GCM token encryption, RLS, audit logs, full account delete |
| Subscriptions | good frequency detector | kept | ported into `lib/engine/subscriptions.ts` + tests |
| Tests | none | — | vitest unit suite for all engines/parsers |

`web/` (the live GitHub Pages lite app) is untouched — zero breaking changes.

## 2. Architecture

```
Next.js 16 (App Router, TS, Tailwind 4, shadcn/ui)  →  Vercel (free)
  app/api/*           route handlers (auth-gated via Supabase SSR)
  lib/engine/*        pure, unit-tested domain logic (no I/O)
  lib/parsers/*       csv / xlsx / pdf / receipt-text → RawTransaction[]
  lib/email/*         provider interface + gmail / outlook implementations
  lib/supabase/*      server & browser clients, storage helpers
Supabase (free)       Postgres + Auth (magic link) + Storage + RLS
Anthropic API         LLM categorization fallback + insight narratives (optional)
Tesseract.js          OCR — runs in the BROWSER (keeps serverless bundle small)
```

**Ingestion pipeline (single path for every source):**
`RawTransaction` → normalize → categorize (rules→AI) → dedupe → insert
→ `import_history` audit row → `duplicate_alerts` for uncertain matches.

## 3. Database (see `supabase/migrations/0001_init.sql`)

11 tables, all with `user_id uuid references auth.users` + RLS
(`using (auth.uid() = user_id)`): `profiles` (=users), `transactions`,
`categories`, `subscriptions`, `budgets`, `connected_accounts`,
`email_sync_logs`, `import_history`, `duplicate_alerts`, `merchant_rules`,
`attachments`. Storage bucket `attachments` with per-user folder policy.

Key columns on `transactions`: merchant, amount, currency, date, category_id,
subcategory, payment_method, tags[], notes, source(email|csv|xlsx|pdf|receipt|manual),
order_id, external_id (email message id / file row hash), confidence_score,
review_needed. Unique partial index on (user_id, external_id) makes re-imports
idempotent.

## 4. API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/import` | POST | files or parsed rows → full pipeline; returns inserted/duplicates/flagged |
| `/api/transactions` | GET/POST | list w/ filters; manual add (same pipeline) |
| `/api/transactions/[id]` | PATCH/DELETE | edit; category edit ⇒ upsert merchant_rule (learning loop) |
| `/api/email/[provider]/connect` | GET | OAuth start (gmail\|outlook) |
| `/api/email/[provider]/callback` | GET | token exchange, AES-256-GCM encrypt, store |
| `/api/email/sync` | POST | fetch → extract → pipeline; logs to email_sync_logs; bodies never stored |
| `/api/duplicates` | GET/POST | list alerts; resolve (merge / keep both) |
| `/api/subscriptions` | GET/POST | list; re-detect from transactions |
| `/api/insights` | GET | overspend, subscription waste, anomalies, savings tips |
| `/api/export` | GET | csv \| xlsx (multi-sheet) \| print-ready report (PDF via browser print) |
| `/api/account/delete` | POST | GDPR-style full wipe: rows + storage + auth user |

## 5. UI (Monarch-level, existing shadcn kit)

- **Dashboard**: net-worth-ish cash flow, month spend vs income, top categories,
  subscription monthly/annual cost, duplicate alerts, AI insights, recents
- **Transactions**: filterable table, inline category edit (feeds learning loop),
  confidence badge, "needs review" filter
- **Import**: drag-drop CSV/XLSX/PDF/images, client-side OCR w/ progress,
  column-mapping preview, import history
- **Subscriptions**: cards w/ next billing date, frequency, annual projection, cancel-tip
- **Settings**: email connections + sync log, categories, merchant rules, export, delete account

## 6. Delivery phases

1. ✅ Plan + migrations
2. Engines + parsers + tests (pure TS — fully verifiable now)
3. API routes + Supabase glue + encryption
4. UI + `next build` green
5. **You**: create free Supabase project + Vercel deploy + paste env vars
   (checklist in `SETUP.md`) — then email OAuth + live E2E

## 7. What only you can provision (free tiers)

- Supabase project → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`; run the migration in SQL editor
- Vercel account connected to this repo (root dir `expense-tracker/`)
- Google Cloud OAuth client (Gmail readonly; add yourself as test user —
  Google verification is only needed for public apps)
- Optional: Microsoft Entra app (Outlook), `ANTHROPIC_API_KEY` (AI fallback/insights)
- `TOKEN_ENCRYPTION_KEY` (random 32-byte hex — command provided in SETUP.md)

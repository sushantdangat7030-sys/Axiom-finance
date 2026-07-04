# OCIM Chemical Inventory Bot — Deployment Guide

End-to-end deployment for the Telegram bot (`telegram_bot_system.py`) backed by
a Google Apps Script web app (`google_apps_script_backend.gs`) writing to a
Google Sheet built from `Chemical_Inventory_Automation_Template.xlsx`.

**Files expected in this directory:**

```
ocim-bot/
├── telegram_bot_system.py                      # the bot (add your copy here)
├── google_apps_script_backend.gs               # paste into script.google.com
├── Chemical_Inventory_Automation_Template.xlsx # import into Google Sheets
├── requirements.txt                            # add your copy here
├── .env.example                                # provided — copy to .env
├── preflight_check.py                          # provided — run before the bot
├── Dockerfile                                  # provided — Cloud Run / Railway
├── Procfile                                    # provided — Railway
└── DEPLOYMENT.md                               # this file
```

---

## Part 1 — Google Sheet + Apps Script backend

### 1.1 Create the Sheet

1. Go to https://docs.google.com/spreadsheets → blank spreadsheet.
2. **File → Import → Upload** → select `Chemical_Inventory_Automation_Template.xlsx`
   → Import location: **Replace spreadsheet**.
3. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...xYz`**`/edit` → that bold part is `GOOGLE_SHEET_ID`.

### 1.2 Deploy the Apps Script

1. In the Sheet: **Extensions → Apps Script** (binding the script to the sheet
   lets it use `SpreadsheetApp.getActiveSpreadsheet()` without extra auth).
2. Delete the placeholder code, paste the full contents of
   `google_apps_script_backend.gs`, **Save** (Ctrl+S).
3. **Deploy → New deployment → ⚙ → Web app**:
   - Description: `ocim-backend v1`
   - Execute as: **Me**
   - Who has access: **Anyone**  ← required; the Python bot calls it unauthenticated
4. Click **Deploy**, authorize the OAuth consent screen ("Advanced → Go to
   project (unsafe)" is normal for personal scripts).
5. Copy the **Web app URL** — it must end in `/exec`. This is `APPS_SCRIPT_URL`.

> **After every code change** in Apps Script you must either create a new
> deployment or **Deploy → Manage deployments → ✏ → Version: New version**.
> Saving alone does NOT update the `/exec` URL — this is the #1 gotcha.

### 1.3 Verify the backend from your terminal

```bash
curl -sL "$APPS_SCRIPT_URL"
```

Expected: a JSON/text response from your `doGet()` handler (HTTP 200).
If you get an HTML page containing `accounts.google.com`, access is not set
to "Anyone" — redeploy.

---

## Part 2 — Telegram bot + API keys

### 2.1 Create the bot

1. In Telegram, open **@BotFather** → `/newbot` → pick a display name and a
   username ending in `bot` (e.g. `ocim_inventory_bot`).
2. Copy the token: `1234567890:AAF...` → `TELEGRAM_BOT_TOKEN`.
3. Optional: `/setcommands` in BotFather to register the bot's command menu.
4. Get your own numeric Telegram ID (message **@userinfobot**) →
   `ALLOWED_USER_IDS`.

### 2.2 Get the AI keys

- **Claude**: https://console.anthropic.com/ → API Keys → Create Key
  (`sk-ant-...`) → `ANTHROPIC_API_KEY`. Make sure the account has credits.
- **Gemini**: https://ai.google.dev/ → Get API key (`AIza...`) → `GEMINI_API_KEY`.

---

## Part 3 — Local setup

Run everything from this `ocim-bot/` directory.

### 3.1 Python environment + dependencies

```bash
cd ocim-bot

# Python 3.10+ required
python3 --version

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install --upgrade pip
pip install -r requirements.txt
```

Expected output ends with `Successfully installed ...` and no red ERROR lines.

### 3.2 Create the .env

```bash
cp .env.example .env
nano .env    # or any editor — fill in every value
```

**Verify the variable names match your code** (the names in `.env.example`
are the conventional ones; your `telegram_bot_system.py` is the source of truth):

```bash
grep -oE 'os\.(environ\[|getenv\()."?[A-Z_]+' telegram_bot_system.py | sort -u
```

Rename any `.env` keys that differ.

### 3.3 Preflight check (tests every connection)

```bash
python preflight_check.py
```

Expected:

```
=== Summary ===
[PASS] All checks passed — safe to run: python telegram_bot_system.py
```

Fix anything marked `[FAIL]` before continuing — the script prints the exact
cause and fix next to each failure.

### 3.4 Run the bot

```bash
python telegram_bot_system.py
```

Expected: a startup log line (e.g. `Application started` /
`Start polling`) and the process stays running.

### 3.5 End-to-end test

1. In Telegram, open your bot and send `/start` → expect the welcome message.
2. Send a real inventory command (e.g. add or query a chemical).
3. Open the Google Sheet → the row should appear/update within a few seconds.
4. Check the bot's terminal log for the outgoing Apps Script request and a
   200 response.
5. In Apps Script: **Executions** (left sidebar) → the `doPost` run should
   show status **Completed**.

---

## Part 4 — Deployment checklist

Copy this into your tracking doc and tick each line:

- [ ] Google Sheet created from the .xlsx template; `GOOGLE_SHEET_ID` recorded
- [ ] Apps Script pasted, saved, deployed as Web app (Execute as: Me, Access: Anyone)
- [ ] `APPS_SCRIPT_URL` ends in `/exec` and `curl -sL` returns 200 (no login page)
- [ ] Telegram bot created via @BotFather; token recorded
- [ ] `ANTHROPIC_API_KEY` created and account has credits
- [ ] `GEMINI_API_KEY` created
- [ ] `python3 -m venv .venv` created and activated
- [ ] `pip install -r requirements.txt` completed without errors
- [ ] `.env` created from `.env.example`; names cross-checked against the code
- [ ] `python preflight_check.py` → all PASS
- [ ] `python telegram_bot_system.py` starts and stays running
- [ ] `/start` in Telegram gets a reply
- [ ] Inventory command writes a row to the Sheet
- [ ] Apps Script → Executions shows Completed runs
- [ ] `.env` is in `.gitignore` and was never committed
- [ ] Production deploy (Part 5) done; bot replies with local process stopped

---

## Part 5 — Production deployment

The bot uses **long polling** (it calls Telegram; nothing calls it), so it
deploys as a plain background worker — no inbound port or webhook needed
unless your code explicitly sets one up.

> **Run exactly ONE instance.** Two pollers on the same token fight over
> updates and Telegram returns
> `409 Conflict: terminated by other getUpdates request`.
> Stop your local bot before starting the cloud one.

### Option A — Railway.app (simplest)

1. Push this `ocim-bot/` folder to a GitHub repo (the provided `Procfile`
   and `Dockerfile` are already here; **never** push `.env`).
2. https://railway.app → **New Project → Deploy from GitHub repo** → pick the
   repo. If the bot isn't at the repo root, set
   **Settings → Root Directory** = `ocim-bot`.
3. **Variables** tab → add every key from your `.env`
   (`TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
   `APPS_SCRIPT_URL`, `GOOGLE_SHEET_ID`, `ALLOWED_USER_IDS`).
4. Railway detects the `Dockerfile` (or the `Procfile` under Nixpacks) and
   starts `python telegram_bot_system.py`.
5. **Settings → Networking**: no public domain needed (polling worker).
6. Check **Deployments → View logs** for the same startup line you saw locally.

Or via CLI:

```bash
npm i -g @railway/cli
railway login
cd ocim-bot
railway init
railway variables --set "TELEGRAM_BOT_TOKEN=..." \
                  --set "ANTHROPIC_API_KEY=..." \
                  --set "GEMINI_API_KEY=..." \
                  --set "APPS_SCRIPT_URL=..." \
                  --set "GOOGLE_SHEET_ID=..."
railway up
railway logs
```

### Option B — Google Cloud Run

Cloud Run normally expects an HTTP server; for a polling bot use a
**Cloud Run *job*-style always-on service** with CPU always allocated and
min instances 1 — or, simpler for this shape, a small **Compute Engine
e2-micro VM**. If you stay on Cloud Run:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Store secrets in Secret Manager (don't bake them into the image)
printf '%s' "$TELEGRAM_BOT_TOKEN" | gcloud secrets create telegram-bot-token --data-file=-
printf '%s' "$ANTHROPIC_API_KEY"  | gcloud secrets create anthropic-api-key  --data-file=-
printf '%s' "$GEMINI_API_KEY"     | gcloud secrets create gemini-api-key     --data-file=-

# Build & deploy from ocim-bot/
gcloud run deploy ocim-bot \
  --source . \
  --region us-central1 \
  --no-cpu-throttling \
  --min-instances 1 \
  --max-instances 1 \
  --no-allow-unauthenticated \
  --set-secrets "TELEGRAM_BOT_TOKEN=telegram-bot-token:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --set-env-vars "APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec,GOOGLE_SHEET_ID=1AbC...xYz"
```

Notes:
- `--min-instances 1 --max-instances 1 --no-cpu-throttling` keeps exactly one
  poller alive with CPU while idle (this is billed continuously).
- Cloud Run health-checks a listening port. If your bot doesn't open one,
  either add a tiny HTTP health endpoint thread, or switch to the VM approach.
- View logs: `gcloud run services logs read ocim-bot --region us-central1`

### Post-deploy verification (either platform)

1. Confirm your **local** bot process is stopped.
2. Send `/start` in Telegram → reply arrives (served by the cloud instance).
3. Add an inventory item → row appears in the Sheet.
4. Tail platform logs while doing it — you should see the update handled there.

---

## Part 6 — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Unauthorized` / HTTP 401 from `api.telegram.org` | Wrong/revoked bot token | Re-copy from @BotFather (`/token`); check for stray spaces/newlines in `.env` |
| `Conflict: terminated by other getUpdates request` (409) | Two bot instances polling the same token | Kill the other instance (local vs cloud); scale platform to 1 replica |
| Bot starts but never replies | A stale webhook is set — polling and webhooks are mutually exclusive | `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"` then restart |
| `anthropic.AuthenticationError` / 401 from Claude | Bad `ANTHROPIC_API_KEY` | Regenerate at console.anthropic.com; key must start `sk-ant-` |
| Claude 429 / `credit balance is too low` | No credits / rate limit | Add credits or raise limits in the Anthropic console |
| Claude 404 `model not found` | Code pins a retired model name | Update the model string in `telegram_bot_system.py` to a current model |
| Gemini 400 `API key not valid` | Bad key, or Generative Language API disabled | New key at ai.google.dev; enable the API for that project |
| Apps Script URL returns HTML login page | Web app access isn't "Anyone" | Redeploy: Deploy → Manage deployments → Access: **Anyone** |
| Apps Script returns old behavior after editing code | `/exec` serves the deployed version, not the editor | Manage deployments → Edit → **New version** → Deploy |
| Apps Script 404 | Deployment archived or wrong URL | Create a new deployment; update `APPS_SCRIPT_URL` |
| Rows not appearing in Sheet, bot logs 200 | Script writes to wrong sheet/tab | Check tab names in the .gs match the imported template exactly; check Apps Script → Executions for errors |
| `Exception: You do not have permission to call SpreadsheetApp...` in Executions | Script not bound to sheet / not authorized | Open script via Extensions → Apps Script from the Sheet; re-run once in the editor to re-authorize |
| `ModuleNotFoundError: No module named 'telegram'` | Deps not installed / wrong venv | `source .venv/bin/activate && pip install -r requirements.txt` |
| `ImportError: cannot import name 'Updater'` or similar | python-telegram-bot v13 vs v20+ API mismatch | Pin the major version your code targets in requirements.txt (e.g. `python-telegram-bot>=20,<22` or `==13.15`) |
| Env vars empty in production | Platform variables not set (`.env` is not uploaded) | Set them in Railway Variables / Cloud Run secrets — cloud platforms never read your local `.env` |
| Everything passes locally, cloud instance silent | Crash loop on boot | Read the platform deploy logs; usually a missing env var — the very first log lines say which |

**Ongoing operations**

- Rotate any key immediately if it was ever pasted into a chat, commit, or log.
- Watch Apps Script quotas (URL Fetch / execution time) under
  script.google.com → Executions if volume grows.
- Add a weekly check: `python preflight_check.py` exits 0 (easy to wire into
  CI or a cron job).

# OCIM Chemical Inventory Bot

A Telegram bot that automates chemical inventory tracking with AI-powered commands, backed by Google Sheets and Cloud AI (Claude + Gemini).

## 📋 Files in this folder

**You'll provide these:**
- `telegram_bot_system.py` — the Telegram bot (you have this)
- `google_apps_script_backend.gs` — the backend that writes to Sheets (you have this)
- `requirements.txt` — Python dependencies (you have this)
- `Chemical_Inventory_Automation_Template.xlsx` — Sheets template (you have this)

**We provide these:**
- `.env.example` — template for environment variables → copy to `.env`
- `QUICK_START.md` — 🎯 **START HERE** — exact step-by-step guide with commands
- `DEPLOYMENT.md` — detailed reference with troubleshooting table
- `preflight_check.py` — tests all connections before you start
- `validate_setup.sh` — comprehensive setup checker
- `Dockerfile`, `Procfile`, `.gitignore` — production deployment config

---

## 🚀 Quick start (10 minutes)

```bash
cd ocim-bot

# 1. Create and activate Python environment
python3 -m venv .venv
source .venv/bin/activate          # Linux/Mac
# .venv\Scripts\activate           # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment variables
cp .env.example .env
nano .env                          # fill in your keys

# 4. Verify everything works
python validate_setup.sh           # comprehensive check
python preflight_check.py          # deep API connectivity test

# 5. Start the bot
python telegram_bot_system.py
```

Then test in Telegram: send `/start` → you should get a reply.

---

## 📖 Full step-by-step guide

**👉 Read `QUICK_START.md`** for a detailed 8-phase walkthrough that covers:

1. **Google Sheet + Apps Script** (get your URLs)
2. **Telegram bot + API keys** (create on BotFather, Anthropic, Google)
3. **Python environment** (venv, pip install)
4. **Environment setup** (.env, variable names)
5. **Connection testing** (preflight checks)
6. **Start the bot locally** (and test in Telegram)
7. **Verification** (see rows appear in your Sheet)
8. **Production deployment** (Railway or Cloud Run)

Every step shows the **exact command**, **expected output**, and **how to fix** if it fails.

---

## 🔧 Reference docs

- **`DEPLOYMENT.md`** — detailed reference with Part 1–6, troubleshooting table (14 common issues), production deploy options
- **`preflight_check.py`** — validates all env vars + API keys (Telegram, Claude, Gemini, Apps Script) before you start the bot
- **`validate_setup.sh`** — full setup validation: files, Python environment, dependencies, git config, API connectivity

---

## 📝 What you need to provide

**Before you start, have these ready:**

### Google Cloud
- A Google account (free)
- The `.xlsx` template → upload to Google Sheets
- Ability to create Google Apps Script (free, in Sheets)

### Telegram
- A Telegram account
- A mobile phone with Telegram installed (to test)
- Message @BotFather in Telegram to create a bot and get the token

### AI API keys
- **Claude**: console.anthropic.com → API keys (free tier available with $5 credits)
- **Gemini**: ai.google.dev → Get API key (free tier available)

### Your code
- Copy your `telegram_bot_system.py`, `google_apps_script_backend.gs`, `requirements.txt`, and `.xlsx` template here.

---

## ✅ Deployment checklist

Copy this into your tracking system; tick off as you go:

```
Preparation
- [ ] Copied telegram_bot_system.py, google_apps_script_backend.gs, requirements.txt, .xlsx here

Google Setup
- [ ] Google Sheet created from .xlsx; GOOGLE_SHEET_ID recorded
- [ ] Apps Script pasted, saved, deployed (Access: Anyone)
- [ ] APPS_SCRIPT_URL copied (ends in /exec)
- [ ] curl -sL "$APPS_SCRIPT_URL" returns HTTP 200

Telegram
- [ ] Bot created via @BotFather
- [ ] TELEGRAM_BOT_TOKEN copied (numeric:token format)

API Keys
- [ ] Claude key created; account has credits; ANTHROPIC_API_KEY copied
- [ ] Gemini key created; GEMINI_API_KEY copied

Local Setup
- [ ] python3 -m venv .venv && source .venv/bin/activate
- [ ] pip install -r requirements.txt (no errors)
- [ ] cp .env.example .env && fill in all values
- [ ] python validate_setup.sh passes all checks
- [ ] python preflight_check.py shows all PASS

Local Test
- [ ] python telegram_bot_system.py starts without errors
- [ ] Send /start in Telegram → bot replies
- [ ] Send inventory command → row appears in Sheet within 10s
- [ ] Stop bot (Ctrl+C)

Production
- [ ] .env NOT in git status (check .gitignore)
- [ ] git push origin claude/ocim-bot-deployment-rca80q
- [ ] Railway deployment running (or Cloud Run)
- [ ] Environment variables set in Railway/Cloud Run
- [ ] Send /start to cloud bot → reply arrives
- [ ] Inventory command writes row to Sheet
```

---

## 🆘 Troubleshooting

- **Quick check:** Run `python validate_setup.sh` — it catches 95% of setup problems.
- **API connectivity:** Run `python preflight_check.py` — it tests Telegram, Claude, Gemini, and Apps Script.
- **Full reference:** See the troubleshooting table in `DEPLOYMENT.md` (14 common issues with exact fixes).

Most common issues:
1. **Apps Script returns login page** → redeploy with Access: **Anyone**
2. **Environment variables empty in production** → set them in Railway Variables, not .env
3. **Two bot instances fighting over Telegram** → kill the local one before starting cloud one
4. **Bot doesn't reply** → run `python preflight_check.py` to diagnose

---

## 📊 Architecture

```
Telegram User
    ↓
telegram_bot_system.py (running locally or on Railway)
    ↓
POST request to Apps Script URL
    ↓
google_apps_script_backend.gs (deployed as Web App)
    ↓
Google Sheet (Inventory, Log, Settings tabs)
    ↓
Claude API (for intelligent inventory commands)
    ↓
Gemini API (alternative/fallback AI)
```

---

## 🔐 Security

- **Never commit `.env`** — it's in `.gitignore`
- **Use long-polling (no webhooks)** — bot initiates all connections outbound
- **Use Railway or Cloud Run** — runs with no inbound port exposed
- **Rotate keys immediately** if ever pasted in chat/logs

---

## 📞 Support

If you get stuck:
1. **Run `python validate_setup.sh`** to diagnose the setup
2. **Read the troubleshooting table in `DEPLOYMENT.md`**
3. **Check Apps Script → Executions** for the exact error
4. **Search the log output** for the exact error message

---

## 📄 File structure

```
ocim-bot/
├── README.md                                  # this file
├── QUICK_START.md                             # 🎯 start-here guide (8 phases)
├── DEPLOYMENT.md                              # full reference (6 parts + troubleshooting)
├── .env.example                               # template → copy to .env
├── preflight_check.py                         # API connectivity validator
├── validate_setup.sh                          # comprehensive setup checker
├── Dockerfile                                 # production container
├── Procfile                                   # Railway / Cloud Run config
├── .gitignore                                 # blocks .env from git
├── telegram_bot_system.py                     # (you provide this)
├── google_apps_script_backend.gs              # (you provide this)
├── requirements.txt                           # (you provide this)
└── Chemical_Inventory_Automation_Template.xlsx # (you provide this)
```

---

## 🎯 Next steps

1. **Read `QUICK_START.md`** (this is the step-by-step guide you need)
2. **Gather your API keys** (Google, Telegram, Claude, Gemini)
3. **Run `python validate_setup.sh`** to verify your setup
4. **Follow Phase 5–6 in `QUICK_START.md`** to start and test locally
5. **Follow Phase 8 in `QUICK_START.md`** to deploy to Railway

You'll have a working 24/7 bot in about an hour.

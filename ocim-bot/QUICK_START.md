# OCIM Bot — Step-by-Step Execution Guide

Follow this guide **in order**. Each step shows the exact command, what happens, and what to do if it fails.

---

## Phase 0: Prepare your files (5 min)

You have 4 files. Put them in the `ocim-bot/` folder.

### Step 0.1 — Copy your bot files here

```bash
# If your files are on your local machine:
cp /path/to/telegram_bot_system.py /home/user/Axiom-finance/ocim-bot/
cp /path/to/google_apps_script_backend.gs /home/user/Axiom-finance/ocim-bot/
cp /path/to/Chemical_Inventory_Automation_Template.xlsx /home/user/Axiom-finance/ocim-bot/
cp /path/to/requirements.txt /home/user/Axiom-finance/ocim-bot/
```

Verify they're there:

```bash
ls -la /home/user/Axiom-finance/ocim-bot/*.py /home/user/Axiom-finance/ocim-bot/*.gs /home/user/Axiom-finance/ocim-bot/*.txt /home/user/Axiom-finance/ocim-bot/*.xlsx
```

Expected output (4 lines, one for each file):

```
-rw-r--r-- ... telegram_bot_system.py
-rw-r--r-- ... google_apps_script_backend.gs
-rw-r--r-- ... requirements.txt
-rw-r--r-- ... Chemical_Inventory_Automation_Template.xlsx
```

---

## Phase 1: Cloud setup (Google + Telegram) — 15 min

### Step 1.1 — Create Google Sheet from template

1. Go to https://docs.google.com/spreadsheets
2. Click **+ Blank** (or **File → New → Spreadsheet**)
3. Once it opens: **File → Import → Upload** tab → drag/drop `Chemical_Inventory_Automation_Template.xlsx`
4. Select **Replace spreadsheet** → **Import**
5. Wait for the sheet to populate with tabs (Inventory, Log, Settings, etc.)
6. Now look at the URL bar. You'll see:
   ```
   https://docs.google.com/spreadsheets/d/1AbC_xyz_987DEFGH_ijkLMN/edit
                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                              Copy this part
   ```
   Save this as `GOOGLE_SHEET_ID` (you'll need it in `.env`).

**Expected state:** A Google Sheet with multiple tabs, formulas working, no errors.

---

### Step 1.2 — Create and deploy the Apps Script

1. In your Google Sheet: **Extensions → Apps Script** (opens a new tab)
2. You'll see a `Code.gs` file with default boilerplate. **Select all (Ctrl+A) and delete it.**
3. Copy the entire content of `google_apps_script_backend.gs` (from your ocim-bot folder)
   and paste it into the editor.
4. Click **Save** (Ctrl+S) → a popup says "Save new version".
5. Click the **Deploy** button (top right, blue).
   - A menu opens: click the dropdown, select **New deployment**
   - In "Select type" dropdown: choose **Web app**
   - "Description": type `ocim-bot-backend-v1`
   - "Execute as": **Me** (your email)
   - "Who has access": **Anyone** (this is crucial — it must be "Anyone")
   - Click **Deploy**
6. A popup shows "Authorization required". Click the account to authorize, then
   "Advanced → Go to 'project (unsafe)'" → authorize. (This is normal for personal scripts.)
7. You'll now see a success message with a URL like:
   ```
   https://script.google.com/macros/s/AKfycbw...abc123.../exec
   ```
   **Copy this entire URL** → `APPS_SCRIPT_URL` (must end in `/exec`).

**Verify it works (from your terminal):**

```bash
APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbw.../exec"
curl -sL "$APPS_SCRIPT_URL"
```

Expected: JSON or a short text response (HTTP 200). If you see HTML with
`accounts.google.com` in it, the access is not set to "Anyone" — go back to
step 1.2 and fix the access setting.

---

### Step 1.3 — Create Telegram bot

1. Open Telegram → search for **@BotFather** (verified blue checkmark)
2. Send `/newbot`
3. BotFather asks for a display name (e.g. "OCIM Inventory Bot"). Type it.
4. BotFather asks for a username (must end in `bot`, e.g. `ocim_inventory_bot`). Type it.
5. You get a response:
   ```
   Done! Congratulations on your new bot. You will find it at
   t.me/ocim_inventory_bot. You can now add a description, about section and
   commands for your bot whenever you think it needed.
   
   Use this token to access the Telegram Bot API:
   1234567890:AAF-xyzAbC_123abc_XYZabc
   ```
   **Copy the token** (the long string with `:`) → `TELEGRAM_BOT_TOKEN`.

6. (Optional but recommended) Send BotFather `/setcommands`. When asked which bot,
   pick yours. Then send:
   ```
   /start - Start the bot
   /help - Get help
   /add - Add a chemical
   /query - Query inventory
   ```
   (Adjust to match your bot's actual commands.)

**Verify the token:**

```bash
TELEGRAM_BOT_TOKEN="1234567890:AAF-xyzAbC_123abc_XYZabc"
curl -sL "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | python -m json.tool
```

Expected (pretty-printed JSON):

```json
{
  "ok": true,
  "result": {
    "id": 1234567890,
    "is_bot": true,
    "first_name": "OCIM Inventory Bot",
    "username": "ocim_inventory_bot",
    "can_join_groups": true,
    ...
  }
}
```

---

### Step 1.4 — Get AI API keys

#### Claude key

1. Go to https://console.anthropic.com/ → Log in
2. Left sidebar → **API keys** → **Create Key**
3. Give it a name like `ocim-bot-key` → **Create**
4. Copy the key (starts with `sk-ant-`) → `ANTHROPIC_API_KEY`
5. Keep this tab open to verify credits later.

**Verify credits:**

In the same console, **Billing → Overview**. You should see a positive balance
(e.g., $10.00). If it's $0, add a payment method and top up.

#### Gemini key

1. Go to https://ai.google.dev/ → Click **Get API key**
2. Click **Create API key in new Google Cloud project**
3. Copy the key (starts with `AIza`) → `GEMINI_API_KEY`

**Verify the key works:**

```bash
GEMINI_API_KEY="AIza..."
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | python -m json.tool | head -20
```

Expected: a JSON list of models (you'll see `models: [...]`).

---

## Phase 2: Local Python setup (15 min)

Run these commands from your `ocim-bot/` folder.

### Step 2.1 — Create a Python virtual environment

```bash
cd /home/user/Axiom-finance/ocim-bot

python3 --version
# Expected: Python 3.10.x or higher (3.10, 3.11, 3.12, etc.)
# If you get "command not found", install Python 3.10+ for your OS.

python3 -m venv .venv
```

This creates a `.venv/` folder (hidden by `.gitignore`).

### Step 2.2 — Activate the virtual environment

**On Linux/Mac:**

```bash
source .venv/bin/activate
```

Expected: prompt prefix changes to `(.venv) user@host:~/Axiom-finance/ocim-bot$`

**On Windows (if using Windows terminal):**

```bash
.venv\Scripts\activate
```

### Step 2.3 — Upgrade pip and install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

This runs for 1–5 minutes. Expected output ends with:

```
Successfully installed python-telegram-bot-21.0 requests-2.31.0 python-dotenv-1.0.1 ...
```

**No red ERROR lines.** If you see errors, run again or paste the error into the troubleshooting section below.

### Step 2.4 — Verify the install

```bash
python -c "import telegram; from anthropic import Anthropic; import requests; print('All imports OK')"
```

Expected: `All imports OK`

---

## Phase 3: Environment setup (5 min)

### Step 3.1 — Create the .env file

```bash
cp .env.example .env
```

This creates a `.env` in your `ocim-bot/` folder.

### Step 3.2 — Fill in .env with your real values

Open the `.env` file in any editor (nano, VS Code, etc.):

```bash
nano .env
```

You'll see:

```
TELEGRAM_BOT_TOKEN=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
APPS_SCRIPT_URL=
GOOGLE_SHEET_ID=
ALLOWED_USER_IDS=
LOG_LEVEL=INFO
```

Replace each blank with the values you gathered:

```
TELEGRAM_BOT_TOKEN=1234567890:AAF-xyzAbC_123abc_XYZabc
ANTHROPIC_API_KEY=sk-ant-v0-abc123...xyz789
GEMINI_API_KEY=AIza...
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbw.../exec
GOOGLE_SHEET_ID=1AbC_xyz_987DEFGH_ijkLMN
ALLOWED_USER_IDS=123456789
LOG_LEVEL=INFO
```

**To get `ALLOWED_USER_IDS`:** Send a message to **@userinfobot** on Telegram.
It replies with your numeric user ID. Use that (just the digits, no commas).

**Save the file:**
- nano: Ctrl+X → Y → Enter
- VS Code: Ctrl+S

### Step 3.3 — Verify variable names match your code

The names in `.env.example` are conventional, but your `telegram_bot_system.py`
is the source of truth. Check what your code actually reads:

```bash
grep -oE 'os\.(environ\[|getenv\()."?[A-Z_]+' telegram_bot_system.py | sort -u
```

This prints the exact variable names your code expects. If you see any that don't
match the ones in your `.env`, rename them to match.

---

## Phase 4: Test all connections (10 min)

### Step 4.1 — Run the preflight check

```bash
python preflight_check.py
```

This script tests every external service without starting the bot.

Expected output (all green):

```
=== 1. Environment variables ===
[PASS] TELEGRAM_BOT_TOKEN — set
[PASS] ANTHROPIC_API_KEY — set
[PASS] GEMINI_API_KEY — set
[PASS] APPS_SCRIPT_URL — set
[PASS] GOOGLE_SHEET_ID — set (optional)
[WARN] ALLOWED_USER_IDS — not set (optional)

=== 2. Telegram bot token ===
[PASS] Telegram getMe — bot is @ocim_inventory_bot

=== 3. Claude API key ===
[PASS] Claude API — key accepted

=== 4. Gemini API key ===
[PASS] Gemini API — key accepted (15 models visible)

=== 5. Google Apps Script web app ===
[PASS] Apps Script GET — HTTP 200, 145 bytes

=== Summary ===
[PASS] All checks passed — safe to run: python telegram_bot_system.py
```

**If any line says `[FAIL]`**, read the detail message next to it — it tells you
the exact problem and how to fix it. Fix it, then run `preflight_check.py` again.

---

## Phase 5: Start the bot (2 min)

### Step 5.1 — Make sure .venv is still activated

```bash
echo $VIRTUAL_ENV
```

Expected: `/home/user/Axiom-finance/ocim-bot/.venv` (not empty)

If empty, run: `source .venv/bin/activate`

### Step 5.2 — Start the bot

```bash
python telegram_bot_system.py
```

The bot starts running and stays in the foreground (polling Telegram for updates).
You'll see log output like:

```
2025-07-04 15:30:45 - INFO - Bot started successfully
2025-07-04 15:30:46 - INFO - Polling for updates...
```

**The process should NOT exit or crash.** If it does, look at the error message.
Most common: a missing env var (run `python preflight_check.py` again to check).

---

## Phase 6: Test the bot in Telegram (5 min)

### Step 6.1 — Open the bot

1. In Telegram, click the search icon (magnifying glass).
2. Type the bot username you created (e.g. `ocim_inventory_bot`).
3. Click the bot name in results → **START** button.

### Step 6.2 — Send the `/start` command

Type `/start` and press Send.

Expected: The bot replies with a welcome message (something like
"Welcome to OCIM Chemical Inventory Bot" — exact message depends on your code).

**If no reply:** Check the bot's terminal window (from step 5.2).
- If you see an error traceback, paste it into the troubleshooting section.
- If you see nothing, your bot might not be handling `/start`. Check the code.

### Step 6.3 — Test an inventory command

Send a command that adds or queries a chemical. For example (exact format depends
on your code):

```
/add chemical:Acetone qty:5L location:Lab A
```

or

```
/query Acetone
```

Expected responses:
- Bot replies (immediately or within 5 seconds).
- Terminal window shows a log line like `POST to Apps Script: ...` and
  `Response: 200 OK`.

### Step 6.4 — Verify the Sheet was updated

1. Go back to your Google Sheet (the one you created in step 1.1).
2. Click the **Inventory** tab (or whatever tab your code writes to).
3. Look for the row you just added — it should be there with the values you sent.

If the row doesn't appear:
- Wait 10 more seconds (network latency).
- Check the Apps Script **Executions** log: go to your Apps Script editor tab
  (Extensions → Apps Script in the Sheet), left sidebar → **Executions**.
- Look for the most recent `doPost` call. Click it.
- If status is **Completed**, the script ran fine; the bot code might not be
  calling it correctly.
- If status is **Failed**, you'll see the error — fix the `.gs` code.

---

## Phase 7: Clean up and prepare for production (5 min)

### Step 7.1 — Stop the bot

In the terminal where the bot is running, press **Ctrl+C** to stop it.

Expected: a clean exit (no stack trace, just returns to the prompt).

### Step 7.2 — Make sure .env is never committed

Your `.gitignore` already blocks this, but check:

```bash
git status
```

You should NOT see `.env` in the output. If you do, something went wrong with
`.gitignore` — ask before pushing.

### Step 7.3 — Commit and push your files

```bash
git add telegram_bot_system.py google_apps_script_backend.gs requirements.txt Chemical_Inventory_Automation_Template.xlsx

git commit -m "Add OCIM bot source files"

git push origin claude/ocim-bot-deployment-rca80q
```

---

## Phase 8: Deploy to production (Railway) — 10 min

Once the bot works locally, deploy it so it runs 24/7 without your laptop.

### Step 8.1 — Push code to GitHub

```bash
# Already done in Phase 7. Verify:
git log --oneline -3
# You should see your "Add OCIM bot source files" commit.
```

### Step 8.2 — Set up Railway

1. Go to https://railway.app → **Sign in** (or create account)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select the `sushantdangat7030-sys/Axiom-finance` repo
4. Railway detects the `Dockerfile` and `Procfile` in `ocim-bot/` and starts
   building automatically.

### Step 8.3 — Set environment variables in Railway

Once the build finishes, click the service → **Variables** tab.

Add each variable from your local `.env`:

```
TELEGRAM_BOT_TOKEN=1234567890:AAF-xyzAbC_123abc_XYZabc
ANTHROPIC_API_KEY=sk-ant-v0-abc123...xyz789
GEMINI_API_KEY=AIza...
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbw.../exec
GOOGLE_SHEET_ID=1AbC_xyz_987DEFGH_ijkLMN
ALLOWED_USER_IDS=123456789
```

**Important:** Never paste these into GitHub, Slack, or logs — Railway's Variables
tab is the safe place.

### Step 8.4 — Verify the deployment

1. Click **Deployments** in the left sidebar.
2. The most recent deployment should show **Running** (green checkmark).
3. Click **View logs** and you should see the same startup message as your local bot:
   ```
   2025-07-04 15:30:45 - INFO - Bot started successfully
   2025-07-04 15:30:46 - INFO - Polling for updates...
   ```

### Step 8.5 — Test from Telegram

1. **Stop your local bot** (Ctrl+C in that terminal).
2. In Telegram, send a test command to the bot.
3. You should get a reply **served by Railway**, not your laptop.
4. Add an item to the inventory — it should appear in the Sheet (served by
   the same Railway instance).

---

## Troubleshooting quick reference

| Error | Cause | Fix |
|-------|-------|-----|
| `ModuleNotFoundError: No module named 'telegram'` | Dependencies not installed | `source .venv/bin/activate && pip install -r requirements.txt` |
| `(.venv) not in prompt` | venv not activated | `source .venv/bin/activate` (Linux/Mac) or `.venv\Scripts\activate` (Windows) |
| `Unauthorized` from Telegram (401) | Wrong token | Re-copy from @BotFather; check for extra spaces in `.env` |
| `Conflict: terminated by other getUpdates request (409)` | Two bot instances running | Stop the local bot; make sure only Railway is running |
| Apps Script returns HTML login page | Access not set to "Anyone" | Redeploy the script with Access: **Anyone** |
| Sheet has no rows after sending a command | Apps Script old version deployed | Go to Manage deployments → edit → **New version** → Deploy |
| `anthropic.AuthenticationError` (401) | Bad Claude key | Regenerate at console.anthropic.com |
| `Gemini 400 API key not valid` | Bad Gemini key | Create a new key at ai.google.dev |
| Bot starts but doesn't reply | Webhook still set (Telegram only allows one input method) | `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"` then restart |

---

## Checklist: Did you complete everything?

- [ ] Step 1.1 — Google Sheet created; `GOOGLE_SHEET_ID` recorded
- [ ] Step 1.2 — Apps Script deployed; `APPS_SCRIPT_URL` copied and ends in `/exec`
- [ ] Step 1.3 — Bot created; `TELEGRAM_BOT_TOKEN` copied
- [ ] Step 1.4 — Claude and Gemini keys created and verified
- [ ] Step 2.1–2.4 — Python venv created, dependencies installed
- [ ] Step 3.1–3.3 — `.env` created and filled with real values
- [ ] Step 4.1 — `preflight_check.py` shows all PASS
- [ ] Step 5–6 — Bot starts locally and replies in Telegram
- [ ] Step 6.4 — Inventory command writes a row to the Sheet
- [ ] Step 7 — Bot stopped; `.env` not in `git status`; code pushed
- [ ] Step 8 — Railway deployment running; bot replies from cloud

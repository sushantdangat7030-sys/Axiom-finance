#!/usr/bin/env python3
"""OCIM Bot preflight check.

Verifies every external dependency BEFORE you start the bot:
  1. .env file exists and required variables are set
  2. Telegram bot token is valid (getMe)
  3. Claude API key works (1-token test message)
  4. Gemini API key works (model list)
  5. Apps Script web app URL responds

Usage:
    python preflight_check.py

Exit code 0 = all checks passed, 1 = at least one failure.
Only stdlib + requests + python-dotenv are needed.
"""

import json
import os
import sys
import urllib.request
import urllib.error

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("NOTE: python-dotenv not installed; relying on shell environment only.")

PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
WARN = "\033[93m[WARN]\033[0m"

REQUIRED_VARS = [
    "TELEGRAM_BOT_TOKEN",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "APPS_SCRIPT_URL",
]
OPTIONAL_VARS = ["GOOGLE_SHEET_ID", "ALLOWED_USER_IDS"]

failures = []


def http_json(url, method="GET", headers=None, body=None, timeout=20):
    req = urllib.request.Request(url, method=method, headers=headers or {})
    data = json.dumps(body).encode() if body is not None else None
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=data, timeout=timeout) as resp:
        return resp.status, resp.read().decode()


def check(name, ok, detail=""):
    print(f"{PASS if ok else FAIL} {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


# ---- 1. Environment variables ----
print("\n=== 1. Environment variables ===")
for var in REQUIRED_VARS:
    val = os.getenv(var, "").strip()
    check(var, bool(val), "set" if val else "MISSING — add it to .env")
for var in OPTIONAL_VARS:
    val = os.getenv(var, "").strip()
    print(f"{PASS if val else WARN} {var} — {'set' if val else 'not set (optional)'}")

token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
claude_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
script_url = os.getenv("APPS_SCRIPT_URL", "").strip()

# ---- 2. Telegram ----
print("\n=== 2. Telegram bot token ===")
if token:
    try:
        status, body = http_json(f"https://api.telegram.org/bot{token}/getMe")
        info = json.loads(body)
        ok = info.get("ok", False)
        username = info.get("result", {}).get("username", "?")
        check("Telegram getMe", ok, f"bot is @{username}" if ok else body[:200])
    except urllib.error.HTTPError as e:
        check("Telegram getMe", False,
              f"HTTP {e.code} — 401 means the token is wrong; re-copy it from @BotFather")
    except Exception as e:
        check("Telegram getMe", False, str(e))
else:
    check("Telegram getMe", False, "skipped — TELEGRAM_BOT_TOKEN missing")

# ---- 3. Claude ----
print("\n=== 3. Claude API key ===")
if claude_key:
    try:
        status, body = http_json(
            "https://api.anthropic.com/v1/messages",
            method="POST",
            headers={"x-api-key": claude_key, "anthropic-version": "2023-06-01"},
            body={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "ping"}],
            },
        )
        check("Claude API", status == 200, "key accepted")
    except urllib.error.HTTPError as e:
        detail = {
            401: "invalid API key — regenerate at console.anthropic.com",
            400: "key OK but request rejected (model name may have changed)",
            429: "key OK but rate-limited / out of credits — check your plan",
        }.get(e.code, f"HTTP {e.code}: {e.read().decode()[:200]}")
        # 400/429 still prove the key authenticates
        check("Claude API", e.code in (400, 429), detail)
    except Exception as e:
        check("Claude API", False, str(e))
else:
    check("Claude API", False, "skipped — ANTHROPIC_API_KEY missing")

# ---- 4. Gemini ----
print("\n=== 4. Gemini API key ===")
if gemini_key:
    try:
        status, body = http_json(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": gemini_key},
        )
        n = len(json.loads(body).get("models", []))
        check("Gemini API", status == 200, f"key accepted ({n} models visible)")
    except urllib.error.HTTPError as e:
        check("Gemini API", False,
              f"HTTP {e.code} — 400/403 means bad key or the Generative Language "
              f"API is not enabled for the key's project")
    except Exception as e:
        check("Gemini API", False, str(e))
else:
    check("Gemini API", False, "skipped — GEMINI_API_KEY missing")

# ---- 5. Apps Script ----
print("\n=== 5. Google Apps Script web app ===")
if script_url:
    if "/dev" in script_url:
        print(f"{WARN} URL ends in /dev — this only works for you while logged in. "
              f"Use the /exec URL from Deploy -> Manage deployments.")
    try:
        status, body = http_json(script_url, timeout=30)
        # Apps Script returns 200 with content, or an HTML login page if
        # access is not set to "Anyone".
        is_login_wall = "accounts.google.com" in body or "ServiceLogin" in body
        check("Apps Script GET", status == 200 and not is_login_wall,
              "login page returned — redeploy with 'Who has access: Anyone'"
              if is_login_wall else f"HTTP {status}, {len(body)} bytes")
    except urllib.error.HTTPError as e:
        check("Apps Script GET", False,
              f"HTTP {e.code} — 404 means wrong URL or deployment was archived; "
              f"redeploy and copy the new /exec URL")
    except Exception as e:
        check("Apps Script GET", False, str(e))
else:
    check("Apps Script GET", False, "skipped — APPS_SCRIPT_URL missing")

# ---- Summary ----
print("\n=== Summary ===")
if failures:
    print(f"{FAIL} {len(failures)} check(s) failed: {', '.join(failures)}")
    sys.exit(1)
print(f"{PASS} All checks passed — safe to run: python telegram_bot_system.py")
sys.exit(0)

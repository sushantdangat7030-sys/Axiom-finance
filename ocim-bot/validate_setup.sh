#!/bin/bash
# OCIM Bot Setup Validator
# Run this from ocim-bot/ to verify every part of your setup at once.
# Usage: bash validate_setup.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

check_pass() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((PASS_COUNT++))
}

check_fail() {
    echo -e "${RED}[✗]${NC} $1"
    ((FAIL_COUNT++))
}

check_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

section() {
    echo ""
    echo -e "${BLUE}=== $1 ===${NC}"
}

# ============================================================
section "1. File Structure"

if [ -f ".env.example" ]; then
    check_pass ".env.example exists"
else
    check_fail ".env.example missing"
fi

if [ -f ".env" ]; then
    check_pass ".env exists"
else
    check_fail ".env file missing (required — copy from .env.example)"
fi

if [ -f "telegram_bot_system.py" ]; then
    check_pass "telegram_bot_system.py exists"
else
    check_fail "telegram_bot_system.py missing"
fi

if [ -f "google_apps_script_backend.gs" ]; then
    check_pass "google_apps_script_backend.gs exists"
else
    check_fail "google_apps_script_backend.gs missing"
fi

if [ -f "requirements.txt" ]; then
    check_pass "requirements.txt exists"
else
    check_fail "requirements.txt missing"
fi

if [ -f "*.xlsx" ] 2>/dev/null || [ -f "Chemical_Inventory"* ] 2>/dev/null; then
    check_pass "Excel template exists"
else
    check_warn "Excel template not found (optional for runtime)"
fi

# ============================================================
section "2. Python Environment"

if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    check_pass "Python 3 installed: $PYTHON_VERSION"
else
    check_fail "Python 3 not found"
fi

if [ -d ".venv" ]; then
    check_pass "Virtual environment (.venv) exists"
else
    check_fail ".venv not found (run: python3 -m venv .venv)"
fi

if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
    check_pass "Virtual environment activated"

    # Check installed packages
    if python -c "import telegram" 2>/dev/null; then
        check_pass "python-telegram-bot installed"
    else
        check_fail "python-telegram-bot not installed (run: pip install -r requirements.txt)"
    fi

    if python -c "import anthropic" 2>/dev/null; then
        check_pass "anthropic installed"
    else
        check_fail "anthropic not installed"
    fi

    if python -c "import requests" 2>/dev/null; then
        check_pass "requests installed"
    else
        check_fail "requests not installed"
    fi

    if python -c "from dotenv import load_dotenv" 2>/dev/null; then
        check_pass "python-dotenv installed"
    else
        check_warn "python-dotenv not installed (optional but recommended)"
    fi
else
    check_fail ".venv/bin/activate not found"
fi

# ============================================================
section "3. Environment Variables"

if [ ! -f ".env" ]; then
    check_fail ".env not found — skipping variable checks"
else
    source .env 2>/dev/null || true

    check_var() {
        if [ -n "${!1}" ]; then
            check_pass "$1 is set"
        else
            check_fail "$1 is missing"
        fi
    }

    check_var "TELEGRAM_BOT_TOKEN"
    check_var "ANTHROPIC_API_KEY"
    check_var "GEMINI_API_KEY"
    check_var "APPS_SCRIPT_URL"
    check_var "GOOGLE_SHEET_ID"

    if [ -z "$ALLOWED_USER_IDS" ]; then
        check_warn "ALLOWED_USER_IDS not set (optional)"
    else
        check_pass "ALLOWED_USER_IDS is set"
    fi
fi

# ============================================================
section "4. Code Syntax Check"

if [ -f "telegram_bot_system.py" ]; then
    if python3 -m py_compile telegram_bot_system.py 2>/dev/null; then
        check_pass "telegram_bot_system.py has valid Python syntax"
    else
        check_fail "telegram_bot_system.py has syntax errors"
    fi
fi

if [ -f "requirements.txt" ]; then
    # Check that requirements.txt is not empty
    if [ -s "requirements.txt" ]; then
        check_pass "requirements.txt is not empty"
    else
        check_fail "requirements.txt is empty"
    fi
fi

# ============================================================
section "5. Git Configuration"

if git rev-parse --git-dir > /dev/null 2>&1; then
    check_pass "Git repository detected"

    # Check if .env is in .gitignore
    if grep -q "^\.env" .gitignore 2>/dev/null; then
        check_pass ".env is in .gitignore (secrets protected)"
    else
        check_fail ".env is NOT in .gitignore (risk: secrets in git history)"
    fi

    # Check if .env was ever committed
    if git log --all --full-history -- .env 2>/dev/null | grep -q "commit"; then
        check_fail ".env was previously committed (rotate all keys)"
    else
        check_pass ".env has never been committed"
    fi
else
    check_warn "Not in a git repository"
fi

# ============================================================
section "6. External API Connectivity (requires .env)"

if [ ! -f ".env" ]; then
    check_warn "Skipping API tests (no .env file)"
else
    source .env 2>/dev/null || true

    # Telegram
    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        TELEGRAM_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe")
        if [ "$TELEGRAM_RESPONSE" = "200" ]; then
            check_pass "Telegram bot token is valid (HTTP 200)"
        else
            check_fail "Telegram token test failed (HTTP $TELEGRAM_RESPONSE)"
        fi
    fi

    # Claude
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        CLAUDE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "https://api.anthropic.com/v1/messages" \
            -H "x-api-key: $ANTHROPIC_API_KEY" \
            -H "anthropic-version: 2023-06-01" \
            -H "content-type: application/json" \
            -d '{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}')
        if [ "$CLAUDE_RESPONSE" = "200" ] || [ "$CLAUDE_RESPONSE" = "400" ]; then
            check_pass "Claude API key is valid (authenticates)"
        else
            check_fail "Claude API test failed (HTTP $CLAUDE_RESPONSE)"
        fi
    fi

    # Gemini
    if [ -n "$GEMINI_API_KEY" ]; then
        GEMINI_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}")
        if [ "$GEMINI_RESPONSE" = "200" ]; then
            check_pass "Gemini API key is valid (HTTP 200)"
        else
            check_fail "Gemini API test failed (HTTP $GEMINI_RESPONSE)"
        fi
    fi

    # Apps Script
    if [ -n "$APPS_SCRIPT_URL" ]; then
        SCRIPT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$APPS_SCRIPT_URL")
        if [ "$SCRIPT_RESPONSE" = "200" ]; then
            check_pass "Apps Script URL is reachable (HTTP 200)"
        else
            check_fail "Apps Script URL test failed (HTTP $SCRIPT_RESPONSE)"
        fi
    fi
fi

# ============================================================
section "7. Preflight Check"

if [ -f "preflight_check.py" ]; then
    if python preflight_check.py > /dev/null 2>&1; then
        check_pass "preflight_check.py passes"
    else
        check_warn "preflight_check.py has failures (run 'python preflight_check.py' for details)"
    fi
else
    check_fail "preflight_check.py not found"
fi

# ============================================================
section "Summary"

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All $PASS_COUNT checks passed!${NC}"
    echo -e "Ready to run: ${BLUE}python telegram_bot_system.py${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAIL_COUNT of $TOTAL checks failed${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review the [✗] items above"
    echo "  2. Follow the fix steps for each failure"
    echo "  3. Run this script again to re-check: bash validate_setup.sh"
    exit 1
fi

# Axiom Finance

A free, self-contained personal finance web app — **Splitwise + Monarch Money** in one,
built as a static site with zero dependencies.

**Live app:** https://sushantdangat7030-sys.github.io/Axiom-finance/

## Features

**Split (like Splitwise)**
- Friends and groups (trips, flatmates, …)
- Expenses split equally, by exact amounts, percentages, or shares
- Per-person balances, simplified "who pays whom" settlement suggestions
- Record settlements

**Money (like Monarch)**
- Accounts (bank, cash, credit, investment, loan) with automatic balances
- Transactions with categories, search and filters
- Monthly budgets with progress and overspend warnings
- Dashboard: net worth, monthly spend/income, spending by category, 6-month trend

**General**
- 100% free and private: all data stays in your browser (localStorage)
- Export / import JSON backups (use this to move between devices)
- Light/dark theme, mobile friendly, installable (Add to Home Screen)
- Multi-currency display (INR, USD, EUR, …)

## Development

No build step. Serve the `web/` folder statically:

```sh
cd web && python3 -m http.server 8000
```

Deployment is automatic: pushes to the deploy branch publish `web/` to GitHub Pages
via `.github/workflows/deploy-pages.yml`.

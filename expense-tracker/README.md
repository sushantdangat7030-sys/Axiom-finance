# Expense Tracker

A personal expense tracking web app. Add income/expense transactions, filter by
date range, and see monthly totals at a glance.

## Tech Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark mode support)
- Prisma ORM + SQLite (dev)
- Recharts for the category breakdown chart

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Data Model

`Transaction`: `id`, `type` (`income` | `expense`), `amount`, `category`
(Food, Rent, Travel, Bills, Shopping, Other), `date`, `note`.

## Features

- Add, edit, and delete transactions
- Filter transactions by date range (defaults to the current month)
- Summary cards for total income, total expense, and net savings
- Category breakdown chart for expenses
- Dark mode toggle

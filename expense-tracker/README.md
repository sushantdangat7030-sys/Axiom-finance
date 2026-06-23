# Expense Tracker

A personal expense tracking web app with per-user accounts. Sign up, add
income/expense transactions, filter by date range, and see monthly totals at
a glance.

## Tech Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark mode support)
- Prisma ORM + SQLite (dev)
- Recharts for the category breakdown chart
- Cookie-based sessions (JWT via `jose`) + `bcryptjs` for password hashing

## Getting Started

```bash
npm install
cp .env.example .env   # set a real SESSION_SECRET
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app. You'll be
redirected to `/signup` until you create an account.

## Data Model

`User`: `id`, `email`, `passwordHash`.

`Transaction`: `id`, `userId`, `type` (`income` | `expense`), `amount`,
`category` (Food, Rent, Travel, Bills, Shopping, Other), `date`, `note`.

## Features

- Sign up, log in, log out; each user only sees their own transactions
- Add, edit, and delete transactions
- Filter transactions by date range (defaults to the current month)
- Summary cards for total income, total expense, and net savings
- Category breakdown chart for expenses
- Dark mode toggle

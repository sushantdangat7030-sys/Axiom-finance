# Expense Tracker App

## Goal
Build a personal expense tracking web app.

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite (dev) / Postgres (prod)
- Recharts for graphs

## Features
- Authentication (sign up / log in / log out), each user only sees their own data
- Add income/expense transactions
- Categories (Food, Rent, Travel, Bills, Shopping, Other)
- Monthly summary dashboard
- Filter by date range
- Edit/Delete transactions
- Simple analytics cards:
  - Total income
  - Total expense
  - Net savings

## UI Rules
- Clean finance dashboard style
- Mobile-first design
- Dark mode support

## Data Model
User:
- id
- email
- passwordHash

Transaction:
- id
- userId
- type (income/expense)
- amount
- category
- date
- note

## Coding Rules
- Use functional React components
- Keep components small and reusable
- Use server actions where possible
- No inline CSS

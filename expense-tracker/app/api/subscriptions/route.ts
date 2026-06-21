import { NextResponse } from "next/server";

import { pool } from "@/lib/db";

export async function GET() {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS category_name
     FROM subscriptions s
     LEFT JOIN categories c ON c.id = s.category_id
     ORDER BY s.status ASC, s.amount DESC`
  );
  return NextResponse.json({ subscriptions: rows });
}

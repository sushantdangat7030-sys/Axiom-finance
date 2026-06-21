import { NextResponse } from "next/server";

import { pool } from "@/lib/db";

const VALID_STATUSES = ["active", "flagged_for_cancellation", "cancelled"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await request.json();

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { rows } = await pool.query(
    "UPDATE subscriptions SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
    [status, id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ subscription: rows[0] });
}

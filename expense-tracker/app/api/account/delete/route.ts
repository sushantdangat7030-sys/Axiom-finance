import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { handle } from "@/lib/api";

/** POST — GDPR-style full deletion: storage files, all rows (CASCADE), auth user. */
export const POST = handle(async () => {
  const { user } = await requireUser();
  const admin = supabaseAdmin();

  const { data: files } = await admin.storage.from("attachments").list(user.id, { limit: 1000 });
  if (files?.length)
    await admin.storage.from("attachments").remove(files.map((f) => `${user.id}/${f.name}`));

  // rows cascade from auth.users deletion (all tables FK → auth.users on delete cascade)
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

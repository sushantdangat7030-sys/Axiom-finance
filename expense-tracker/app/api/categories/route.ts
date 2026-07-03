import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/api";

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("categories")
    .select("id,name,emoji,is_income").order("name");
  if (error) throw error;
  return NextResponse.json({ categories: data });
});

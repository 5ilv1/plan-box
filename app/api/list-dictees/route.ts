import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dictees")
    .select("id, titre, theme, dictee_parent_id, batch_id, niveau_etoiles")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

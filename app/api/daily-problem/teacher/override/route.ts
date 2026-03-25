import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const { data: classes } = await admin.from("classe").select("id").eq("user_id", user.id).limit(1);
  if (!classes || classes.length === 0) {
    return NextResponse.json({ error: "Accès réservé aux enseignants" }, { status: 403 });
  }

  const { date, niveau, problem_id } = await req.json();
  if (!date || !niveau || !problem_id) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const { error } = await admin.from("daily_problems").upsert(
    { date, niveau, problem_id },
    { onConflict: "date,niveau" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

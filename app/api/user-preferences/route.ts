import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

/* GET /api/user-preferences */
export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("user_preferences")
    .select("nav_order")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ nav_order: data?.nav_order ?? null });
}

/* PUT /api/user-preferences */
export async function PUT(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const navOrder = body.nav_order;

  if (!Array.isArray(navOrder)) {
    return NextResponse.json({ error: "nav_order doit être un tableau" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_preferences")
    .upsert(
      { user_id: user.id, nav_order: navOrder, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[user-preferences PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

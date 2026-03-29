import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// PATCH /api/admin/parametres/zone
// Body: { zone: "A" | "B" | "C" }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { zone } = body ?? {};

  if (!zone || !["A", "B", "C"].includes(zone)) {
    return NextResponse.json({ erreur: "zone doit être A, B ou C" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Mono-enseignant : on met à jour la première entrée (ou toutes)
  const { error } = await admin
    .from("enseignant")
    .update({ zone_scolaire: zone });

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

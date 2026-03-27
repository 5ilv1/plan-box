import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

// DELETE /api/admin/supprimer-bloc-planning
// Body : { type, titre, date }
// Supprime tous les plan_travail correspondant à ce bloc (tous les élèves)
export async function DELETE(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });

  const { type, titre, date } = await req.json();
  if (!type || !titre || !date) {
    return NextResponse.json({ erreur: "Paramètres manquants (type, titre, date)" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("plan_travail")
    .delete({ count: "exact" })
    .eq("type", type)
    .eq("titre", titre)
    .eq("date_assignation", date);

  if (error) {
    console.error("[supprimer-bloc-planning]", error);
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, supprimés: count ?? 0 });
}

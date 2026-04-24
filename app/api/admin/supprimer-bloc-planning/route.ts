import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

// DELETE /api/admin/supprimer-bloc-planning
// Body : { type, titre, date }
// Supprime tous les plan_travail correspondant à ce bloc (tous les élèves)
export async function DELETE(req: Request) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json();
  const { type, titre, date, groupe_label } = body;
  if (!type || !titre || !date) {
    return NextResponse.json({ erreur: "Paramètres manquants (type, titre, date)" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("plan_travail")
    .delete({ count: "exact" })
    .eq("type", type)
    .eq("titre", titre)
    .eq("date_assignation", date);

  if ("groupe_label" in body) {
    query = groupe_label === null
      ? query.is("groupe_label", null)
      : query.eq("groupe_label", groupe_label);
  }

  const { error, count } = await query;

  if (error) {
    console.error("[supprimer-bloc-planning]", error);
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, supprimés: count ?? 0 });
}

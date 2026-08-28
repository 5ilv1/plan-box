import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

// PATCH /api/fichier-maths-bloc
// Déplacer un bloc fichier_maths d'une date à une autre
// Body: { date: string, groupe: string, page: number, nouvelleDate: string }
export async function PATCH(req: NextRequest) {
  // Réservé à l'enseignant : cette méthode modifie ou supprime du contenu.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe, nouvelleDate, eval: isEval } = body as {
    date: string;
    groupe?: string;
    nouvelleDate: string;
    eval?: boolean;
  };

  if (!date || !nouvelleDate || !groupe) {
    return NextResponse.json({ erreur: "Champs requis: date, groupe, nouvelleDate" }, { status: 400 });
  }

  const admin = createAdminClient();

  let query = admin
    .from("plan_travail")
    .update({ date_assignation: nouvelleDate })
    .eq("type", "fichier_maths")
    .eq("date_assignation", date)
    .eq("groupe_label", groupe);

  if (isEval) {
    query = query.contains("contenu", { eval: true });
  }

  const { data, error } = await query.select("id");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, nb: data?.length ?? 0 });
}

// DELETE /api/fichier-maths-bloc
// Supprimer tous les blocs fichier_maths d'un (date, groupe, page)
// Body: { date: string, groupe: string }
export async function DELETE(req: NextRequest) {
  // Réservé à l'enseignant : cette méthode modifie ou supprime du contenu.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe, eval: isEval } = body as { date: string; groupe?: string; eval?: boolean };

  if (!date || !groupe) {
    return NextResponse.json({ erreur: "Champs requis: date, groupe" }, { status: 400 });
  }

  const admin = createAdminClient();

  let query = admin
    .from("plan_travail")
    .delete()
    .eq("type", "fichier_maths")
    .eq("date_assignation", date)
    .eq("groupe_label", groupe);

  if (isEval) {
    query = query.contains("contenu", { eval: true });
  }

  const { data, error } = await query.select("id");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, nb: data?.length ?? 0 });
}

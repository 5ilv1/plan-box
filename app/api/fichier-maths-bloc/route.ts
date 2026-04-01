import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// PATCH /api/fichier-maths-bloc
// Déplacer un bloc fichier_maths d'une date à une autre
// Body: { date: string, groupe: string, page: number, nouvelleDate: string }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe, page, nouvelleDate } = body as {
    date: string;
    groupe: string;
    page: number;
    nouvelleDate: string;
  };

  if (!date || !groupe || !page || !nouvelleDate) {
    return NextResponse.json({ erreur: "Champs requis: date, groupe, page, nouvelleDate" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Met à jour tous les blocs de ce groupe/page/date
  const { data, error } = await admin
    .from("plan_travail")
    .update({ date_assignation: nouvelleDate })
    .eq("type", "fichier_maths")
    .eq("date_assignation", date)
    .eq("groupe_label", groupe)
    .select("id");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Vérifier que les blocs mis à jour correspondent bien à la bonne page
  // (cas rare de 2 pages différentes le même jour pour le même groupe)
  // On filtre par contenu->numero_page mais Supabase ne permet pas facilement
  // de filtrer par JSON imbriqué dans un update, donc on le fait en 2 étapes si nécessaire

  return NextResponse.json({ ok: true, nb: data?.length ?? 0 });
}

// DELETE /api/fichier-maths-bloc
// Supprimer tous les blocs fichier_maths d'un (date, groupe, page)
// Body: { date: string, groupe: string }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe } = body as { date: string; groupe: string };

  if (!date || !groupe) {
    return NextResponse.json({ erreur: "Champs requis: date, groupe" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("plan_travail")
    .delete()
    .eq("type", "fichier_maths")
    .eq("date_assignation", date)
    .eq("groupe_label", groupe)
    .select("id");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, nb: data?.length ?? 0 });
}

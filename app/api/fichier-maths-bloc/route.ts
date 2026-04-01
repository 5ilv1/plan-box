import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// PATCH /api/fichier-maths-bloc
// Déplacer un bloc fichier_maths d'une date à une autre
// Body: { date: string, groupe: string, page: number, nouvelleDate: string }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe, page, nouvelleDate, eval: isEval } = body as {
    date: string;
    groupe?: string;
    page?: number;
    nouvelleDate: string;
    eval?: boolean;
  };

  if (!date || !nouvelleDate) {
    return NextResponse.json({ erreur: "Champs requis: date, nouvelleDate" }, { status: 400 });
  }

  const admin = createAdminClient();

  let query = admin
    .from("plan_travail")
    .update({ date_assignation: nouvelleDate })
    .eq("type", "fichier_maths")
    .eq("date_assignation", date);

  if (isEval) {
    query = query.is("groupe_label", null);
  } else {
    if (!groupe) return NextResponse.json({ erreur: "Champ requis: groupe (ou eval: true)" }, { status: 400 });
    query = query.eq("groupe_label", groupe);
  }

  const { data, error } = await query.select("id");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, nb: data?.length ?? 0 });
}

// DELETE /api/fichier-maths-bloc
// Supprimer tous les blocs fichier_maths d'un (date, groupe, page)
// Body: { date: string, groupe: string }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe, eval: isEval } = body as { date: string; groupe?: string; eval?: boolean };

  if (!date) {
    return NextResponse.json({ erreur: "Champ requis: date" }, { status: 400 });
  }

  const admin = createAdminClient();

  let query = admin
    .from("plan_travail")
    .delete()
    .eq("type", "fichier_maths")
    .eq("date_assignation", date);

  if (isEval) {
    // Supprimer l'évaluation (pas de groupe, contenu->eval = true)
    query = query.is("groupe_label", null);
  } else {
    if (!groupe) return NextResponse.json({ erreur: "Champ requis: groupe (ou eval: true)" }, { status: 400 });
    query = query.eq("groupe_label", groupe);
  }

  const { data, error } = await query.select("id");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, nb: data?.length ?? 0 });
}

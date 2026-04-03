import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/chapitres/exercices/resultat
 * Enregistre un résultat d'exercice.
 * Body: { exercice_id, eleve_id?, rb_eleve_id?, score, total }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { exercice_id, eleve_id, rb_eleve_id, score, total } = body;

  if (!exercice_id || score === undefined || total === undefined) {
    return NextResponse.json({ error: "exercice_id, score et total requis" }, { status: 400 });
  }

  if (!eleve_id && !rb_eleve_id) {
    return NextResponse.json({ error: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Lire le seuil de validation de l'exercice depuis le chapitre
  let seuilExercice = 0.9; // 90% par défaut
  const { data: exoData } = await admin
    .from("exercice")
    .select("chapitre_id, chapitres(seuil_exercice)")
    .eq("id", exercice_id)
    .single();

  if (exoData?.chapitres) {
    const seuil = (exoData.chapitres as unknown as { seuil_exercice: number | null }).seuil_exercice;
    if (seuil != null) seuilExercice = seuil / 100;
  }

  const valide = total > 0 && (score / total) >= seuilExercice;

  const { data, error } = await admin
    .from("exercice_resultat")
    .insert({
      exercice_id,
      eleve_id: eleve_id || null,
      rb_eleve_id: rb_eleve_id ? Number(rb_eleve_id) : null,
      score,
      total,
      valide,
    })
    .select()
    .single();

  if (error) {
    console.error("[resultat POST]", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }

  return NextResponse.json({ valide, score, total });
}

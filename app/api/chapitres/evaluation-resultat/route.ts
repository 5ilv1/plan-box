import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/chapitres/evaluation-resultat
 * Sauvegarde le résultat d'une évaluation finale.
 * Body: { chapitre_id, eleve_id?, rb_eleve_id?, score, total, exercices_echoues? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { chapitre_id, eleve_id, rb_eleve_id, score, total, exercices_echoues } = body;

  if (!chapitre_id || score == null || total == null) {
    return NextResponse.json({ error: "chapitre_id, score et total requis" }, { status: 400 });
  }
  if (!eleve_id && !rb_eleve_id) {
    return NextResponse.json({ error: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }

  const pourcentage = total > 0 ? Math.round((score / total) * 100) : 0;

  // Lire le seuil du chapitre
  const admin = createAdminClient();
  const { data: chapitre } = await admin
    .from("chapitres")
    .select("seuil_evaluation")
    .eq("id", chapitre_id)
    .single();

  const seuil = chapitre?.seuil_evaluation ?? 90;
  const reussi = pourcentage >= seuil;

  const { data, error } = await admin
    .from("evaluation_resultat")
    .insert({
      chapitre_id,
      eleve_id: eleve_id || null,
      rb_eleve_id: rb_eleve_id || null,
      score,
      total,
      pourcentage,
      reussi,
      exercices_echoues: exercices_echoues ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error("[evaluation-resultat POST]", error);
    return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
  }

  return NextResponse.json({ resultat: data, reussi, pourcentage });
}

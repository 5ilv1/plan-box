import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/chapitres/exercices/marquer-lu
 * Marque un bloc révision comme lu (insère un résultat 1/1 valide).
 * Body: { exercice_id, eleve_id?, rb_eleve_id? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { exercice_id, eleve_id, rb_eleve_id } = body;

  if (!exercice_id) {
    return NextResponse.json({ error: "exercice_id requis" }, { status: 400 });
  }
  if (!eleve_id && !rb_eleve_id) {
    return NextResponse.json({ error: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérifier que c'est bien un bloc de type revision
  const { data: exo } = await admin
    .from("exercice")
    .select("type")
    .eq("id", exercice_id)
    .single();

  if (!exo || exo.type !== "revision") {
    return NextResponse.json({ error: "Ce n'est pas un bloc révision" }, { status: 400 });
  }

  // Vérifier si déjà marqué comme lu
  let checkQuery = admin
    .from("exercice_resultat")
    .select("id")
    .eq("exercice_id", exercice_id);

  if (eleve_id) {
    checkQuery = checkQuery.eq("eleve_id", eleve_id);
  } else {
    checkQuery = checkQuery.eq("rb_eleve_id", Number(rb_eleve_id));
  }

  const { data: existant } = await checkQuery.limit(1);

  if (existant && existant.length > 0) {
    // Déjà lu
    return NextResponse.json({ valide: true, deja_lu: true });
  }

  // Insérer un résultat 1/1 validé
  const { error } = await admin
    .from("exercice_resultat")
    .insert({
      exercice_id,
      eleve_id: eleve_id || null,
      rb_eleve_id: rb_eleve_id ? Number(rb_eleve_id) : null,
      score: 1,
      total: 1,
      valide: true,
    });

  if (error) {
    console.error("[marquer-lu POST]", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }

  return NextResponse.json({ valide: true, deja_lu: false });
}

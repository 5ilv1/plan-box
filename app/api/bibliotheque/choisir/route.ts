import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/bibliotheque/choisir
 * Body: { chapitre_id, eleve_id | rb_eleve_id }
 *
 * Enregistre le choix du livre par l'élève.
 * Refuse si un autre livre est déjà en cours (éval finale non validée).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { chapitre_id, eleve_id, rb_eleve_id } = body ?? {};

  if (!chapitre_id) {
    return NextResponse.json({ error: "chapitre_id requis" }, { status: 400 });
  }
  if (!eleve_id && !rb_eleve_id) {
    return NextResponse.json({ error: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérifier que le chapitre existe et est disponible
  const { data: chap } = await admin
    .from("chapitres")
    .select("id, disponible_bibliotheque")
    .eq("id", chapitre_id)
    .maybeSingle();
  if (!chap) {
    return NextResponse.json({ error: "Livre introuvable" }, { status: 404 });
  }
  if (chap.disponible_bibliotheque !== true) {
    return NextResponse.json({ error: "Livre non disponible" }, { status: 403 });
  }

  // Vérifier qu'aucun livre en cours
  let choixQuery = admin.from("eleve_bibliotheque_choix").select("chapitre_id");
  if (eleve_id) choixQuery = choixQuery.eq("eleve_id", eleve_id);
  else choixQuery = choixQuery.eq("rb_eleve_id", rb_eleve_id);
  const { data: choix } = await choixQuery;

  if (choix?.length) {
    let evalQuery = admin.from("evaluation_resultat").select("chapitre_id, reussi");
    if (eleve_id) evalQuery = evalQuery.eq("eleve_id", eleve_id);
    else evalQuery = evalQuery.eq("rb_eleve_id", rb_eleve_id);
    const { data: evals } = await evalQuery;
    const valides = new Set((evals ?? []).filter((e) => e.reussi).map((e) => e.chapitre_id));
    const enCours = choix.find((c) => !valides.has(c.chapitre_id));
    if (enCours && enCours.chapitre_id !== chapitre_id) {
      return NextResponse.json(
        { error: "Un livre est déjà en cours. Termine l'évaluation finale avant d'en choisir un autre." },
        { status: 409 }
      );
    }
  }

  // Insérer le choix (idempotent via index unique)
  const { error } = await admin.from("eleve_bibliotheque_choix").insert({
    chapitre_id,
    eleve_id: eleve_id ?? null,
    rb_eleve_id: rb_eleve_id ?? null,
  });

  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

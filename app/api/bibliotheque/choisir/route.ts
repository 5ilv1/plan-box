import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { exosParLivre, livreTermine } from "@/lib/livre-termine";

/**
 * POST /api/bibliotheque/choisir
 * Body: { chapitre_id, eleve_id | rb_eleve_id }
 *
 * Enregistre le choix du livre par l'élève.
 * Refuse si un autre livre est déjà en cours (lib/livre-termine.ts : son évaluation
 * finale n'a pas encore été passée).
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
    const chapIds = choix.map((c) => c.chapitre_id);

    // Évaluations passées, réussies ou non (lib/livre-termine.ts).
    let evalQuery = admin.from("evaluation_resultat").select("chapitre_id");
    if (eleve_id) evalQuery = evalQuery.eq("eleve_id", eleve_id);
    else evalQuery = evalQuery.eq("rb_eleve_id", rb_eleve_id);
    const { data: evals } = await evalQuery;

    const { data: exoData } = await admin
      .from("exercice")
      .select("id, chapitre_id, contenu")
      .in("chapitre_id", chapIds);

    const allExoIds = (exoData ?? []).map((e) => e.id);
    let resultats: { exercice_id: string; valide: boolean }[] = [];
    if (allExoIds.length > 0) {
      let resQuery = admin.from("exercice_resultat").select("exercice_id, valide");
      if (eleve_id) resQuery = resQuery.eq("eleve_id", eleve_id);
      else resQuery = resQuery.eq("rb_eleve_id", rb_eleve_id);
      const { data } = await resQuery.in("exercice_id", allExoIds);
      resultats = data ?? [];
    }

    const traces = {
      evalsPassees: new Set((evals ?? []).map((e) => e.chapitre_id)),
      exosParChap: exosParLivre(exoData ?? []),
      exosFaits: new Set(resultats.map((r) => r.exercice_id)),
      exosValides: new Set(resultats.filter((r) => r.valide).map((r) => r.exercice_id)),
    };
    const enCours = choix.find((c) => !livreTermine(c.chapitre_id, traces));
    if (enCours && enCours.chapitre_id !== chapitre_id) {
      return NextResponse.json(
        { error: "Un livre est déjà en cours. Termine-le avant d'en choisir un autre." },
        { status: 409 },
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

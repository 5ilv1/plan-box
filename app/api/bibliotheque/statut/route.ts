import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/bibliotheque/statut?eleve_id=UUID ou ?rb_id=NUMBER
 * Retourne l'état de lecture de l'élève :
 *  - livre_en_cours : { chapitre_id, titre, couverture_url, pourcentage } si en cours
 *  - peut_choisir   : true si aucun livre en cours (ou dernier validé)
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ error: "eleve_id ou rb_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Livres choisis par l'élève (historique)
  let choixQuery = admin
    .from("eleve_bibliotheque_choix")
    .select("chapitre_id, choisi_le")
    .order("choisi_le", { ascending: false });
  if (eleveId) choixQuery = choixQuery.eq("eleve_id", eleveId);
  else choixQuery = choixQuery.eq("rb_eleve_id", parseInt(rbId!, 10));

  const { data: choix } = await choixQuery;
  if (!choix?.length) {
    return NextResponse.json({ peut_choisir: true, livre_en_cours: null });
  }

  const chapIds = choix.map((c) => c.chapitre_id);

  // Évaluations finales réussies par l'élève
  let evalQuery = admin.from("evaluation_resultat").select("chapitre_id, reussi");
  if (eleveId) evalQuery = evalQuery.eq("eleve_id", eleveId);
  else evalQuery = evalQuery.eq("rb_eleve_id", parseInt(rbId!, 10));
  const { data: evals } = await evalQuery;
  const chapitresValides = new Set(
    (evals ?? []).filter((e) => e.reussi).map((e) => e.chapitre_id)
  );

  // Livre en cours = choisi mais éval finale pas encore validée
  const enCoursId = choix.find((c) => !chapitresValides.has(c.chapitre_id))?.chapitre_id;

  if (!enCoursId) {
    return NextResponse.json({ peut_choisir: true, livre_en_cours: null });
  }

  // Détails du livre en cours + progression
  const { data: ch } = await admin
    .from("chapitres")
    .select("id, titre, couverture_url, auteur")
    .eq("id", enCoursId)
    .maybeSingle();

  const { data: exercices } = await admin
    .from("exercice")
    .select("id, contenu")
    .eq("chapitre_id", enCoursId);

  const exosNonEval = (exercices ?? []).filter(
    (e) => (e.contenu as Record<string, unknown>)?.est_evaluation_finale !== true
  );
  const exoEvalFinal = (exercices ?? []).find(
    (e) => (e.contenu as Record<string, unknown>)?.est_evaluation_finale === true
  );

  const exosIds = exosNonEval.map((e) => e.id);
  let resQuery = admin.from("exercice_resultat").select("exercice_id, valide");
  if (eleveId) resQuery = resQuery.eq("eleve_id", eleveId);
  else resQuery = resQuery.eq("rb_eleve_id", parseInt(rbId!, 10));
  const { data: resultats } = await resQuery.in("exercice_id", exosIds.length > 0 ? exosIds : ["00000000-0000-0000-0000-000000000000"]);

  const valides = new Set(
    (resultats ?? []).filter((r) => r.valide).map((r) => r.exercice_id)
  );
  const nbValides = exosIds.filter((id) => valides.has(id)).length;
  const pourcentage = exosIds.length > 0 ? Math.round((nbValides / exosIds.length) * 100) : 0;

  return NextResponse.json({
    peut_choisir: false,
    livre_en_cours: {
      chapitre_id: enCoursId,
      titre: ch?.titre ?? "",
      auteur: (ch as Record<string, unknown>)?.auteur ?? null,
      couverture_url: (ch as Record<string, unknown>)?.couverture_url ?? null,
      nb_chapitres: exosNonEval.length,
      nb_valides: nbValides,
      pourcentage,
      eval_finale_id: exoEvalFinal?.id ?? null,
      pret_pour_eval: nbValides === exosNonEval.length && exosNonEval.length > 0,
    },
  });
}

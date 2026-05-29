import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/bibliotheque/statut?eleve_id=UUID ou ?rb_id=NUMBER
 * Retourne l'état de lecture de l'élève :
 *  - livre_en_cours : { chapitre_id, titre, couverture_url, pourcentage } si en cours
 *  - peut_choisir   : true si aucun livre en cours (tous les livres choisis terminés)
 *
 * Un livre est considéré comme TERMINÉ si l'une de ces conditions est vraie :
 *   1. une évaluation finale réussie existe dans `evaluation_resultat` ;
 *   2. le livre possède un exercice marqué `est_evaluation_finale` ET cet
 *      exercice est validé dans `exercice_resultat` ;
 *   3. le livre n'a PAS d'exercice d'évaluation finale dédié (cas des livres
 *      « lecture » dont les questions tiennent lieu d'évaluation) ET tous ses
 *      exercices sont validés.
 * → dès qu'un livre est terminé, la bibliothèque se rouvre (peut_choisir = true).
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ error: "eleve_id ou rb_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const rb = rbId ? parseInt(rbId, 10) : null;

  // 1. Livres choisis par l'élève (historique, récent → ancien)
  let choixQuery = admin
    .from("eleve_bibliotheque_choix")
    .select("chapitre_id, choisi_le")
    .order("choisi_le", { ascending: false });
  choixQuery = eleveId ? choixQuery.eq("eleve_id", eleveId) : choixQuery.eq("rb_eleve_id", rb!);

  const { data: choix } = await choixQuery;
  if (!choix?.length) {
    return NextResponse.json({ peut_choisir: true, livre_en_cours: null });
  }

  const chapIds = [...new Set(choix.map((c) => c.chapitre_id))];

  // 2. Évaluations finales réussies (mécanisme `evaluation_resultat`)
  let evalQuery = admin.from("evaluation_resultat").select("chapitre_id, reussi");
  evalQuery = eleveId ? evalQuery.eq("eleve_id", eleveId) : evalQuery.eq("rb_eleve_id", rb!);
  const { data: evals } = await evalQuery;
  const validesParEval = new Set(
    (evals ?? []).filter((e) => e.reussi).map((e) => e.chapitre_id)
  );

  // 3. Tous les exercices des livres choisis (un seul appel), groupés par livre
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, chapitre_id, contenu")
    .in("chapitre_id", chapIds);

  type Exo = { id: string; estEval: boolean };
  const exosParChap = new Map<string, Exo[]>();
  for (const e of (exercices ?? []) as Array<{ id: string; chapitre_id: string; contenu: Record<string, unknown> | null }>) {
    const estEval = (e.contenu as Record<string, unknown>)?.est_evaluation_finale === true;
    if (!exosParChap.has(e.chapitre_id)) exosParChap.set(e.chapitre_id, []);
    exosParChap.get(e.chapitre_id)!.push({ id: e.id, estEval });
  }

  // 4. Résultats d'exercices validés de l'élève sur ces livres (un seul appel)
  const allExoIds = (exercices ?? []).map((e) => e.id);
  let resQuery = admin.from("exercice_resultat").select("exercice_id, valide");
  resQuery = eleveId ? resQuery.eq("eleve_id", eleveId) : resQuery.eq("rb_eleve_id", rb!);
  const { data: resultats } = await resQuery.in(
    "exercice_id",
    allExoIds.length > 0 ? allExoIds : ["00000000-0000-0000-0000-000000000000"]
  );
  const exoValides = new Set(
    (resultats ?? []).filter((r) => r.valide).map((r) => r.exercice_id)
  );

  // 5. Un livre est-il terminé ?
  const livreTermine = (chapId: string): boolean => {
    if (validesParEval.has(chapId)) return true; // (1) éval finale réussie
    const exos = exosParChap.get(chapId) ?? [];
    if (exos.length === 0) return false; // aucun exercice → on ne peut rien valider
    const evalFinale = exos.find((e) => e.estEval);
    if (evalFinale) return exoValides.has(evalFinale.id); // (2) éval finale dédiée validée
    return exos.every((e) => exoValides.has(e.id)); // (3) tous les exos validés
  };

  // 6. Livre en cours = premier choix non terminé
  const enCoursId = choix.find((c) => !livreTermine(c.chapitre_id))?.chapitre_id;
  if (!enCoursId) {
    return NextResponse.json({ peut_choisir: true, livre_en_cours: null });
  }

  // 7. Détails du livre en cours + progression (réutilise les données déjà chargées)
  const { data: ch } = await admin
    .from("chapitres")
    .select("id, titre, couverture_url, auteur")
    .eq("id", enCoursId)
    .maybeSingle();

  const exos = exosParChap.get(enCoursId) ?? [];
  const exosNonEval = exos.filter((e) => !e.estEval);
  const exoEvalFinal = exos.find((e) => e.estEval);
  const nbValides = exosNonEval.filter((e) => exoValides.has(e.id)).length;
  const pourcentage = exosNonEval.length > 0 ? Math.round((nbValides / exosNonEval.length) * 100) : 0;

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

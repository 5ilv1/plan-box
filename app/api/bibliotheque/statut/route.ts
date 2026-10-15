import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { exosParLivre, livreTermine as estTermine } from "@/lib/livre-termine";

/**
 * GET /api/bibliotheque/statut?eleve_id=UUID ou ?rb_id=NUMBER
 * Retourne l'état de lecture de l'élève :
 *  - livre_en_cours : { chapitre_id, titre, couverture_url, pourcentage } si en cours
 *  - peut_choisir   : true si aucun livre en cours (tous les livres choisis terminés)
 *
 * Un livre est TERMINÉ dès que son évaluation finale a été passée, quel que
 * soit le score — règle dans `lib/livre-termine.ts`.
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

  // 2. Évaluations finales passées — réussies ou non : le score ne retient
  //    pas l'élève dans un livre qu'il a fini (lib/livre-termine.ts).
  let evalQuery = admin.from("evaluation_resultat").select("chapitre_id");
  evalQuery = eleveId ? evalQuery.eq("eleve_id", eleveId) : evalQuery.eq("rb_eleve_id", rb!);
  const { data: evals } = await evalQuery;
  const evalsPassees = new Set((evals ?? []).map((e) => e.chapitre_id));

  // 3. Tous les exercices des livres choisis (un seul appel), groupés par livre
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, chapitre_id, contenu")
    .in("chapitre_id", chapIds);
  const exosParChap = exosParLivre(exercices ?? []);

  // 4. Résultats d'exercices de l'élève sur ces livres (un seul appel)
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
  const traces = {
    evalsPassees,
    exosParChap,
    exosFaits: new Set((resultats ?? []).map((r) => r.exercice_id)),
    exosValides: exoValides,
  };

  // 5. Un livre est-il terminé ?
  const livreTermine = (chapId: string): boolean => estTermine(chapId, traces);

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

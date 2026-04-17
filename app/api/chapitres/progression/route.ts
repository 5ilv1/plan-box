import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/chapitres/progression?chapitre_id=UUID&eleve_id=UUID
 *  ou ?chapitre_id=UUID&rb_eleve_id=NUMBER
 *
 * Retourne la progression d'un élève pour un chapitre :
 * liste des exercices avec meilleur score, statut validé, et si l'exercice est débloqué.
 */
export async function GET(req: NextRequest) {
  const chapitreId = req.nextUrl.searchParams.get("chapitre_id");
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbEleveId = req.nextUrl.searchParams.get("rb_eleve_id");

  if (!chapitreId) {
    return NextResponse.json({ error: "chapitre_id requis" }, { status: 400 });
  }
  if (!eleveId && !rbEleveId) {
    return NextResponse.json({ error: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Récupérer les exercices du chapitre, triés par ordre
  // (contenu inclus pour détecter les exercices "évaluation finale" lecture)
  const { data: exercices, error: errExo } = await admin
    .from("exercice")
    .select("id, ordre, titre, type, contenu")
    .eq("chapitre_id", chapitreId)
    .order("ordre", { ascending: true });

  if (errExo) {
    console.error("[progression GET] exercices:", errExo);
    return NextResponse.json({ error: "Erreur de lecture des exercices" }, { status: 500 });
  }

  if (!exercices || exercices.length === 0) {
    return NextResponse.json({ exercices: [] });
  }

  // Récupérer les résultats de l'élève pour ces exercices
  const exerciceIds = exercices.map((e) => e.id);
  let query = admin
    .from("exercice_resultat")
    .select("exercice_id, score, total, valide")
    .in("exercice_id", exerciceIds);

  if (eleveId) {
    query = query.eq("eleve_id", eleveId);
  } else {
    query = query.eq("rb_eleve_id", Number(rbEleveId));
  }

  const { data: resultats, error: errRes } = await query;

  if (errRes) {
    console.error("[progression GET] resultats:", errRes);
    return NextResponse.json({ error: "Erreur de lecture des résultats" }, { status: 500 });
  }

  // Calculer le meilleur résultat par exercice (priorise valide > score)
  const meilleurParExo: Record<string, { score: number; total: number; valide: boolean }> = {};
  for (const r of resultats || []) {
    const existant = meilleurParExo[r.exercice_id];
    if (!existant) {
      meilleurParExo[r.exercice_id] = { score: r.score, total: r.total, valide: r.valide };
    } else if (r.valide && !existant.valide) {
      // Un résultat validé l'emporte toujours sur un non-validé
      meilleurParExo[r.exercice_id] = { score: r.score, total: r.total, valide: r.valide };
    } else if (r.valide === existant.valide && r.score > existant.score) {
      // À validité égale, on prend le meilleur score
      meilleurParExo[r.exercice_id] = { score: r.score, total: r.total, valide: r.valide };
    }
  }

  // Construire la progression avec la logique de déblocage
  const progression = exercices.map((exo, index) => {
    const meilleur = meilleurParExo[exo.id];
    const valide = meilleur?.valide ?? false;

    // L'exercice N est débloqué si N=1 ou si l'exercice N-1 est validé
    let debloque = false;
    if (index === 0) {
      debloque = true;
    } else {
      const exoPrecedent = exercices[index - 1];
      const meilleurPrec = meilleurParExo[exoPrecedent.id];
      debloque = meilleurPrec?.valide ?? false;
    }

    const contenu = (exo as { contenu?: Record<string, unknown> }).contenu ?? {};
    const estEvalFinale = contenu.est_evaluation_finale === true;

    return {
      exercice_id: exo.id,
      ordre: exo.ordre,
      titre: exo.titre,
      type: exo.type,
      meilleur_score: meilleur?.score ?? null,
      total: meilleur?.total ?? null,
      valide,
      debloque,
      est_evaluation_finale: estEvalFinale,
    };
  });

  return NextResponse.json({ exercices: progression });
}

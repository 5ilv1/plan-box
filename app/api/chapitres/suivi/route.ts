import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/chapitres/suivi?chapitre_id=UUID
 *
 * Retourne le suivi élèves pour un chapitre :
 * - liste des exercices du chapitre
 * - pour chaque élève assigné : meilleur score par exercice + résultat évaluation
 * - stats globales (nb validés, score moyen éval, exercices problématiques)
 */
export async function GET(req: NextRequest) {
  const chapitreId = req.nextUrl.searchParams.get("chapitre_id");
  if (!chapitreId) {
    return NextResponse.json({ error: "chapitre_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Exercices du chapitre
  const { data: exercices, error: errExo } = await admin
    .from("exercice")
    .select("id, titre, type, ordre")
    .eq("chapitre_id", chapitreId)
    .order("ordre", { ascending: true });

  if (errExo) {
    return NextResponse.json({ error: "Erreur lecture exercices" }, { status: 500 });
  }

  // 2. Groupes assignés à ce chapitre (actifs)
  const { data: assignations } = await admin
    .from("chapitre_assignation")
    .select("groupe_id")
    .eq("chapitre_id", chapitreId)
    .eq("actif", true);

  const groupeIds = (assignations ?? []).map((a) => a.groupe_id);

  if (groupeIds.length === 0) {
    return NextResponse.json({
      exercices: exercices ?? [],
      eleves: [],
      stats: { nbEleves: 0, nbValides: 0, scoreMoyenEval: null, exercicesProblematiques: [] },
    });
  }

  // 3. Élèves membres de ces groupes
  const { data: membres } = await admin
    .from("eleve_groupe")
    .select("planbox_eleve_id, repetibox_eleve_id")
    .in("groupe_id", groupeIds);

  const pbIds: string[] = [];
  const rbIds: number[] = [];
  for (const m of membres ?? []) {
    if (m.planbox_eleve_id) pbIds.push(m.planbox_eleve_id);
    if (m.repetibox_eleve_id) rbIds.push(m.repetibox_eleve_id);
  }

  // Dédupliquer
  const pbIdsUniq = [...new Set(pbIds)];
  const rbIdsUniq = [...new Set(rbIds)];

  if (pbIdsUniq.length === 0 && rbIdsUniq.length === 0) {
    return NextResponse.json({
      exercices: exercices ?? [],
      eleves: [],
      stats: { nbEleves: 0, nbValides: 0, scoreMoyenEval: null, exercicesProblematiques: [] },
    });
  }

  // 4. Infos des élèves (noms)
  interface EleveSuivi {
    id: string;
    prenom: string;
    nom: string;
    source: "planbox" | "repetibox";
    resultats: Record<string, { score: number; total: number; valide: boolean }>;
    evaluation: { score: number; total: number; pourcentage: number; reussi: boolean } | null;
  }

  const eleves: EleveSuivi[] = [];

  if (pbIdsUniq.length > 0) {
    const { data: pbEleves } = await admin
      .from("eleves")
      .select("id, prenom, nom")
      .in("id", pbIdsUniq);
    for (const e of pbEleves ?? []) {
      eleves.push({ id: e.id, prenom: e.prenom, nom: e.nom, source: "planbox", resultats: {}, evaluation: null });
    }
  }

  if (rbIdsUniq.length > 0) {
    const { data: rbEleves } = await admin
      .from("eleve")
      .select("id, prenom, nom")
      .in("id", rbIdsUniq);
    for (const e of rbEleves ?? []) {
      eleves.push({ id: String(e.id), prenom: e.prenom, nom: e.nom, source: "repetibox", resultats: {}, evaluation: null });
    }
  }

  // 5. Résultats des exercices pour tous ces élèves
  const exerciceIds = (exercices ?? []).map((e) => e.id);

  if (exerciceIds.length > 0) {
    // PlanBox
    if (pbIdsUniq.length > 0) {
      const { data: resPB } = await admin
        .from("exercice_resultat")
        .select("exercice_id, eleve_id, score, total, valide")
        .in("exercice_id", exerciceIds)
        .in("eleve_id", pbIdsUniq);

      for (const r of resPB ?? []) {
        const eleve = eleves.find((e) => e.id === r.eleve_id && e.source === "planbox");
        if (!eleve) continue;
        const exist = eleve.resultats[r.exercice_id];
        if (!exist || (r.valide && !exist.valide) || (r.valide === exist.valide && r.score > exist.score)) {
          eleve.resultats[r.exercice_id] = { score: r.score, total: r.total, valide: r.valide };
        }
      }
    }

    // Repetibox
    if (rbIdsUniq.length > 0) {
      const { data: resRB } = await admin
        .from("exercice_resultat")
        .select("exercice_id, rb_eleve_id, score, total, valide")
        .in("exercice_id", exerciceIds)
        .in("rb_eleve_id", rbIdsUniq);

      for (const r of resRB ?? []) {
        const eleve = eleves.find((e) => e.id === String(r.rb_eleve_id) && e.source === "repetibox");
        if (!eleve) continue;
        const exist = eleve.resultats[r.exercice_id];
        if (!exist || (r.valide && !exist.valide) || (r.valide === exist.valide && r.score > exist.score)) {
          eleve.resultats[r.exercice_id] = { score: r.score, total: r.total, valide: r.valide };
        }
      }
    }
  }

  // 6. Résultats des évaluations finales
  if (pbIdsUniq.length > 0) {
    const { data: evalsPB } = await admin
      .from("evaluation_resultat")
      .select("eleve_id, score, total, pourcentage, reussi")
      .eq("chapitre_id", chapitreId)
      .in("eleve_id", pbIdsUniq);

    for (const ev of evalsPB ?? []) {
      const eleve = eleves.find((e) => e.id === ev.eleve_id && e.source === "planbox");
      if (!eleve) continue;
      if (!eleve.evaluation || (ev.reussi && !eleve.evaluation.reussi) || ev.pourcentage > (eleve.evaluation?.pourcentage ?? 0)) {
        eleve.evaluation = { score: ev.score, total: ev.total, pourcentage: ev.pourcentage, reussi: ev.reussi };
      }
    }
  }

  if (rbIdsUniq.length > 0) {
    const { data: evalsRB } = await admin
      .from("evaluation_resultat")
      .select("rb_eleve_id, score, total, pourcentage, reussi")
      .eq("chapitre_id", chapitreId)
      .in("rb_eleve_id", rbIdsUniq);

    for (const ev of evalsRB ?? []) {
      const eleve = eleves.find((e) => e.id === String(ev.rb_eleve_id) && e.source === "repetibox");
      if (!eleve) continue;
      if (!eleve.evaluation || (ev.reussi && !eleve.evaluation.reussi) || ev.pourcentage > (eleve.evaluation?.pourcentage ?? 0)) {
        eleve.evaluation = { score: ev.score, total: ev.total, pourcentage: ev.pourcentage, reussi: ev.reussi };
      }
    }
  }

  // 7. Trier les élèves par nom
  eleves.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));

  // 8. Calculer les stats
  const nbEleves = eleves.length;

  // Un élève a "validé" le chapitre si tous les exercices sont valides
  const nbValides = eleves.filter((e) => {
    const tousExosValides = exerciceIds.every((exId) => e.resultats[exId]?.valide);
    return tousExosValides && exerciceIds.length > 0;
  }).length;

  // Score moyen de l'évaluation
  const evalsReussies = eleves.filter((e) => e.evaluation).map((e) => e.evaluation!.pourcentage);
  const scoreMoyenEval = evalsReussies.length > 0
    ? Math.round(evalsReussies.reduce((s, v) => s + v, 0) / evalsReussies.length)
    : null;

  // Exercices problématiques : < 60% de réussite
  const exercicesProblematiques: Array<{ exerciceId: string; titre: string; tauxReussite: number; nbEchecs: number }> = [];
  for (const exo of exercices ?? []) {
    const tentatives = eleves.filter((e) => e.resultats[exo.id]);
    if (tentatives.length === 0) continue;
    const reussites = tentatives.filter((e) => e.resultats[exo.id].valide).length;
    const taux = Math.round((reussites / tentatives.length) * 100);
    if (taux < 60) {
      exercicesProblematiques.push({
        exerciceId: exo.id,
        titre: exo.titre,
        tauxReussite: taux,
        nbEchecs: tentatives.length - reussites,
      });
    }
  }

  return NextResponse.json({
    exercices: exercices ?? [],
    eleves,
    stats: { nbEleves, nbValides, scoreMoyenEval, exercicesProblematiques },
  });
}

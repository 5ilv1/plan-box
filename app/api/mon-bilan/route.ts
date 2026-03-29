import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/mon-bilan?eleveId=<uuid>&semaines=8
 * GET /api/mon-bilan?eleveRbId=<int>&semaines=8
 *
 * Retourne les stats personnelles d'un élève :
 * - KPIs globaux
 * - Progression par semaine et par matière
 * - Scores par matière
 * - Distribution 1er coup vs plusieurs tentatives
 * - Points forts / à travailler
 */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const eleveId = params.get("eleveId");
  const eleveRbId = params.get("eleveRbId");
  const semaines = parseInt(params.get("semaines") ?? "8", 10);

  if (!eleveId && !eleveRbId) {
    return NextResponse.json({ erreur: "eleveId ou eleveRbId requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Date de début
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - semaines * 7);
  const debutStr = dateDebut.toISOString().split("T")[0];

  let query = admin
    .from("plan_travail")
    .select("*, chapitres(titre, matiere)")
    .eq("statut", "fait")
    .gte("date_assignation", debutStr)
    .order("date_assignation");

  if (eleveId) {
    query = query.eq("eleve_id", eleveId);
  } else {
    query = query.eq("repetibox_eleve_id", parseInt(eleveRbId!, 10));
  }

  const { data: blocs, error } = await query;
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  const blocsAvecScore = (blocs ?? []).filter((b: any) => {
    const c = b.contenu as Record<string, unknown> | null;
    return c && c.score_eleve !== undefined && c.score_total !== undefined;
  });

  // ── KPIs globaux ──
  const nbExercices = blocsAvecScore.length;
  let nbReussis = 0;
  let nbPremierCoup = 0;
  let totalScore = 0;
  let totalMax = 0;

  for (const b of blocsAvecScore as any[]) {
    const c = b.contenu as Record<string, unknown>;
    const se = c.score_eleve as number;
    const st = c.score_total as number;
    const pct = st > 0 ? Math.round((se / st) * 100) : 0;
    if (pct >= 80) nbReussis++;
    const nbTentatives = (c.nb_tentatives as number) ?? 1;
    if (pct >= 80 && nbTentatives <= 1) nbPremierCoup++;
    totalScore += se;
    totalMax += st;
  }

  const tauxReussite = nbExercices > 0 ? Math.round((nbReussis / nbExercices) * 100) : 0;
  const scoreMoyen = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  // ── Progression par semaine par matière ──
  // Grouper par semaine ISO et par matière
  const semWkMap = new Map<string, Map<string, { total: number; sum: number }>>();

  for (const b of blocsAvecScore as any[]) {
    const c = b.contenu as Record<string, unknown>;
    const se = c.score_eleve as number;
    const st = c.score_total as number;
    const matiere = b.chapitres?.matiere ?? "Autre";
    const date = new Date(b.date_assignation);
    const wk = getISOWeekLabel(date);

    if (!semWkMap.has(wk)) semWkMap.set(wk, new Map());
    const matMap = semWkMap.get(wk)!;
    if (!matMap.has(matiere)) matMap.set(matiere, { total: 0, sum: 0 });
    const entry = matMap.get(matiere)!;
    entry.sum += se;
    entry.total += st;
  }

  // Semaines ordonnées
  const semaines_list = Array.from(semWkMap.keys()).sort();

  // Matières uniques
  const matieresSet = new Set<string>();
  for (const [, mm] of semWkMap) for (const m of mm.keys()) matieresSet.add(m);
  const matieres = Array.from(matieresSet).sort();

  const progressionHebdo = semaines_list.map(wk => {
    const entry: Record<string, unknown> = { semaine: wk };
    const mm = semWkMap.get(wk)!;
    for (const m of matieres) {
      const d = mm.get(m);
      entry[m] = d && d.total > 0 ? Math.round((d.sum / d.total) * 100) : null;
    }
    return entry;
  });

  // ── Scores par matière ──
  const matiereScores = new Map<string, { sum: number; total: number; nbExo: number }>();
  for (const b of blocsAvecScore as any[]) {
    const c = b.contenu as Record<string, unknown>;
    const matiere = b.chapitres?.matiere ?? "Autre";
    if (!matiereScores.has(matiere)) matiereScores.set(matiere, { sum: 0, total: 0, nbExo: 0 });
    const d = matiereScores.get(matiere)!;
    d.sum += c.score_eleve as number;
    d.total += c.score_total as number;
    d.nbExo++;
  }

  const scoreParMatiere = Array.from(matiereScores.entries()).map(([matiere, d]) => ({
    matiere,
    score: d.total > 0 ? Math.round((d.sum / d.total) * 100) : 0,
    nbExercices: d.nbExo,
  })).sort((a, b) => b.score - a.score);

  // ── Distribution 1er coup vs plusieurs tentatives ──
  let nbMultiTentatives = 0;
  for (const b of blocsAvecScore as any[]) {
    const c = b.contenu as Record<string, unknown>;
    const nbTentatives = (c.nb_tentatives as number) ?? 1;
    if (nbTentatives > 1) nbMultiTentatives++;
  }

  // ── Points forts / faibles ──
  const pointsForts = scoreParMatiere.filter(m => m.score >= 80 && m.nbExercices >= 2);
  const pointsFaibles = scoreParMatiere.filter(m => m.score < 70 && m.nbExercices >= 1);

  return NextResponse.json({
    kpis: { nbExercices, tauxReussite, scoreMoyen, nbPremierCoup, nbMultiTentatives },
    progressionHebdo,
    matieres,
    semaines: semaines_list,
    scoreParMatiere,
    pointsForts,
    pointsFaibles,
  });
}

function getISOWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

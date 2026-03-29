import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/admin/bilan-difficulte?debut=YYYY-MM-DD&fin=YYYY-MM-DD&groupe=xxx&matiere=xxx
 *
 * Agrège les données de performance par élève depuis plan_travail.
 * Retourne la liste des élèves avec leurs stats et chapitres en difficulté.
 */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const debut = params.get("debut");
  const fin = params.get("fin");
  const groupe = params.get("groupe");
  const matiere = params.get("matiere");

  const admin = createAdminClient();

  // Requête de base
  let query = admin
    .from("plan_travail")
    .select("*, chapitres(titre, matiere), eleves(prenom, nom, niveaux(nom))")
    .eq("statut", "fait")
    .not("contenu->score_eleve", "is", null);

  if (debut) query = query.gte("date_assignation", debut);
  if (fin) query = query.lte("date_assignation", fin);
  if (groupe) query = query.eq("groupe_label", groupe);

  const { data: blocs, error } = await query.order("date_assignation");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Récupérer aussi les blocs des élèves Repetibox
  const rbIds = [...new Set(
    (blocs ?? []).filter((b: any) => b.repetibox_eleve_id).map((b: any) => b.repetibox_eleve_id)
  )];

  let rbMap = new Map<number, { prenom: string; nom: string }>();
  if (rbIds.length > 0) {
    const { data: rbEleves } = await admin.from("eleve").select("id, prenom, nom").in("id", rbIds);
    rbMap = new Map((rbEleves ?? []).map((e: any) => [e.id, e]));
  }

  // Agréger par élève
  interface StatEleve {
    eleveId: string;
    prenom: string;
    nom: string;
    niveau: string;
    source: "planbox" | "repetibox";
    nbExercices: number;
    nbReussis: number;
    totalScore: number;
    totalMax: number;
    nbReaffectations: number;
    chapitresStats: Map<string, { titre: string; matiere: string; scores: number[]; maxScores: number[] }>;
  }

  const elevesMap = new Map<string, StatEleve>();

  for (const b of (blocs ?? []) as any[]) {
    const contenu = (b.contenu ?? {}) as Record<string, unknown>;
    const scoreEleve = contenu.score_eleve as number | undefined;
    const scoreTotal = contenu.score_total as number | undefined;
    const nbReaff = (contenu.nb_reaffectations as number) ?? 0;

    if (scoreEleve === undefined || !scoreTotal) continue;

    // Filtre matière
    if (matiere && b.chapitres?.matiere !== matiere) continue;

    let eleveKey: string;
    let prenom: string;
    let nom: string;
    let niveau = "";
    let source: "planbox" | "repetibox" = "planbox";

    if (b.eleve_id && b.eleves) {
      eleveKey = b.eleve_id;
      prenom = b.eleves.prenom;
      nom = b.eleves.nom;
      niveau = b.eleves.niveaux?.nom ?? "";
    } else if (b.repetibox_eleve_id) {
      const rb = rbMap.get(b.repetibox_eleve_id);
      if (!rb) continue;
      eleveKey = `rb_${b.repetibox_eleve_id}`;
      prenom = rb.prenom;
      nom = rb.nom;
      source = "repetibox";
    } else {
      continue;
    }

    if (!elevesMap.has(eleveKey)) {
      elevesMap.set(eleveKey, {
        eleveId: eleveKey,
        prenom,
        nom,
        niveau,
        source,
        nbExercices: 0,
        nbReussis: 0,
        totalScore: 0,
        totalMax: 0,
        nbReaffectations: 0,
        chapitresStats: new Map(),
      });
    }

    const stat = elevesMap.get(eleveKey)!;
    const pct = Math.round((scoreEleve / scoreTotal) * 100);

    stat.nbExercices++;
    if (pct >= 80) stat.nbReussis++;
    stat.totalScore += scoreEleve;
    stat.totalMax += scoreTotal;
    stat.nbReaffectations += nbReaff;

    // Stats par chapitre
    if (b.chapitres) {
      const chapKey = b.chapitre_id ?? b.chapitres.titre;
      if (!stat.chapitresStats.has(chapKey)) {
        stat.chapitresStats.set(chapKey, {
          titre: b.chapitres.titre,
          matiere: b.chapitres.matiere,
          scores: [],
          maxScores: [],
        });
      }
      const chapStat = stat.chapitresStats.get(chapKey)!;
      chapStat.scores.push(scoreEleve);
      chapStat.maxScores.push(scoreTotal);
    }
  }

  // Construire la réponse
  const elevesStats = Array.from(elevesMap.values()).map(stat => {
    const tauxReussite = stat.nbExercices > 0
      ? Math.round((stat.nbReussis / stat.nbExercices) * 100)
      : 0;
    const scoreMoyen = stat.totalMax > 0
      ? Math.round((stat.totalScore / stat.totalMax) * 100)
      : 0;

    const chapitresEnDifficulte = Array.from(stat.chapitresStats.values())
      .map(c => {
        const totalS = c.scores.reduce((a, b) => a + b, 0);
        const totalM = c.maxScores.reduce((a, b) => a + b, 0);
        const pctChap = totalM > 0 ? Math.round((totalS / totalM) * 100) : 0;
        return {
          titre: c.titre,
          matiere: c.matiere,
          scoreMoyen: pctChap,
          nbTentatives: c.scores.length,
        };
      })
      .filter(c => c.scoreMoyen < 70)
      .sort((a, b) => a.scoreMoyen - b.scoreMoyen);

    const difficulteGlobale =
      scoreMoyen < 50 ? "elevee" :
      scoreMoyen < 70 ? "moderee" :
      scoreMoyen < 85 ? "faible" : "ok";

    return {
      eleveId: stat.eleveId,
      prenom: stat.prenom,
      nom: stat.nom,
      niveau: stat.niveau,
      source: stat.source,
      nbExercices: stat.nbExercices,
      tauxReussite,
      scoreMoyen,
      nbReaffectations: stat.nbReaffectations,
      chapitresEnDifficulte,
      difficulteGlobale,
    };
  });

  // Stats globales de la classe
  const nbTotalEleves = elevesStats.length;
  const nbEnDifficulte = elevesStats.filter(e => e.difficulteGlobale === "elevee" || e.difficulteGlobale === "moderee").length;
  const scoreMoyenClasse = nbTotalEleves > 0
    ? Math.round(elevesStats.reduce((a, e) => a + e.scoreMoyen, 0) / nbTotalEleves)
    : 0;

  // Chapitres collectivement difficiles
  const chapCollectif = new Map<string, { titre: string; matiere: string; scores: number[]; nbEleves: Set<string> }>();
  for (const [, stat] of elevesMap) {
    for (const [key, c] of stat.chapitresStats) {
      if (!chapCollectif.has(key)) {
        chapCollectif.set(key, { titre: c.titre, matiere: c.matiere, scores: [], nbEleves: new Set() });
      }
      const totalS = c.scores.reduce((a, b) => a + b, 0);
      const totalM = c.maxScores.reduce((a, b) => a + b, 0);
      if (totalM > 0) {
        chapCollectif.get(key)!.scores.push(Math.round((totalS / totalM) * 100));
        chapCollectif.get(key)!.nbEleves.add(stat.eleveId);
      }
    }
  }

  const pointsFaiblesCollectifs = Array.from(chapCollectif.values())
    .map(c => ({
      titre: c.titre,
      matiere: c.matiere,
      scoreMoyen: c.scores.length > 0 ? Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length) : 0,
      nbEleves: c.nbEleves.size,
    }))
    .filter(c => c.scoreMoyen < 70 && c.nbEleves >= 2)
    .sort((a, b) => a.scoreMoyen - b.scoreMoyen)
    .slice(0, 5);

  return NextResponse.json({
    elevesStats,
    stats: {
      nbTotalEleves,
      nbEnDifficulte,
      scoreMoyenClasse,
      pointsFaiblesCollectifs,
    },
  });
}

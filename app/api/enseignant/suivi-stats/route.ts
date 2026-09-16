import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import {
  type BlocSuivi,
  type Periode,
  agregerParMatiere,
  bornesPeriode,
  bornesPrecedentes,
  chargerBlocs,
  chargerEleves,
  completion,
  dateDuJour,
  decalerJours,
  estComptePourCompletion,
  estEnRetard,
  lundiDe,
  matiereDuBloc,
  scoreBloc,
  signalBaclage,
  uidDuBloc,
} from "@/lib/suivi-metriques";

/**
 * GET /api/enseignant/suivi-stats
 *   ?periode=jour|semaine|mois|trimestre  (défaut : semaine)
 *   &niveau=tous|CE2|CM1|CM2              (défaut : tous)
 *   &eleve=pb_<uuid>|rb_<id>              (optionnel : restreint à un élève)
 *
 * Tout le suivi enseignant en un seul appel. Quatre routes distinctes le
 * faisaient avant, avec quatre définitions différentes du « taux de complétion »
 * et quatre chargements — donc quatre attentes et des chiffres qui ne
 * concordaient pas d'un onglet à l'autre.
 *
 * Les podcasts, les ceintures et les cartes à réviser sont hors du taux de
 * complétion (voir TYPES_COMPTES) : ce sont des activités libres, les compter
 * ferait chuter le taux d'un élève qui a pourtant tout fait.
 */

const NB_SEMAINES_EVOLUTION = 8;

export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const periode = (params.get("periode") ?? "semaine") as Periode;
  const niveauFiltre = params.get("niveau") ?? "tous";
  const eleveFiltre = params.get("eleve");

  if (!["jour", "semaine", "mois", "trimestre"].includes(periode)) {
    return NextResponse.json({ erreur: "Période invalide" }, { status: 400 });
  }

  const admin = createAdminClient();
  const aujourdhui = dateDuJour();
  const bornes = bornesPeriode(periode, aujourdhui);
  const precedentes = bornesPrecedentes(bornes);

  // L'évolution remonte plus loin que la période affichée : on charge une seule
  // fois la fenêtre la plus large et on découpe ensuite en mémoire.
  const debutEvolution = decalerJours(lundiDe(aujourdhui), -7 * (NB_SEMAINES_EVOLUTION - 1));
  const debutCharge = [bornes.debut, precedentes.debut, debutEvolution].sort()[0];
  const finCharge = [bornes.fin, aujourdhui].sort().reverse()[0];

  let eleves, blocsBruts;
  try {
    [eleves, blocsBruts] = await Promise.all([
      chargerEleves(admin),
      chargerBlocs(admin, { debut: debutCharge, fin: finCharge }),
    ]);
  } catch (e) {
    console.error("[GET /api/enseignant/suivi-stats]", e);
    return NextResponse.json({ erreur: (e as Error).message }, { status: 500 });
  }

  const elevesParUid = new Map(eleves.map((e) => [e.uid, e]));

  // ── Filtres ───────────────────────────────────────────────────────────────
  const elevesRetenus = eleves.filter((e) => {
    if (eleveFiltre && e.uid !== eleveFiltre) return false;
    if (niveauFiltre !== "tous" && e.niveau !== niveauFiltre) return false;
    return true;
  });
  const uidsRetenus = new Set(elevesRetenus.map((e) => e.uid));

  /** Le travail réellement comptabilisé : périmètre + élèves retenus. */
  const blocs = blocsBruts.filter((b) => {
    if (!estComptePourCompletion(b.type)) return false;
    const uid = uidDuBloc(b);
    return uid !== null && uidsRetenus.has(uid);
  });

  const dans = (b: BlocSuivi, debut: string, fin: string) =>
    b.date_assignation >= debut && b.date_assignation <= fin;

  // Un taux de complétion ne compte que ce qui est **déjà dû**. Sans cette
  // borne, un mercredi affichait 39 % parce que le travail de jeudi et de
  // vendredi comptait déjà comme non fait — un chiffre alarmiste et faux, et
  // un écart de −36 points avec la semaine précédente, pourtant complète.
  const finDue = bornes.fin < aujourdhui ? bornes.fin : aujourdhui;

  const blocsPeriode = blocs.filter((b) => dans(b, bornes.debut, finDue));

  // La période précédente est tronquée à la même durée écoulée : comparer trois
  // jours de semaine à sept jours pleins produirait un écart imaginaire.
  const joursEcoules = Math.max(1, Math.round(
    (new Date(finDue + "T12:00:00").getTime() - new Date(bornes.debut + "T12:00:00").getTime()) / 86400000
  ) + 1);
  const finPrecedente = decalerJours(precedentes.debut, joursEcoules - 1);
  const blocsPrecedents = blocs.filter((b) => dans(b, precedentes.debut, finPrecedente));
  const blocsJour = blocs.filter((b) => b.date_assignation === aujourdhui);
  const semaine = bornesPeriode("semaine", aujourdhui);
  const blocsSemaine = blocs.filter((b) => dans(b, semaine.debut, aujourdhui));

  // ── Complétion ────────────────────────────────────────────────────────────
  const parNiveau = [...new Set(elevesRetenus.map((e) => e.niveau))]
    .filter((n) => n !== "—")
    .sort()
    .map((niveau) => {
      const uids = new Set(elevesRetenus.filter((e) => e.niveau === niveau).map((e) => e.uid));
      return { niveau, ...completion(blocsPeriode.filter((b) => uids.has(uidDuBloc(b)!))) };
    });

  // La courbe journalière, elle, montre toute la période, y compris les jours
  // à venir — marqués comme tels pour qu'un 0 % pas encore dû ne se confonde
  // pas avec un 0 % de travail non fait.
  const parJour: Array<{ date: string; faits: number; total: number; pct: number | null; aVenir: boolean }> = [];
  for (let d = bornes.debut; d <= bornes.fin; d = decalerJours(d, 1)) {
    const duJour = blocs.filter((b) => b.date_assignation === d);
    parJour.push({ date: d, ...completion(duJour), aVenir: d > aujourdhui });
  }

  const parEleve = elevesRetenus.map((e) => {
    const siens = (src: BlocSuivi[]) => src.filter((b) => uidDuBloc(b) === e.uid);
    const periodeEleve = siens(blocsPeriode);
    return {
      uid: e.uid,
      prenom: e.prenom,
      nom: e.nom,
      niveau: e.niveau,
      jour: completion(siens(blocsJour)),
      semaine: completion(siens(blocsSemaine)),
      periode: completion(periodeEleve),
      retards: siens(blocs).filter((b) => estEnRetard(b, aujourdhui)).length,
      reussite: reussiteMoyenne(periodeEleve),
      baclages: periodeEleve.filter((b) => {
        const s = scoreBloc(b.contenu);
        return b.statut === "fait" && signalBaclage(b.duree_secondes, s.nbQuestions, s.pctPremier);
      }).length,
    };
  });

  // ── Évolution hebdomadaire ────────────────────────────────────────────────
  const evolution: Array<{ lundi: string; completionPct: number | null; reussitePct: number | null }> = [];
  for (let i = NB_SEMAINES_EVOLUTION - 1; i >= 0; i--) {
    const lundi = decalerJours(lundiDe(aujourdhui), -7 * i);
    const dimanche = decalerJours(lundi, 6);
    const lot = blocs.filter((b) => dans(b, lundi, dimanche));
    evolution.push({
      lundi,
      completionPct: completion(lot).pct,
      reussitePct: reussiteMoyenne(lot),
    });
  }

  // ── Élèves à surveiller ───────────────────────────────────────────────────
  // Un classement sans motif ne sert à rien : chaque élève listé dit pourquoi.
  const aSurveiller = parEleve
    .map((e) => {
      const motifs: string[] = [];
      let score = 0;
      if (e.periode.total > 0 && e.periode.pct !== null && e.periode.pct < 60) {
        motifs.push(`${e.periode.pct} % du travail fait`);
        score += 60 - e.periode.pct;
      }
      if (e.reussite !== null && e.reussite < 60) {
        motifs.push(`${e.reussite} % de réussite au 1er essai`);
        score += 60 - e.reussite;
      }
      if (e.retards >= 3) {
        motifs.push(`${e.retards} blocs en retard`);
        score += e.retards * 5;
      }
      if (e.baclages > 0) {
        motifs.push(`${e.baclages} ${e.baclages > 1 ? "exercices expédiés" : "exercice expédié"}`);
        score += e.baclages * 15;
      }
      return { uid: e.uid, prenom: e.prenom, nom: e.nom, niveau: e.niveau, motifs, score };
    })
    .filter((e) => e.motifs.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // ── Équilibre de la programmation ─────────────────────────────────────────
  // Une stat sur l'enseignant, pas sur les élèves : ce que j'ai donné, et en
  // quelle proportion. Les blocs sont dédupliqués par (type, titre) pour ne pas
  // compter 21 fois le même exercice distribué à toute la classe.
  const donnes = new Map<string, { matiere: string; type: string }>();
  for (const b of blocsPeriode) {
    const cle = `${b.type}::${b.titre}`;
    if (!donnes.has(cle)) donnes.set(cle, { matiere: matiereDuBloc(b.type, b.contenu).matiere, type: b.type });
  }
  const programmation = compter([...donnes.values()].map((d) => d.matiere));
  const programmationTypes = compter([...donnes.values()].map((d) => d.type));

  // ── Questions les plus ratées ─────────────────────────────────────────────
  const questionsRatees = calculerQuestionsRatees(blocsPeriode);

  // ── Détail élève ──────────────────────────────────────────────────────────
  const detailEleve = eleveFiltre
    ? {
        eleve: elevesParUid.get(eleveFiltre) ?? null,
        blocsJour: blocsBruts
          .filter((b) => uidDuBloc(b) === eleveFiltre && b.date_assignation === aujourdhui)
          .map(resumerBloc),
        blocsPeriode: blocsPeriode.filter((b) => uidDuBloc(b) === eleveFiltre).map(resumerBloc),
      }
    : null;

  return NextResponse.json({
    periode: { cle: periode, ...bornes },
    aujourdhui,
    niveaux: [...new Set(eleves.map((e) => e.niveau))].filter((n) => n !== "—").sort(),
    eleves: eleves.map(({ uid, prenom, nom, niveau }) => ({ uid, prenom, nom, niveau })),
    completion: {
      global: completion(blocsPeriode),
      precedente: completion(blocsPrecedents),
      jour: completion(blocsJour),
      semaine: completion(blocsSemaine),
      retards: blocs.filter((b) => estEnRetard(b, aujourdhui)).length,
      parNiveau,
      parJour,
      parEleve,
    },
    reussite: {
      periode: reussiteMoyenne(blocsPeriode),
      precedente: reussiteMoyenne(blocsPrecedents),
    },
    matieres: agregerParMatiere(blocsPeriode),
    evolution,
    aSurveiller,
    programmation,
    programmationTypes,
    questionsRatees,
    detailEleve,
  });
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Réussite moyenne au premier essai, pondérée par le nombre de questions.
 *
 * Le premier essai et pas le score final : après correction, tout le monde
 * finit à 100 %. C'est la première tentative qui dit si la leçon est passée.
 */
function reussiteMoyenne(blocs: BlocSuivi[]): number | null {
  let score = 0;
  let total = 0;
  for (const b of blocs) {
    if (b.statut !== "fait") continue;
    const c = b.contenu ?? {};
    const s = c.premier_score ?? c.score_eleve;
    const t = c.premier_score_total ?? c.score_total;
    if (typeof s !== "number" || typeof t !== "number" || t <= 0) continue;
    score += s;
    total += t;
  }
  return total > 0 ? Math.round((score / total) * 100) : null;
}

function compter(valeurs: string[]): Array<{ cle: string; nb: number; pct: number }> {
  const map = new Map<string, number>();
  for (const v of valeurs) map.set(v, (map.get(v) ?? 0) + 1);
  const total = valeurs.length;
  return [...map.entries()]
    .map(([cle, nb]) => ({ cle, nb, pct: total > 0 ? Math.round((nb / total) * 100) : 0 }))
    .sort((a, b) => b.nb - a.nb);
}

function resumerBloc(b: BlocSuivi) {
  const s = scoreBloc(b.contenu);
  return {
    id: b.id,
    type: b.type,
    titre: b.titre,
    statut: b.statut,
    date: b.date_assignation,
    matiere: matiereDuBloc(b.type, b.contenu).matiere,
    pctPremier: s.pctPremier,
    pctFinal: s.pctFinal,
    tentatives: s.tentatives,
    dureeSecondes: b.duree_secondes,
    nbQuestions: s.nbQuestions,
    bacle: signalBaclage(b.duree_secondes, s.nbQuestions, s.pctPremier),
  };
}

/**
 * Les énoncés que la classe a le plus ratés, pour la remédiation du lendemain.
 *
 * Même lecture de `contenu` que `/api/feedback` : `reponses_eleve` porte un
 * `correcte` par question, et `questions`/`calculs`/`trous` donnent l'énoncé.
 */
function calculerQuestionsRatees(blocs: BlocSuivi[]) {
  // Un bloc appartient à un élève et ne garde que ses dernières réponses :
  // un échec compté = un élève qui a raté cette question.
  interface Cumul { enonce: string; titre: string; type: string; nbEleves: number }
  const cumuls = new Map<string, Cumul>();

  for (const b of blocs) {
    if (b.statut !== "fait") continue;
    const contenu = b.contenu ?? {};
    const reponses = contenu.reponses_eleve;
    if (!Array.isArray(reponses)) continue;

    const enonces = enoncesDuBloc(contenu);
    if (!enonces) continue;

    for (let i = 0; i < reponses.length; i++) {
      const r = reponses[i] as { correcte?: boolean | null };
      if (r?.correcte !== false) continue;
      const enonce = enonces[i];
      if (!enonce) continue;
      const cle = `${b.type}::${b.titre}::${enonce}`;
      const c = cumuls.get(cle) ?? { enonce, titre: b.titre, type: b.type, nbEleves: 0 };
      c.nbEleves++;
      cumuls.set(cle, c);
    }
  }

  return [...cumuls.values()]
    .filter((c) => c.nbEleves >= 2) // un seul élève en échec n'est pas un sujet de classe
    .sort((a, b) => b.nbEleves - a.nbEleves)
    .slice(0, 10);
}

/** Les énoncés d'un bloc, dans l'ordre des réponses de l'élève. */
function enoncesDuBloc(contenu: Record<string, unknown>): string[] | null {
  const questions = contenu.questions;
  if (Array.isArray(questions)) {
    return questions.map((q) => {
      const o = q as Record<string, unknown>;
      return String(o.enonce ?? o.question ?? "").trim();
    });
  }
  const calculs = contenu.calculs;
  if (Array.isArray(calculs)) {
    return calculs.map((c) => {
      const o = c as Record<string, unknown>;
      return String(o.enonce ?? o.expression ?? "").trim();
    });
  }
  const trous = contenu.trous;
  if (Array.isArray(trous)) {
    return trous.map((t) => {
      const o = t as Record<string, unknown>;
      return `Trou : ${String(o.mot ?? "")}`;
    });
  }
  return null;
}

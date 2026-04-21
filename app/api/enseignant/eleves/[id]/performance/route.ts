import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * GET /api/enseignant/eleves/[id]/performance?periode=semaine|mois|trimestre|all
 *
 * Retourne la performance d'un élève, agrégée par matière → sous-matière → chapitre → exercice.
 * Comparaison avec la moyenne de la classe (élèves du même niveau scolaire).
 *
 * [id] = "pb_UUID" (élève PlanBox) ou "rb_N" (élève Repetibox).
 *
 * Règles :
 * - Score par exercice = meilleur score enregistré dans exercice_resultat (cohérent avec /api/chapitres/suivi).
 * - Types non notables (revision, ecriture_contrainte, libre) : exclus du calcul de score,
 *   mais le chapitre reste visible pour refléter l'activité.
 * - Moyenne classe = moyenne des scores moyens des élèves (PB + RB) du même niveau (CE2/CM1/CM2).
 *   L'élève lui-même est exclu de la moyenne pour éviter de se comparer à soi.
 * - Période : filtre sur exercice_resultat.created_at.
 */

// Types exclus du calcul de score (pas de scoring objectif)
const TYPES_NON_NOTABLES = new Set(["revision", "ecriture_contrainte", "libre"]);

// Mapping niveau_etoiles Repetibox → nom de niveau
// (voir app/enseignant/(app)/admin/eleves/page.tsx : ETOILES = ["", "CE2", "CM1", "CM2", "CM2+"])
const ETOILES_TO_NIVEAU: Record<number, string> = {
  1: "CE2",
  2: "CM1",
  3: "CM2",
  4: "CM2", // CM2+ consolidé avec CM2 pour la comparaison
};

function getDateDebut(periode: string): string | null {
  const today = new Date();
  const d = new Date(today);
  if (periode === "semaine") { d.setDate(today.getDate() - 7); return d.toISOString(); }
  if (periode === "mois")    { d.setMonth(today.getMonth() - 1); return d.toISOString(); }
  if (periode === "trimestre") { d.setMonth(today.getMonth() - 3); return d.toISOString(); }
  return null; // "all" ou inconnu : pas de filtre
}

interface Exercice {
  id: string;
  titre: string | null;
  type: string;
  ordre: number | null;
  chapitre_id: string;
}

interface Chapitre {
  id: string;
  titre: string;
  matiere: string;
  sous_matiere: string | null;
  niveau_id: string | null;
}

interface ResultatRow {
  exercice_id: string;
  eleve_id: string | null;
  rb_eleve_id: number | null;
  score: number;
  total: number;
  valide: boolean;
  created_at: string;
}

/** Meilleur résultat pour une paire (exercice_id, eleve_uid). */
function estMeilleur(a: ResultatRow, b: ResultatRow): boolean {
  const pA = a.total > 0 ? a.score / a.total : 0;
  const pB = b.total > 0 ? b.score / b.total : 0;
  if (a.valide !== b.valide) return a.valide; // validé > non validé
  return pA >= pB;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { id: uid } = await context.params;
  const periode = new URL(req.url).searchParams.get("periode") ?? "all";
  const dateDebut = getDateDebut(periode);

  const isPb = uid.startsWith("pb_");
  const isRb = uid.startsWith("rb_");
  if (!isPb && !isRb) {
    return NextResponse.json({ error: "Identifiant élève invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── 1. Charger l'élève cible + son niveau ────────────────────────────────
  let eleveCible: {
    uid: string;
    prenom: string;
    nom: string;
    niveau_nom: string | null;
    source: "planbox" | "repetibox";
  };

  if (isPb) {
    const pbId = uid.slice(3);
    const { data: e, error } = await admin
      .from("eleves")
      .select("id, prenom, nom, niveau_id, niveaux(nom)")
      .eq("id", pbId)
      .maybeSingle();
    if (error || !e) return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
    const niveauNom = ((e.niveaux as unknown as { nom: string } | null)?.nom) ?? null;
    eleveCible = {
      uid,
      prenom: e.prenom,
      nom: e.nom,
      niveau_nom: niveauNom,
      source: "planbox",
    };
  } else {
    const rbId = parseInt(uid.slice(3), 10);
    const { data: e, error } = await admin
      .from("eleve")
      .select("id, prenom, nom, niveau_etoiles")
      .eq("id", rbId)
      .maybeSingle();
    if (error || !e) return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
    const et = e.niveau_etoiles as number | null;
    eleveCible = {
      uid,
      prenom: e.prenom,
      nom: e.nom,
      niveau_nom: et != null ? (ETOILES_TO_NIVEAU[et] ?? null) : null,
      source: "repetibox",
    };
  }

  // ── 2. Récupérer la cohorte "classe" (même niveau scolaire) ───────────────
  // PB : eleves.niveau_id → niveaux.nom
  // RB : eleve.niveau_etoiles → ETOILES_TO_NIVEAU
  const niveauCible = eleveCible.niveau_nom;

  const [{ data: pbCohorte }, { data: rbCohorte }] = await Promise.all([
    niveauCible
      ? admin
          .from("eleves")
          .select("id, niveau_id, niveaux(nom)")
      : Promise.resolve({ data: [] as Array<{ id: string; niveau_id: string; niveaux: { nom: string } | null }> }),
    niveauCible
      ? admin.from("eleve").select("id, niveau_etoiles")
      : Promise.resolve({ data: [] as Array<{ id: number; niveau_etoiles: number | null }> }),
  ]);

  const pbIdsCohorte: string[] = [];
  for (const e of (pbCohorte ?? []) as Array<{ id: string; niveaux: { nom: string } | null }>) {
    const n = (e.niveaux as unknown as { nom: string } | null)?.nom ?? null;
    if (n && n === niveauCible) pbIdsCohorte.push(e.id);
  }
  const rbIdsCohorte: number[] = [];
  for (const e of (rbCohorte ?? []) as Array<{ id: number; niveau_etoiles: number | null }>) {
    const et = e.niveau_etoiles;
    const n = et != null ? ETOILES_TO_NIVEAU[et] : null;
    if (n && n === niveauCible) rbIdsCohorte.push(e.id);
  }

  // Si pas de niveau, cohorte = juste l'élève (pas de comparaison possible)
  if (!niveauCible) {
    if (isPb) pbIdsCohorte.push(uid.slice(3));
    else rbIdsCohorte.push(parseInt(uid.slice(3), 10));
  }

  // ── 3. Charger tous les résultats de la cohorte ──────────────────────────
  //
  // Deux requêtes séparées (PB/RB) car les colonnes sont distinctes.
  const [{ data: resPbData }, { data: resRbData }] = await Promise.all([
    pbIdsCohorte.length > 0
      ? (async () => {
          let q = admin
            .from("exercice_resultat")
            .select("exercice_id, eleve_id, rb_eleve_id, score, total, valide, created_at")
            .in("eleve_id", pbIdsCohorte);
          if (dateDebut) q = q.gte("created_at", dateDebut);
          return q;
        })()
      : Promise.resolve({ data: [] as ResultatRow[] }),
    rbIdsCohorte.length > 0
      ? (async () => {
          let q = admin
            .from("exercice_resultat")
            .select("exercice_id, eleve_id, rb_eleve_id, score, total, valide, created_at")
            .in("rb_eleve_id", rbIdsCohorte);
          if (dateDebut) q = q.gte("created_at", dateDebut);
          return q;
        })()
      : Promise.resolve({ data: [] as ResultatRow[] }),
  ]);

  const tousResultats: ResultatRow[] = [
    ...((resPbData ?? []) as ResultatRow[]),
    ...((resRbData ?? []) as ResultatRow[]),
  ];

  if (tousResultats.length === 0) {
    return NextResponse.json({
      eleve: eleveCible,
      periode,
      niveau_compare: niveauCible,
      nb_eleves_classe: pbIdsCohorte.length + rbIdsCohorte.length,
      global: null,
      matieres: [],
    });
  }

  // ── 4. Charger les exercices + chapitres associés ────────────────────────
  const exerciceIds = [...new Set(tousResultats.map((r) => r.exercice_id))];
  const { data: exercicesData } = await admin
    .from("exercice")
    .select("id, titre, type, ordre, chapitre_id")
    .in("id", exerciceIds);

  const exercices = (exercicesData ?? []) as Exercice[];
  const chapitreIds = [...new Set(exercices.map((e) => e.chapitre_id).filter(Boolean))];

  const { data: chapitresData } = await admin
    .from("chapitres")
    .select("id, titre, matiere, sous_matiere, niveau_id")
    .in("id", chapitreIds);

  const chapitres = (chapitresData ?? []) as Chapitre[];
  const chapitreMap = new Map(chapitres.map((c) => [c.id, c]));
  const exerciceMap = new Map(exercices.map((e) => [e.id, e]));

  // ── 5. Pour chaque (eleve_uid, exercice_id) : ne garder que le meilleur ──
  const meilleurResultat = new Map<string, ResultatRow>();
  for (const r of tousResultats) {
    const eleveUid = r.eleve_id ? `pb_${r.eleve_id}` : r.rb_eleve_id != null ? `rb_${r.rb_eleve_id}` : null;
    if (!eleveUid) continue;
    const key = `${eleveUid}__${r.exercice_id}`;
    const existant = meilleurResultat.get(key);
    if (!existant || estMeilleur(r, existant)) {
      meilleurResultat.set(key, r);
    }
  }

  // ── 6. Agréger par (eleve_uid, matiere, sous_matiere, chapitre_id) ───────
  // On garde : total_score, total_total, nb_exercices notables.
  //
  // La moyenne classe à un niveau N = moyenne sur les élèves (de la cohorte)
  // de leur pourcentage moyen à ce niveau. On fait donc :
  //   score_eleve_au_niveau = Σ score_meilleur / Σ total_meilleur (pour les exos notables)
  //   moyenne_classe = mean(score_eleve_au_niveau pour chaque élève de la cohorte ayant au moins 1 essai)

  interface AccEleveNiveau {
    totalScore: number;
    totalMax: number;
    nbExercices: number;
  }

  function key3(uid: string, mat: string, sous: string, chap: string): string {
    return `${uid}|${mat}|${sous}|${chap}`;
  }

  // accumulateurs par élève, pour chaque granularité
  const accParChapitre = new Map<string, AccEleveNiveau>(); // uid|mat|sous|chap
  const accParSousMat  = new Map<string, AccEleveNiveau>(); // uid|mat|sous|_
  const accParMatiere  = new Map<string, AccEleveNiveau>(); // uid|mat|_|_
  const accGlobal      = new Map<string, AccEleveNiveau>(); // uid|_|_|_

  // liste des exercices de l'élève cible par chapitre (pour le drill-down)
  const exosEleveParChap = new Map<string, Array<{
    id: string;
    titre: string | null;
    type: string;
    score: number;
    total: number;
    pourcentage: number;
    valide: boolean;
    notable: boolean;
    tente_at: string;
  }>>();

  function accumule(map: Map<string, AccEleveNiveau>, k: string, score: number, total: number) {
    const e = map.get(k) ?? { totalScore: 0, totalMax: 0, nbExercices: 0 };
    e.totalScore += score;
    e.totalMax   += total;
    e.nbExercices++;
    map.set(k, e);
  }

  for (const [key, r] of meilleurResultat) {
    const [eleveUid] = key.split("__");
    const ex = exerciceMap.get(r.exercice_id);
    if (!ex) continue;
    const chap = chapitreMap.get(ex.chapitre_id);
    if (!chap) continue;

    const matiere = chap.matiere || "non-renseignée";
    const sousMat = chap.sous_matiere || "—";
    const chapId  = chap.id;
    const notable = !TYPES_NON_NOTABLES.has(ex.type) && r.total > 0;

    // Drill-down : liste détaillée pour l'élève cible uniquement
    if (eleveUid === uid) {
      const list = exosEleveParChap.get(chapId) ?? [];
      list.push({
        id: ex.id,
        titre: ex.titre,
        type: ex.type,
        score: r.score,
        total: r.total,
        pourcentage: r.total > 0 ? Math.round((r.score / r.total) * 100) : 0,
        valide: r.valide,
        notable,
        tente_at: r.created_at,
      });
      exosEleveParChap.set(chapId, list);
    }

    // Les exos non notables n'entrent pas dans les accumulateurs de score
    if (!notable) continue;

    accumule(accParChapitre, key3(eleveUid, matiere, sousMat, chapId), r.score, r.total);
    accumule(accParSousMat,  key3(eleveUid, matiere, sousMat, "_"),    r.score, r.total);
    accumule(accParMatiere,  key3(eleveUid, matiere, "_", "_"),        r.score, r.total);
    accumule(accGlobal,      key3(eleveUid, "_", "_", "_"),            r.score, r.total);
  }

  // ── 7. Calculer les moyennes ──────────────────────────────────────────────
  // Moyenne classe = moyenne des pourcentages individuels (chaque élève compte pour 1
  // indépendamment de son nombre d'essais, pour éviter qu'un élève prolifique ne biaise).
  function moyenneClasse(map: Map<string, AccEleveNiveau>, suffixe: string, excludeUid: string): { moyenne: number | null; nbEleves: number } {
    const pourcentages: number[] = [];
    for (const [k, a] of map) {
      if (!k.endsWith(suffixe)) continue;
      const eleveUidLocal = k.split("|")[0];
      if (eleveUidLocal === excludeUid) continue;
      if (a.totalMax === 0) continue;
      pourcentages.push(a.totalScore / a.totalMax);
    }
    if (pourcentages.length === 0) return { moyenne: null, nbEleves: 0 };
    const m = pourcentages.reduce((s, p) => s + p, 0) / pourcentages.length;
    return { moyenne: Math.round(m * 100), nbEleves: pourcentages.length };
  }

  function scoreEleve(map: Map<string, AccEleveNiveau>, k: string): { score: number | null; nbExercices: number } {
    const a = map.get(k);
    if (!a || a.totalMax === 0) return { score: null, nbExercices: 0 };
    return {
      score: Math.round((a.totalScore / a.totalMax) * 100),
      nbExercices: a.nbExercices,
    };
  }

  // ── 8. Construire l'arbre hiérarchique pour la réponse ───────────────────
  // Parcourir les données de l'élève cible uniquement pour la structure.
  const arbre = new Map<string, {
    matiere: string;
    score_eleve: number | null;
    moyenne_classe: number | null;
    nb_eleves_classe: number;
    nb_exercices: number;
    sous_matieres: Map<string, {
      sous_matiere: string;
      score_eleve: number | null;
      moyenne_classe: number | null;
      nb_eleves_classe: number;
      nb_exercices: number;
      chapitres: Map<string, {
        chapitre_id: string;
        titre: string;
        score_eleve: number | null;
        moyenne_classe: number | null;
        nb_eleves_classe: number;
        nb_exercices: number;
        exercices: Array<{
          id: string;
          titre: string | null;
          type: string;
          score: number;
          total: number;
          pourcentage: number;
          valide: boolean;
          notable: boolean;
          tente_at: string;
        }>;
      }>;
    }>;
  }>();

  // Parcourir les chapitres où l'élève a au moins 1 exercice (même non notable)
  for (const [chapId, exosListe] of exosEleveParChap) {
    const chap = chapitreMap.get(chapId);
    if (!chap) continue;
    const matiere = chap.matiere || "non-renseignée";
    const sousMat = chap.sous_matiere || "—";

    if (!arbre.has(matiere)) {
      const scMat = scoreEleve(accParMatiere, key3(uid, matiere, "_", "_"));
      const mcMat = moyenneClasse(accParMatiere, `|${matiere}|_|_`, uid);
      arbre.set(matiere, {
        matiere,
        score_eleve: scMat.score,
        moyenne_classe: mcMat.moyenne,
        nb_eleves_classe: mcMat.nbEleves,
        nb_exercices: scMat.nbExercices,
        sous_matieres: new Map(),
      });
    }
    const nodeMat = arbre.get(matiere)!;

    if (!nodeMat.sous_matieres.has(sousMat)) {
      const scSm = scoreEleve(accParSousMat, key3(uid, matiere, sousMat, "_"));
      const mcSm = moyenneClasse(accParSousMat, `|${matiere}|${sousMat}|_`, uid);
      nodeMat.sous_matieres.set(sousMat, {
        sous_matiere: sousMat,
        score_eleve: scSm.score,
        moyenne_classe: mcSm.moyenne,
        nb_eleves_classe: mcSm.nbEleves,
        nb_exercices: scSm.nbExercices,
        chapitres: new Map(),
      });
    }
    const nodeSm = nodeMat.sous_matieres.get(sousMat)!;

    if (!nodeSm.chapitres.has(chapId)) {
      const scCh = scoreEleve(accParChapitre, key3(uid, matiere, sousMat, chapId));
      const mcCh = moyenneClasse(accParChapitre, `|${matiere}|${sousMat}|${chapId}`, uid);
      // tri des exercices par ordre (si dispo) puis par date
      const exosTries = [...exosListe].sort((a, b) => {
        const ea = exerciceMap.get(a.id)?.ordre ?? null;
        const eb = exerciceMap.get(b.id)?.ordre ?? null;
        if (ea != null && eb != null) return ea - eb;
        return a.tente_at.localeCompare(b.tente_at);
      });
      nodeSm.chapitres.set(chapId, {
        chapitre_id: chapId,
        titre: chap.titre,
        score_eleve: scCh.score,
        moyenne_classe: mcCh.moyenne,
        nb_eleves_classe: mcCh.nbEleves,
        nb_exercices: scCh.nbExercices,
        exercices: exosTries,
      });
    }
  }

  // ── 9. Aplatir en JSON trié ──────────────────────────────────────────────
  const matieresResp = [...arbre.values()]
    .map((m) => ({
      matiere: m.matiere,
      score_eleve: m.score_eleve,
      moyenne_classe: m.moyenne_classe,
      nb_eleves_classe: m.nb_eleves_classe,
      nb_exercices: m.nb_exercices,
      sous_matieres: [...m.sous_matieres.values()]
        .map((sm) => ({
          sous_matiere: sm.sous_matiere,
          score_eleve: sm.score_eleve,
          moyenne_classe: sm.moyenne_classe,
          nb_eleves_classe: sm.nb_eleves_classe,
          nb_exercices: sm.nb_exercices,
          chapitres: [...sm.chapitres.values()].sort((a, b) => a.titre.localeCompare(b.titre)),
        }))
        .sort((a, b) => a.sous_matiere.localeCompare(b.sous_matiere)),
    }))
    .sort((a, b) => a.matiere.localeCompare(b.matiere));

  // Global = tous matières confondues
  const scGlobal = scoreEleve(accGlobal, key3(uid, "_", "_", "_"));
  const mcGlobal = moyenneClasse(accGlobal, "|_|_|_", uid);

  return NextResponse.json({
    eleve: eleveCible,
    periode,
    niveau_compare: niveauCible,
    nb_eleves_classe: pbIdsCohorte.length + rbIdsCohorte.length - 1, // excluant l'élève lui-même
    global: scGlobal.score === null ? null : {
      score_eleve: scGlobal.score,
      moyenne_classe: mcGlobal.moyenne,
      nb_eleves_classe: mcGlobal.nbEleves,
      nb_exercices: scGlobal.nbExercices,
    },
    matieres: matieresResp,
  });
}

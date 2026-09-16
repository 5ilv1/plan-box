/**
 * Socle du suivi enseignant : ce qu'on compte, comment on le range, comment on
 * le note.
 *
 * Un seul module pour éviter que chaque page réinvente sa définition du « taux
 * de complétion ». Trois pages le faisaient chacune à sa façon avant la refonte,
 * et elles ne tombaient pas d'accord.
 *
 * Remplace `lib/suivi-domaines.ts`, qui ne savait classer que 5 types de blocs
 * sur 22 et laissait tomber silencieusement tout le reste.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MATIERES_CANONIQUES,
  MATIERE_LECONS,
  normaliserMatiere,
} from "./matieres-referentiel";

export { normaliserMatiere };

/* ────────────────────────────────────────────────────────────────────────────
   1. Périmètre : ce qui compte dans un taux de complétion
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Les types de blocs qui comptent comme « travail à faire ».
 *
 * Exclus volontairement : les podcasts (`ressource`), les ceintures de
 * multiplication et les cartes à réviser Repetibox. Ce sont des activités
 * d'entraînement libre ou de classe : les compter ferait chuter le taux de
 * complétion d'un élève qui a pourtant fait tout son travail.
 */
export const TYPES_COMPTES = new Set([
  "exercice",
  "qcm",
  "eval",
  "calcul_mental",
  "texte_a_trous",
  "analyse_phrase",
  "classement",
  "comparaison",
  "rangement",
  "dictee",
  "mots",
  "correction_dictee",
  "ecriture",
  "lecture",
  "probleme_maths",
  "fichier_maths",
  "lecon_copier",
]);

/** Exclus : podcasts, ceintures de multiplication, cartes Repetibox, média, libre. */
export function estComptePourCompletion(type: string): boolean {
  return TYPES_COMPTES.has(type);
}

/* ────────────────────────────────────────────────────────────────────────────
   2. Classement par matière
   ──────────────────────────────────────────────────────────────────────────── */

export const NON_CLASSE = "Non classé";

export interface Classement {
  matiere: string;
  sousDomaine: string;
  /**
   * `false` quand le sous-domaine n'est qu'un repli sur le type d'activité
   * (« Exercices », « QCM ») ou « Non classé » : le bloc est comptabilisé, mais
   * on ne sait pas de quoi il parle. C'est ce que
   * `scripts/reparer-matiere-blocs.ts` vient faire préciser.
   */
  precis: boolean;
}

/**
 * Les sous-domaines proposés par matière.
 *
 * Même liste que celle du formulaire de création (`lib/matieres-referentiel.ts`) :
 * le suivi et la saisie doivent parler le même vocabulaire, sinon un exercice
 * rangé en « Numération » à la création ressort en « Nombres » dans le graphe.
 *
 * S'y ajoutent deux compartiments que le formulaire ne propose pas, parce qu'ils
 * ne se choisissent pas : les podcasts et les leçons à copier.
 */
export const SOUS_DOMAINES: Record<string, string[]> = {
  ...MATIERES_CANONIQUES,
  "Lecture": ["Lecture", "Podcasts"],
  [MATIERE_LECONS]: ["Leçon à copier"],
};

export const MATIERES = Object.keys(SOUS_DOMAINES);

/**
 * Correspondance type de bloc → matière, quand le contenu ne dit rien.
 *
 * `plan_travail.chapitre_id` est toujours nul en pratique : impossible de
 * remonter à `chapitres.matiere`. Seuls `exercice` et `ressource` portent un
 * `contenu.matiere`. Pour tout le reste, le type est le seul indice fiable.
 */
const MATIERE_PAR_TYPE: Record<string, Omit<Classement, "precis">> = {
  calcul_mental:  { matiere: "Mathématiques", sousDomaine: "Calcul" },
  comparaison:    { matiere: "Mathématiques", sousDomaine: "Numération" },
  rangement:      { matiere: "Mathématiques", sousDomaine: "Numération" },
  probleme_maths: { matiere: "Mathématiques", sousDomaine: "Problèmes" },
  fichier_maths:  { matiere: "Mathématiques", sousDomaine: "Grandeurs et mesures" },
  dictee:            { matiere: "Français", sousDomaine: "Orthographe" },
  mots:              { matiere: "Français", sousDomaine: "Orthographe" },
  correction_dictee: { matiere: "Français", sousDomaine: "Orthographe" },
  texte_a_trous:     { matiere: "Français", sousDomaine: "Orthographe" },
  analyse_phrase:    { matiere: "Français", sousDomaine: "Grammaire" },
  ecriture:          { matiere: "Français", sousDomaine: "Écriture" },
  lecture:           { matiere: "Lecture",  sousDomaine: "Lecture" },
  ressource:         { matiere: "Lecture",  sousDomaine: "Podcasts" },
  lecon_copier:      { matiere: MATIERE_LECONS, sousDomaine: "Leçon à copier" },
  ceinture_multiplication: { matiere: "Mathématiques", sousDomaine: "Tables ×" },
};

/**
 * Sous-domaine de repli quand le contenu donne la matière mais pas la
 * sous-matière : le type d'activité, qui dit au moins quelque chose.
 * Sans lui on obtenait « Français · Français », une ligne qui n'apprend rien.
 */
const SOUS_DOMAINE_PAR_TYPE: Record<string, string> = {
  exercice: "Exercices",
  qcm: "QCM",
  eval: "Évaluations",
  classement: "Classements",
  lecture: "Lecture",
  ressource: "Podcasts",
};

/**
 * Range un bloc dans une matière et un sous-domaine.
 *
 * `contenu.matiere` fait foi quand il existe — c'est ce que la génération a
 * décidé. Sinon on retombe sur le type. Un bloc qu'on ne sait pas classer part
 * dans « Non classé » et y reste **visible** : mieux vaut une colonne qui
 * interroge qu'une moyenne de français silencieusement polluée par du calcul.
 */
export function matiereDuBloc(
  type: string,
  contenu: Record<string, unknown> | null | undefined
): Classement {
  const brut = contenu?.matiere;
  if (typeof brut === "string") {
    const matiere = normaliserMatiere(brut);
    if (matiere) {
      // La sous-matière saisie fait foi ; à défaut, le type tranche quand il le
      // peut (un calcul mental est du calcul) ; sinon on retombe sur un libellé
      // d'activité, qui ne dit pas de quoi parle l'exercice.
      const sousBrut = contenu?.sous_matiere;
      if (typeof sousBrut === "string" && sousBrut.trim()) {
        return { matiere, sousDomaine: sousBrut.trim(), precis: true };
      }
      const parType = MATIERE_PAR_TYPE[type]?.sousDomaine;
      if (parType) return { matiere, sousDomaine: parType, precis: true };
      return { matiere, sousDomaine: SOUS_DOMAINE_PAR_TYPE[type] ?? matiere, precis: false };
    }
  }
  const parType = MATIERE_PAR_TYPE[type];
  if (parType) return { ...parType, precis: true };
  return { matiere: NON_CLASSE, sousDomaine: NON_CLASSE, precis: false };
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Scores
   ──────────────────────────────────────────────────────────────────────────── */

export interface ScoreBloc {
  /** % au premier essai — la note honnête, celle qui dit si la leçon est passée. */
  pctPremier: number | null;
  /** % au dernier essai — ce que l'élève finit par obtenir. */
  pctFinal: number | null;
  tentatives: number;
  /** Nombre de questions du bloc, pour calculer un rythme. */
  nbQuestions: number | null;
}

function pourcentage(score: unknown, total: unknown): number | null {
  if (typeof score !== "number" || typeof total !== "number") return null;
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((score / total) * 100);
}

/**
 * Nombre d'items **notés** d'un bloc — l'unité du rythme.
 *
 * Le total du score fait foi, parce que c'est exactement ce sur quoi l'élève a
 * été évalué. Les tableaux du contenu ne servent que de repli, pour les blocs
 * sans note.
 *
 * L'ordre compte : une analyse de phrase porte 5 phrases mais 24 groupes à
 * identifier, et c'est sur 24 qu'elle est notée. Compter les phrases donnait
 * « 23 s par question » là où l'élève passait 4,8 s par item — et surtout, le
 * seuil de bâclage (5 s) aurait voulu dire une chose pour une phrase et une
 * autre pour un trou de texte. L'unité doit être la même partout pour qu'un
 * seuil unique ait un sens.
 */
export function nbQuestionsBloc(contenu: Record<string, unknown> | null | undefined): number | null {
  if (!contenu) return null;
  const total = contenu.premier_score_total ?? contenu.score_total;
  if (typeof total === "number" && total > 0) return total;
  for (const cle of ["questions", "calculs", "trous", "paires", "items", "series", "phrases", "qcm"]) {
    const v = contenu[cle];
    if (Array.isArray(v) && v.length > 0) return v.length;
  }
  return null;
}

export function scoreBloc(contenu: Record<string, unknown> | null | undefined): ScoreBloc {
  const tentativesBrut = contenu?.nb_tentatives;
  return {
    pctPremier: pourcentage(contenu?.premier_score, contenu?.premier_score_total),
    pctFinal: pourcentage(contenu?.score_eleve, contenu?.score_total),
    tentatives: typeof tentativesBrut === "number" && tentativesBrut > 0 ? tentativesBrut : 1,
    nbQuestions: nbQuestionsBloc(contenu),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   4. Durée et bâclage
   ──────────────────────────────────────────────────────────────────────────── */

/** Au-delà, c'est une tablette laissée ouverte, pas un élève au travail. */
export const DUREE_MAX_SECONDES = 7200;

/** Sous ce rythme, l'élève n'a pas pu lire l'énoncé. */
export const SECONDES_PAR_QUESTION_SUSPECT = 5;

/** En dessous de ce score au premier essai, un rythme éclair n'est plus de l'aisance. */
export const SCORE_BACLAGE = 50;

/** Champs à écrire quand un bloc passe à « fait ». */
export function champsTerminaison(dureeSecondes?: number | null): {
  termine_le: string;
  duree_secondes: number | null;
} {
  let duree: number | null = null;
  if (typeof dureeSecondes === "number" && Number.isFinite(dureeSecondes) && dureeSecondes >= 0) {
    duree = Math.min(Math.round(dureeSecondes), DUREE_MAX_SECONDES);
  }
  return { termine_le: new Date().toISOString(), duree_secondes: duree };
}

/**
 * Champs à écrire quand un bloc est remis à faire.
 * Sans ça, un bloc rendu à l'élève garderait la durée de la fois précédente.
 */
export function champsReprise(): { termine_le: null; duree_secondes: null } {
  return { termine_le: null, duree_secondes: null };
}

/** Secondes par question, `null` si le bloc n'a pas été chronométré. */
export function rythme(
  dureeSecondes: number | null | undefined,
  nbQuestions: number | null | undefined
): number | null {
  if (typeof dureeSecondes !== "number" || dureeSecondes <= 0) return null;
  if (typeof nbQuestions !== "number" || nbQuestions <= 0) return null;
  return Math.round((dureeSecondes / nbQuestions) * 10) / 10;
}

/**
 * Le bloc a-t-il été expédié ?
 *
 * Il faut **les deux** signaux : un rythme éclair ET un score bas. Un élève
 * rapide et juste n'est pas un élève qui bâcle — accuser sur la seule vitesse
 * reviendrait à pénaliser les bons.
 */
export function signalBaclage(
  dureeSecondes: number | null | undefined,
  nbQuestions: number | null | undefined,
  pctPremier: number | null
): boolean {
  const r = rythme(dureeSecondes, nbQuestions);
  if (r === null || pctPremier === null) return false;
  return r < SECONDES_PAR_QUESTION_SUSPECT && pctPremier < SCORE_BACLAGE;
}

/* ────────────────────────────────────────────────────────────────────────────
   5. Lecture paginée
   ──────────────────────────────────────────────────────────────────────────── */

/** PostgREST plafonne toute lecture à 1000 lignes ; un trimestre dépasse ce seuil. */
const TAILLE_PAGE = 1000;

export interface BlocSuivi {
  id: string;
  type: string;
  titre: string;
  statut: string;
  contenu: Record<string, unknown> | null;
  date_assignation: string;
  date_limite: string | null;
  periodicite: string | null;
  groupe_label: string | null;
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  chapitre_id: string | null;
  termine_le: string | null;
  duree_secondes: number | null;
}

const COLONNES_BLOC =
  "id, type, titre, statut, contenu, date_assignation, date_limite, periodicite, " +
  "groupe_label, eleve_id, repetibox_eleve_id, chapitre_id, termine_le, duree_secondes";

/**
 * Charge les blocs d'une période, en paginant.
 *
 * Un `select` simple s'arrêterait à 1000 lignes sans le dire : sur un trimestre,
 * des semaines entières disparaîtraient du calcul et le taux de complétion
 * serait faux sans qu'aucune erreur ne remonte.
 */
export async function chargerBlocs(
  admin: SupabaseClient,
  filtres: { debut: string; fin: string; types?: string[] }
): Promise<BlocSuivi[]> {
  const tout: BlocSuivi[] = [];
  for (let page = 0; ; page++) {
    let q = admin
      .from("plan_travail")
      .select(COLONNES_BLOC)
      .gte("date_assignation", filtres.debut)
      .lte("date_assignation", filtres.fin)
      .order("date_assignation", { ascending: true })
      .order("id", { ascending: true })
      .range(page * TAILLE_PAGE, (page + 1) * TAILLE_PAGE - 1);
    if (filtres.types?.length) q = q.in("type", filtres.types);

    const { data, error } = await q;
    if (error) throw new Error(`chargerBlocs: ${error.message}`);
    const lot = (data ?? []) as unknown as BlocSuivi[];
    tout.push(...lot);
    if (lot.length < TAILLE_PAGE) return tout;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   6. Identité des élèves
   ──────────────────────────────────────────────────────────────────────────── */

/** `pb_<uuid>` ou `rb_<id>` — les deux sources d'élèves cohabitent partout. */
export function uidDuBloc(bloc: {
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
}): string | null {
  if (bloc.eleve_id) return `pb_${bloc.eleve_id}`;
  if (bloc.repetibox_eleve_id !== null) return `rb_${bloc.repetibox_eleve_id}`;
  return null;
}

export function decouperUid(uid: string): { source: "planbox" | "repetibox"; id: string } | null {
  if (uid.startsWith("pb_")) return { source: "planbox", id: uid.slice(3) };
  if (uid.startsWith("rb_")) return { source: "repetibox", id: uid.slice(3) };
  return null;
}

export interface EleveSuivi {
  uid: string;
  source: "planbox" | "repetibox";
  prenom: string;
  nom: string;
  niveau: string;
}

export const NIVEAUX = ["CE2", "CM1", "CM2"] as const;
const NIVEAUX_VALIDES = new Set<string>(NIVEAUX);
const ORDRE_NIVEAUX: Record<string, number> = { CE2: 1, CM1: 2, CM2: 3 };

/**
 * Identité et niveau des élèves des deux sources.
 *
 * Le niveau d'un élève Repetibox n'est pas une colonne : il se lit dans le nom
 * de son groupe, à condition que ce nom soit CE2, CM1 ou CM2. Un élève d'un
 * groupe « Ateliers » n'a donc pas de niveau, et affiche « — ».
 */
export async function chargerEleves(admin: SupabaseClient): Promise<EleveSuivi[]> {
  const [pbRes, rbRes, egRes] = await Promise.all([
    admin.from("eleves").select("id, prenom, nom, niveaux(nom)"),
    admin.from("eleve").select("id, prenom, nom"),
    admin.from("eleve_groupe").select("planbox_eleve_id, repetibox_eleve_id, groupes(nom)"),
  ]);

  const niveauParUid = new Map<string, string>();
  for (const eg of (egRes.data ?? []) as Array<Record<string, unknown>>) {
    const nom = (eg.groupes as { nom?: string } | null)?.nom ?? "";
    if (!NIVEAUX_VALIDES.has(nom)) continue;
    const pb = eg.planbox_eleve_id as string | null;
    const rb = eg.repetibox_eleve_id as number | null;
    if (pb) niveauParUid.set(`pb_${pb}`, nom);
    if (rb !== null && rb !== undefined) niveauParUid.set(`rb_${rb}`, nom);
  }

  const eleves: EleveSuivi[] = [];
  for (const e of (pbRes.data ?? []) as Array<Record<string, unknown>>) {
    const uid = `pb_${e.id as string}`;
    eleves.push({
      uid,
      source: "planbox",
      prenom: (e.prenom as string) ?? "",
      nom: (e.nom as string) ?? "",
      niveau: (e.niveaux as { nom?: string } | null)?.nom ?? niveauParUid.get(uid) ?? "—",
    });
  }
  for (const e of (rbRes.data ?? []) as Array<Record<string, unknown>>) {
    const uid = `rb_${e.id as number}`;
    eleves.push({
      uid,
      source: "repetibox",
      prenom: (e.prenom as string) ?? "",
      nom: (e.nom as string) ?? "",
      niveau: niveauParUid.get(uid) ?? "—",
    });
  }

  return eleves.sort((a, b) => {
    const oa = ORDRE_NIVEAUX[a.niveau] ?? 99;
    const ob = ORDRE_NIVEAUX[b.niveau] ?? 99;
    return oa !== ob ? oa - ob : a.prenom.localeCompare(b.prenom, "fr");
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   7. Agrégation
   ──────────────────────────────────────────────────────────────────────────── */

export interface Completion {
  faits: number;
  total: number;
  pct: number | null;
}

export function completion(blocs: Array<{ statut: string }>): Completion {
  const total = blocs.length;
  if (total === 0) return { faits: 0, total: 0, pct: null };
  const faits = blocs.filter((b) => b.statut === "fait").length;
  return { faits, total, pct: Math.round((faits / total) * 100) };
}

/** Un bloc est en retard s'il n'est pas fait et que sa date est passée. */
export function estEnRetard(bloc: BlocSuivi, aujourdhui: string): boolean {
  if (bloc.statut === "fait") return false;
  const echeance = bloc.date_limite ?? bloc.date_assignation;
  return echeance < aujourdhui;
}

export interface AgregatMatiere {
  matiere: string;
  sousDomaine: string;
  nbBlocs: number;
  pctPremier: number | null;
  pctFinal: number | null;
  secondesParQuestion: number | null;
  nbBacles: number;
}

/**
 * Réussite par sous-domaine, pondérée par le nombre de questions.
 *
 * Pondérer plutôt que faire la moyenne des pourcentages : sinon un calcul mental
 * de 20 questions pèse autant qu'un exercice de 3, et un élève peut faire chuter
 * sa moyenne en ratant un mini-bloc.
 */
export function agregerParMatiere(blocs: BlocSuivi[]): AgregatMatiere[] {
  interface Cumul {
    matiere: string;
    sousDomaine: string;
    nbBlocs: number;
    premierScore: number;
    premierTotal: number;
    finalScore: number;
    finalTotal: number;
    duree: number;
    questionsChronometrees: number;
    nbBacles: number;
  }
  const cumuls = new Map<string, Cumul>();

  for (const b of blocs) {
    if (b.statut !== "fait") continue;
    if (!estComptePourCompletion(b.type)) continue;

    const { matiere, sousDomaine } = matiereDuBloc(b.type, b.contenu);
    const cle = `${matiere}|${sousDomaine}`;
    let c = cumuls.get(cle);
    if (!c) {
      c = {
        matiere, sousDomaine, nbBlocs: 0,
        premierScore: 0, premierTotal: 0, finalScore: 0, finalTotal: 0,
        duree: 0, questionsChronometrees: 0, nbBacles: 0,
      };
      cumuls.set(cle, c);
    }
    c.nbBlocs++;

    const contenu = b.contenu ?? {};
    const ps = contenu.premier_score, pt = contenu.premier_score_total;
    if (typeof ps === "number" && typeof pt === "number" && pt > 0) {
      c.premierScore += ps;
      c.premierTotal += pt;
    }
    const fs = contenu.score_eleve, ft = contenu.score_total;
    if (typeof fs === "number" && typeof ft === "number" && ft > 0) {
      c.finalScore += fs;
      c.finalTotal += ft;
    }

    const s = scoreBloc(b.contenu);
    if (b.duree_secondes && s.nbQuestions) {
      c.duree += b.duree_secondes;
      c.questionsChronometrees += s.nbQuestions;
      if (signalBaclage(b.duree_secondes, s.nbQuestions, s.pctPremier)) c.nbBacles++;
    }
  }

  return [...cumuls.values()]
    .map((c) => ({
      matiere: c.matiere,
      sousDomaine: c.sousDomaine,
      nbBlocs: c.nbBlocs,
      pctPremier: c.premierTotal > 0 ? Math.round((c.premierScore / c.premierTotal) * 100) : null,
      pctFinal: c.finalTotal > 0 ? Math.round((c.finalScore / c.finalTotal) * 100) : null,
      secondesParQuestion: rythme(c.duree, c.questionsChronometrees),
      nbBacles: c.nbBacles,
    }))
    .sort((a, b) =>
      a.matiere === b.matiere
        ? a.sousDomaine.localeCompare(b.sousDomaine, "fr")
        : a.matiere.localeCompare(b.matiere, "fr")
    );
}

/* ────────────────────────────────────────────────────────────────────────────
   8. Périodes
   ──────────────────────────────────────────────────────────────────────────── */

export type Periode = "jour" | "semaine" | "mois" | "trimestre";

/** Date du jour à Paris — pas en UTC, sinon la journée bascule à 2 h du matin. */
export function dateDuJour(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Formate une `Date` sans passer par `toISOString()`, qui recule d'un jour en France. */
export function formaterDate(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/** Lundi de la semaine contenant `date` (format "YYYY-MM-DD"). */
export function lundiDe(date: string): string {
  const d = new Date(date + "T12:00:00");
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  return formaterDate(d);
}

export function decalerJours(date: string, jours: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + jours);
  return formaterDate(d);
}

export interface Bornes {
  debut: string;
  fin: string;
  label: string;
}

export function bornesPeriode(periode: Periode, reference = dateDuJour()): Bornes {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", opts);

  if (periode === "jour") {
    return {
      debut: reference,
      fin: reference,
      label: fmt(reference, { weekday: "long", day: "numeric", month: "long" }),
    };
  }
  if (periode === "semaine") {
    const lundi = lundiDe(reference);
    const dimanche = decalerJours(lundi, 6);
    return {
      debut: lundi,
      fin: dimanche,
      label: `Semaine du ${fmt(lundi, { day: "numeric", month: "long" })}`,
    };
  }
  if (periode === "mois") {
    const debut = decalerJours(reference, -29);
    return { debut, fin: reference, label: "30 derniers jours" };
  }
  const debut = decalerJours(reference, -89);
  return { debut, fin: reference, label: "Trimestre" };
}

/** Période précédente de même longueur, pour les deltas des tuiles KPI. */
export function bornesPrecedentes(bornes: Bornes): { debut: string; fin: string } {
  const debut = new Date(bornes.debut + "T12:00:00");
  const fin = new Date(bornes.fin + "T12:00:00");
  const jours = Math.round((fin.getTime() - debut.getTime()) / 86400000) + 1;
  return {
    debut: decalerJours(bornes.debut, -jours),
    fin: decalerJours(bornes.debut, -1),
  };
}

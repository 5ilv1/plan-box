/**
 * Le pont entre la programmation Notion de l'enseignant et le vocabulaire de
 * PlanBox.
 *
 * La base « Programmation année en cours » décrit des **séances de classe** ;
 * PlanBox fabrique des **exercices**. Les deux parlent de matières et de
 * domaines, mais pas avec les mêmes mots :
 *
 *   Notion                         PlanBox
 *   ─────────────────────────      ────────────────────────
 *   Matière : Maths CM             Mathématiques
 *   Matière : EDL                  Français
 *   Discipline : Production d'écrits   Écriture
 *   titre « … · a / à »            Orthographe   ← pas de Discipline pour elle
 *   titre « (N3 · fiche 16) »      Numération
 *
 * Ce module est **pur** : aucun accès réseau, aucune base. Il se teste seul
 * (`docs/tests/test-seances-traduction.mjs`), ce qui compte : c'est lui qui
 * décide dans quel sous-domaine du suivi atterriront les exercices engendrés.
 * Une erreur ici se retrouverait en silence dans le graphe de réussite.
 */

import { MATIERES_CANONIQUES } from "./matieres-referentiel";

/* ────────────────────────────────────────────────────────────────────────────
   1. Ce que Notion nous donne
   ──────────────────────────────────────────────────────────────────────────── */

export interface SeanceNotion {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  titre: string;
  objectifs: string;
  /** Valeurs brutes de la propriété « Matière ». */
  matieresNotion: string[];
  /** Valeurs brutes de la propriété « Discipline » — renseignée pour l'EDL seulement. */
  disciplines: string[];
  /** CE2 / CM1 / CM2 / CM */
  niveaux: string[];
  /** Le texte étudié dans la semaine, extrait du corps de la page (français). */
  corpus: string | null;
  /** Ligne « Différenciation : ★☆☆ tous · ★★☆ CM1 et CM2 · ★★★ CM2 ». */
  differenciationBrute: string | null;
}

/** Une séance traduite, éclatée par niveau : ce que l'écran manipule. */
export interface SeanceTraduite {
  seanceId: string;
  /** 0 pour la notion principale, 1 pour le second volet (l'orthographe). */
  volet: number;
  date: string;
  /** 0 = lundi … 4 = vendredi */
  jour: number;
  titre: string;
  objectifs: string;
  corpus: string | null;

  matiere: string;
  sousMatiere: string;
  /** `true` quand le sous-domaine est déduit faute de mieux — à faire confirmer. */
  sousMatiereIncertaine: boolean;

  niveau: string;
  difficulte: Difficulte;
  estEvaluation: boolean;
  typesSuggeres: string[];
}

export type Difficulte = "facile" | "moyen" | "difficile";

/* ────────────────────────────────────────────────────────────────────────────
   2. Les matières retenues — maths et français seulement
   ──────────────────────────────────────────────────────────────────────────── */

const MATHS = "Mathématiques";
const FRANCAIS = "Français";

/**
 * Valeurs de la propriété « Matière » que l'on sait traiter.
 *
 * Histoire, géographie, sciences, anglais et arts restent manuels : leurs
 * séances ne se transforment pas en exercice auto-corrigé.
 */
const MATIERE_NOTION: Record<string, string> = {
  "maths": MATHS,
  "maths cm": MATHS,
  "problème": MATHS,
  "probleme": MATHS,
  "edl": FRANCAIS,
  "lecture ce2": FRANCAIS,
  "lecture cm": FRANCAIS,
  "lecture cm1": FRANCAIS,
  "lecture cm2": FRANCAIS,
};

/** La séance relève-t-elle du périmètre maths / français ? */
export function matiereDeLaSeance(matieresNotion: string[]): string | null {
  for (const m of matieresNotion) {
    const trouve = MATIERE_NOTION[m.trim().toLowerCase()];
    if (trouve) return trouve;
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Le sous-domaine
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * `Discipline` → sous-matière PlanBox.
 *
 * ⚠️ La liste Notion n'a que cinq valeurs et **aucune Orthographe** : une
 * séance d'orthographe y est rangée en Grammaire. Ce n'est pas un choix de ce
 * module, c'est la base qui est ainsi — d'où le drapeau d'incertitude posé sur
 * Grammaire, pour que l'écran invite à confirmer.
 */
const DISCIPLINE_NOTION: Record<string, string> = {
  "conjugaison": "Conjugaison",
  "grammaire": "Grammaire",
  "lecture": "Lecture",
  "vocabulaire": "Vocabulaire",
  "production d'écrits": "Écriture",
  "production d’écrits": "Écriture", // apostrophe typographique
  "production d'ecrits": "Écriture",
};

/**
 * Code de chapitre iParcours, lu dans le titre des séances de maths CM :
 * « … Représenter des fractions par des aires (N3 · fiche 16) », et
 * « … ÉVALUATION G1 : Éléments de géométrie » pour les bilans.
 */
const CODE_CHAPITRE: Record<string, string> = {
  N: "Numération",
  C: "Calcul",
  G: "Géométrie",
  M: "Grandeurs et mesures",
  D: "Organisation et gestion de données",
  P: "Problèmes",
};

/** Extrait le code de chapitre d'un titre de séance de maths, s'il y en a un. */
export function codeChapitre(titre: string): string | null {
  // Deux formes attestées : « (N3 · fiche 16) » et « ÉVALUATION G1 : … »
  const m =
    titre.match(/\(\s*([A-Z])\s*\d+\s*[·.]/) ??
    titre.match(/(?:ÉVALUATION|EVALUATION)\s+([A-Z])\s*\d+/i);
  const lettre = m?.[1]?.toUpperCase();
  return lettre && CODE_CHAPITRE[lettre] ? CODE_CHAPITRE[lettre] : null;
}

/**
 * Une séance de bilan ne doit pas devenir un devoir du soir.
 *
 * Les accents sont retirés avant le test : en JavaScript, `\b` se définit sur
 * `[A-Za-z0-9_]`, donc « É » n'est pas un caractère de mot et `\bÉVALUATION`
 * ne peut jamais s'amorcer après une espace.
 */
export function estEvaluation(titre: string): boolean {
  const sansAccent = titre.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(EVALUATION|BILAN)\b/i.test(sansAccent);
}

export interface SousDomaine {
  sousMatiere: string;
  incertaine: boolean;
}

/**
 * Le sous-domaine d'une séance, et la confiance qu'on lui accorde.
 *
 * Un seul cas reste marqué incertain : une séance de maths sans code de
 * chapitre (les 27 séances de CE2), où le sous-domaine est un pur repli.
 * La grammaire ne l'est plus — l'orthographe qui s'y cachait est maintenant
 * extraite en volet à part, voir `decouperVolets()`.
 */
export function sousDomaineDeLaSeance(
  matiere: string,
  disciplines: string[],
  titre: string
): SousDomaine {
  if (matiere === FRANCAIS) {
    for (const d of disciplines) {
      const trouve = DISCIPLINE_NOTION[d.trim().toLowerCase()];
      if (trouve) return { sousMatiere: trouve, incertaine: false };
    }
    // Une séance de lecture peut n'avoir que sa Matière, sans Discipline.
    if (/lecture/i.test(titre)) return { sousMatiere: "Lecture", incertaine: false };
    // Ni Discipline ni indice dans le titre : on ne sait pas, et on le dit.
    return { sousMatiere: "Grammaire", incertaine: true };
  }

  const code = codeChapitre(titre);
  if (code) return { sousMatiere: code, incertaine: false };
  return { sousMatiere: "Numération", incertaine: true };
}

/* ────────────────────────────────────────────────────────────────────────────
   3 bis. Les deux notions d'une même séance
   ──────────────────────────────────────────────────────────────────────────── */

/** Un volet : un sous-domaine de la séance, avec ce qui le concerne. */
export interface Volet {
  sousMatiere: string;
  incertaine: boolean;
  titre: string;
  objectifs: string;
}

/** L'étiquette de discipline en tête de titre : « Grammaire - … ». */
const ETIQUETTE_EDL =
  /^\s*(Grammaire|Conjugaison|Vocabulaire|Lecture|Orthographe|Production d['’]écrits)\s*[-–—]\s*/i;

/**
 * Les séances de grammaire portent **deux** notions, pas une.
 *
 * L'enseignant les écrit dans le titre, séparées par « · » :
 *   « Grammaire - Les types de phrases · a / à »
 *   « Grammaire - La forme négative · son/sont · on/ont · -ent »
 * Le premier segment est la notion de grammaire ; tout ce qui suit est de
 * l'orthographe — homophones, marques d'accord. Notion ne peut pas le dire :
 * sa propriété `Discipline` ne porte qu'une valeur, et n'offre pas Orthographe.
 *
 * Tout ranger sous « Grammaire » avait deux effets, l'un visible et l'autre
 * pas : on n'engendrait qu'un exercice sur les deux notions travaillées, et
 * l'orthographe disparaissait du suivi par sous-domaine. D'où **deux lignes**,
 * chacune avec son titre, son objectif et ses propres types suggérés.
 */
export function decouperVolets(
  matiere: string,
  disciplines: string[],
  titre: string,
  objectifs: string
): Volet[] {
  const base = sousDomaineDeLaSeance(matiere, disciplines, titre);
  const seul = [{ ...base, titre, objectifs }];
  if (matiere !== FRANCAIS || base.sousMatiere !== "Grammaire") return seul;

  const etiquette = titre.match(ETIQUETTE_EDL)?.[0] ?? "";
  const segments = titre
    .slice(etiquette.length)
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 2) return seul;

  const [notion, ...ortho] = segments;
  const { vises, autres } = repartirObjectifs(objectifs, ortho);

  return [
    {
      sousMatiere: "Grammaire",
      incertaine: false,
      titre: `Grammaire - ${notion}`,
      objectifs: autres || notion,
    },
    {
      sousMatiere: "Orthographe",
      incertaine: false,
      titre: `Orthographe - ${ortho.join(" · ")}`,
      objectifs: vises || ortho.join(" · "),
    },
  ];
}

/** Pour rapprocher un bout de titre d'un bout d'objectif : « a / à » = « a/à ». */
function normaliserPourComparer(s: string): string {
  return s.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

/**
 * Sépare les objectifs : ce qui parle des notions visées, et le reste.
 *
 * L'enseignant écrit un objectif par notion, ponctués par « . » ou « ; » —
 * « La forme négative ; les homophones son/sont et on/ont ; la marque -ent. »
 * Une proposition qui cite une notion lui revient ; les autres restent au
 * premier volet. Un partage qui ne donne rien laisse l'appelant retomber sur
 * le titre, qui dit déjà l'essentiel.
 *
 * Cas fréquent : l'objectif recopie le titre, « · » compris. Le séparateur y
 * veut dire la même chose qu'au titre, on le lit pareil — sans quoi la ligne
 * d'orthographe hériterait aussi de la notion de grammaire.
 */
function repartirObjectifs(objectifs: string, notions: string[]) {
  if (objectifs.includes("·")) {
    const [premier, ...suite] = objectifs.split("·").map((s) => s.trim()).filter(Boolean);
    return { vises: recoller(suite), autres: recoller(premier ? [premier] : []) };
  }

  const cibles = notions.map(normaliserPourComparer).filter((c) => c.length >= 2);
  const propositions = objectifs
    .split(/(?<=\.)\s+|\s*;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const vises: string[] = [];
  const autres: string[] = [];
  for (const p of propositions) {
    const n = normaliserPourComparer(p);
    (cibles.some((c) => n.includes(c)) ? vises : autres).push(p);
  }
  return { vises: recoller(vises), autres: recoller(autres) };
}

/** Recolle des propositions en une phrase, sans doubler la ponctuation. */
function recoller(propositions: string[]): string {
  if (propositions.length === 0) return "";
  return `${propositions.map((p) => p.replace(/[.;]\s*$/, "")).join(". ")}.`;
}

/* ────────────────────────────────────────────────────────────────────────────
   4. Niveaux et différenciation
   ──────────────────────────────────────────────────────────────────────────── */

export const NIVEAUX = ["CE2", "CM1", "CM2"] as const;

/** « CM » désigne le groupe des deux cours moyens réunis. */
export function niveauxReels(niveauxNotion: string[]): string[] {
  const out = new Set<string>();
  for (const n of niveauxNotion) {
    const v = n.trim().toUpperCase();
    if (v === "CM") { out.add("CM1"); out.add("CM2"); }
    else if ((NIVEAUX as readonly string[]).includes(v)) out.add(v);
  }
  return [...out].sort();
}

/**
 * Difficulté par niveau, lue dans la ligne de différenciation du corps de page.
 *
 * Format constant sur les 12 pages sondées :
 *   « Différenciation : ★☆☆ tous · ★★☆ CM1 et CM2 · ★★★ CM2 »
 *
 * On compte les étoiles pleines de chaque segment et on retient, pour un
 * niveau, le segment le plus exigeant qui le mentionne — « tous » valant pour
 * les trois. Sans ligne exploitable, on retombe sur la progression naturelle
 * CE2 → CM2, qui vaut mieux qu'une difficulté uniforme.
 */
export function difficultePourNiveau(ligne: string | null, niveau: string): Difficulte {
  const parDefaut: Record<string, Difficulte> =
    { CE2: "facile", CM1: "moyen", CM2: "difficile" };

  if (!ligne) return parDefaut[niveau] ?? "moyen";

  let etoilesMax = 0;
  for (const segment of ligne.split("·")) {
    const etoiles = (segment.match(/★/g) ?? []).length;
    if (etoiles === 0) continue;
    const vise = /tous/i.test(segment) || segment.toUpperCase().includes(niveau);
    if (vise && etoiles > etoilesMax) etoilesMax = etoiles;
  }

  if (etoilesMax >= 3) return "difficile";
  if (etoilesMax === 2) return "moyen";
  if (etoilesMax === 1) return "facile";
  return parDefaut[niveau] ?? "moyen";
}

/* ────────────────────────────────────────────────────────────────────────────
   5. Quel type d'activité proposer
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Types PlanBox pertinents pour un sous-domaine, le plus adapté en premier.
 *
 * C'est une proposition, pas une règle : l'écran laisse toujours choisir.
 *
 * Deux types en sont absents alors qu'ils seraient parfois les plus justes,
 * parce qu'une séance ne suffit pas à les piloter :
 *   - `classement` exige des catégories (« apparence » / « caractère »), qu'aucun
 *     champ de la programmation ne fournit ;
 *   - `ecriture` tire son sujet d'un générateur de thèmes indépendant et
 *     ignorerait l'objectif de la séance.
 * Ils restent accessibles par la création manuelle.
 */
const TYPES_PAR_SOUS_DOMAINE: Record<string, string[]> = {
  "Conjugaison": ["texte_a_trous", "exercice", "qcm"],
  "Grammaire": ["analyse_phrase", "exercice", "qcm"],
  "Orthographe": ["texte_a_trous", "exercice", "qcm"],
  "Vocabulaire": ["qcm", "exercice"],
  "Lecture": ["lecture", "qcm"],
  "Écriture": ["exercice", "qcm"],
  "Numération": ["exercice", "comparaison", "rangement"],
  "Calcul": ["calcul_mental", "exercice"],
  "Géométrie": ["exercice", "qcm"],
  "Grandeurs et mesures": ["exercice", "qcm"],
  "Problèmes": ["probleme_maths", "exercice"],
  "Organisation et gestion de données": ["probleme_maths", "exercice"],
};

/**
 * Tous les types pilotables depuis une séance, dans l'ordre de la liste.
 * Ce qui n'est pas suggéré reste atteignable : voir plus bas pourquoi.
 */
const TYPES_PILOTABLES = [
  "exercice", "qcm", "texte_a_trous", "analyse_phrase", "lecture",
  "calcul_mental", "probleme_maths", "comparaison", "rangement", "eval",
];

/**
 * Les types proposés pour un sous-domaine : les plus adaptés d'abord, **puis
 * tous les autres**.
 *
 * Ne proposer que les deux ou trois types « justes » rendait le reste
 * inatteignable : un enseignant qui voulait du calcul mental sur une séance de
 * numération n'avait aucun moyen de le demander. La suggestion guide, elle ne
 * doit pas enfermer.
 */
export function typesSuggeres(sousMatiere: string, evaluation: boolean): string[] {
  const adaptes = TYPES_PAR_SOUS_DOMAINE[sousMatiere] ?? ["exercice", "qcm"];
  const tete = evaluation ? ["eval", ...adaptes] : adaptes;
  const reste = TYPES_PILOTABLES.filter((t) => !tete.includes(t));
  return [...tete, ...reste];
}

/* ────────────────────────────────────────────────────────────────────────────
   6. La traduction complète
   ──────────────────────────────────────────────────────────────────────────── */

/** Jours ouvrés depuis le lundi. Renvoie -1 pour une date hors semaine. */
export function jourDepuisLundi(date: string, lundi: string): number {
  const d = new Date(date + "T12:00:00").getTime();
  const l = new Date(lundi + "T12:00:00").getTime();
  const jours = Math.round((d - l) / 86400000);
  return jours >= 0 && jours <= 4 ? jours : -1;
}

/**
 * Une séance Notion → autant de lignes que de niveaux concernés.
 *
 * Une séance donne une ligne **par niveau et par volet**. Les maths sont déjà
 * séparées par niveau dans la programmation : une ligne. Le français est tagué
 * CE2 + CM, donc trois — c'est la différenciation que l'enseignant pratique
 * déjà en classe. Et une séance de grammaire qui porte aussi de l'orthographe
 * en donne six : deux notions × trois niveaux.
 *
 * Renvoie un tableau vide si la séance sort du périmètre maths / français.
 */
export function traduireSeance(s: SeanceNotion, lundi: string): SeanceTraduite[] {
  const matiere = matiereDeLaSeance(s.matieresNotion);
  if (!matiere) return [];

  const jour = jourDepuisLundi(s.date, lundi);
  if (jour < 0) return [];

  const evaluation = estEvaluation(s.titre);
  const volets = decouperVolets(matiere, s.disciplines, s.titre, s.objectifs);
  const niveaux = niveauxReels(s.niveaux);

  return volets.flatMap((v, volet) =>
    niveaux.map((niveau) => ({
      seanceId: s.id,
      volet,
      date: s.date,
      jour,
      titre: v.titre,
      objectifs: v.objectifs,
      corpus: s.corpus,
      matiere,
      sousMatiere: v.sousMatiere,
      sousMatiereIncertaine: v.incertaine,
      niveau,
      difficulte: difficultePourNiveau(s.differenciationBrute, niveau),
      estEvaluation: evaluation,
      typesSuggeres: typesSuggeres(v.sousMatiere, evaluation),
    }))
  );
}

/** Garde-fou : le sous-domaine proposé existe-t-il dans le référentiel ? */
export function sousDomaineConnu(matiere: string, sousMatiere: string): boolean {
  return (MATIERES_CANONIQUES[matiere] ?? []).includes(sousMatiere);
}

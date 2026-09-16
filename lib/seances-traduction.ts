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
 *   (rien)                         Orthographe   ← n'existe pas côté Notion
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
 * Deux cas sont marqués incertains, parce qu'ils se tromperont parfois et
 * qu'une erreur ici pollue le suivi par sous-domaine sans laisser de trace :
 *   - une séance de maths sans code de chapitre (les 27 séances de CE2) ;
 *   - une séance de grammaire, qui peut en réalité être de l'orthographe.
 */
export function sousDomaineDeLaSeance(
  matiere: string,
  disciplines: string[],
  titre: string
): SousDomaine {
  if (matiere === FRANCAIS) {
    for (const d of disciplines) {
      const trouve = DISCIPLINE_NOTION[d.trim().toLowerCase()];
      // La grammaire absorbe l'orthographe faute d'option côté Notion.
      if (trouve) return { sousMatiere: trouve, incertaine: trouve === "Grammaire" };
    }
    // Une séance de lecture peut n'avoir que sa Matière, sans Discipline.
    if (/lecture/i.test(titre)) return { sousMatiere: "Lecture", incertaine: false };
    return { sousMatiere: "Grammaire", incertaine: true };
  }

  const code = codeChapitre(titre);
  if (code) return { sousMatiere: code, incertaine: false };
  return { sousMatiere: "Numération", incertaine: true };
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

export function typesSuggeres(sousMatiere: string, evaluation: boolean): string[] {
  const types = TYPES_PAR_SOUS_DOMAINE[sousMatiere] ?? ["exercice", "qcm"];
  // Une séance de bilan s'envoie en évaluation, mais on garde les autres types
  // à portée : l'enseignant peut préférer un entraînement de révision.
  return evaluation ? ["eval", ...types] : types;
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
 * Les maths sont déjà séparées par niveau dans la programmation : une séance
 * donne une ligne. Le français est tagué CE2 + CM : une séance en donne trois,
 * avec des difficultés différentes — c'est la différenciation que l'enseignant
 * pratique déjà en classe.
 *
 * Renvoie un tableau vide si la séance sort du périmètre maths / français.
 */
export function traduireSeance(s: SeanceNotion, lundi: string): SeanceTraduite[] {
  const matiere = matiereDeLaSeance(s.matieresNotion);
  if (!matiere) return [];

  const jour = jourDepuisLundi(s.date, lundi);
  if (jour < 0) return [];

  const { sousMatiere, incertaine } = sousDomaineDeLaSeance(matiere, s.disciplines, s.titre);
  const evaluation = estEvaluation(s.titre);
  const types = typesSuggeres(sousMatiere, evaluation);

  return niveauxReels(s.niveaux).map((niveau) => ({
    seanceId: s.id,
    date: s.date,
    jour,
    titre: s.titre,
    objectifs: s.objectifs,
    corpus: s.corpus,
    matiere,
    sousMatiere,
    sousMatiereIncertaine: incertaine,
    niveau,
    difficulte: difficultePourNiveau(s.differenciationBrute, niveau),
    estEvaluation: evaluation,
    typesSuggeres: types,
  }));
}

/** Garde-fou : le sous-domaine proposé existe-t-il dans le référentiel ? */
export function sousDomaineConnu(matiere: string, sousMatiere: string): boolean {
  return (MATIERES_CANONIQUES[matiere] ?? []).includes(sousMatiere);
}

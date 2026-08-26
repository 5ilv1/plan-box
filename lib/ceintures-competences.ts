// ── Ceintures de compétences (français) ──────────────────────────────────────
//
// Ne pas confondre avec `lib/ceintures.ts`, qui porte les ceintures de
// MULTIPLICATIONS de Repetibox. Ici : les 9 ceintures de compétences, déclinées
// sur les domaines de français (Phrases, Mots, Textes).
//
// Rappel d'architecture (docs/ceintures/BRIEF.md) :
//   une ceinture = une ligne de `chapitres`, un item = une ligne de `exercice`.
// Tout le cycle entraînement → évaluation → validation est le moteur existant.

/** Les 9 couleurs, communes à tous les domaines. Vert clair → Noir. */
export interface CouleurCeinture {
  idx: number;
  nom: string;
  hex: string;
  hexFond: string;
}

export const COULEURS: CouleurCeinture[] = [
  { idx: 0, nom: "Vert clair", hex: "#7CB342", hexFond: "#F1F8E9" },
  { idx: 1, nom: "Vert foncé", hex: "#2E9E5B", hexFond: "#E3F3E9" },
  { idx: 2, nom: "Bleu clair", hex: "#4FC3E8", hexFond: "#E7F6FC" },
  { idx: 3, nom: "Bleu foncé", hex: "#4A63B0", hexFond: "#E8EBF6" },
  { idx: 4, nom: "Marron clair", hex: "#D2803C", hexFond: "#FAEDE2" },
  { idx: 5, nom: "Marron foncé", hex: "#7B4A28", hexFond: "#EFE6DF" },
  { idx: 6, nom: "Violet clair", hex: "#D8A7D8", hexFond: "#F8EFF8" },
  { idx: 7, nom: "Violet foncé", hex: "#A0409B", hexFond: "#F2E4F1" },
  { idx: 8, nom: "Noir", hex: "#1A1A1A", hexFond: "#ECECEC" },
];

export const NB_CEINTURES = COULEURS.length;

/** Une ceinture au-delà de la dernière : le domaine est terminé. */
export const DOMAINE_TERMINE = NB_CEINTURES;

/**
 * Couleur de texte lisible sur une pastille de ceinture. Le violet clair et le
 * vert clair sont trop lumineux pour du blanc — luminance relative WCAG.
 */
export function texteSur(hex: string): string {
  const c = hex.replace("#", "");
  const canal = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return luminance > 0.4 ? "#1A1A1A" : "#FFFFFF";
}

export function couleur(idx: number): CouleurCeinture {
  return COULEURS[Math.min(Math.max(idx, 0), NB_CEINTURES - 1)];
}

// ── Domaines ────────────────────────────────────────────────────────────────

export interface DomaineCeinture {
  code: string;
  /** Segment d'URL : /eleve/ceintures/<slug> */
  slug: string;
  nom: string;
  matiere: string;
  description: string;
  /** Icône Material Symbols. */
  icone: string;
  ordre: number;
}

export const DOMAINES: DomaineCeinture[] = [
  {
    code: "MOTS",
    slug: "mots",
    nom: "Mots",
    matiere: "français",
    description: "Vocabulaire, classes de mots, orthographe lexicale",
    icone: "abc",
    ordre: 1,
  },
  {
    code: "PHRA",
    slug: "phrases",
    nom: "Phrases",
    matiere: "français",
    description: "Grammaire, conjugaison, orthographe grammaticale",
    icone: "subject",
    ordre: 2,
  },
  {
    code: "TEXT",
    slug: "textes",
    nom: "Textes",
    matiere: "français",
    description: "Lecture, production d'écrits, relecture",
    icone: "menu_book",
    ordre: 3,
  },
];

export function domaineParCode(code: string): DomaineCeinture | undefined {
  return DOMAINES.find((d) => d.code === code.toUpperCase());
}

export function domaineParSlug(slug: string): DomaineCeinture | undefined {
  return DOMAINES.find((d) => d.slug === slug.toLowerCase());
}

/**
 * `chapitres.sous_matiere` d'un domaine. Le préfixe `ceinture-` est ce qui
 * exclut ces chapitres de la liste élève et de la liste enseignant — voir
 * `app/api/chapitres/mes-chapitres/route.ts` et `app/api/admin/chapitres/route.ts`.
 */
export function sousMatiere(domaine: DomaineCeinture): string {
  return `ceinture-${domaine.slug}`;
}

/** Titre du chapitre d'une ceinture. Ex. « Phrases · Bleu clair ». */
export function titreChapitre(domaine: DomaineCeinture, idx: number): string {
  return `${domaine.nom} · ${couleur(idx).nom}`;
}

// ── Progression ─────────────────────────────────────────────────────────────

/**
 * La progression n'est jamais écrite : elle se dérive des évaluations réussies.
 * Une ceinture est acquise dès qu'une ligne `evaluation_resultat` avec
 * `reussi = true` existe sur son chapitre. La ceinture courante est la première
 * qui ne l'est pas — les couleurs se franchissent donc dans l'ordre, même si
 * l'élève réussit une évaluation « en avance ».
 */
export function ceintureCourante(idxReussies: number[]): number {
  const acquises = new Set(idxReussies);
  for (let i = 0; i < NB_CEINTURES; i++) {
    if (!acquises.has(i)) return i;
  }
  return DOMAINE_TERMINE;
}

export type StatutCeinture = "validee" | "courante" | "a_venir";

export function statutCeinture(idx: number, courante: number): StatutCeinture {
  if (idx < courante) return "validee";
  if (idx === courante) return "courante";
  return "a_venir";
}

// ── Contenu des exercices-items ─────────────────────────────────────────────

/**
 * Les deux variantes d'entraînement vivent dans la même ligne `exercice` :
 * la variante servie par défaut est aplatie dans `contenu`, la seconde est
 * rangée sous `variantes`. Créer une deuxième ligne `exercice` doublerait la
 * longueur de l'évaluation, qui est composée à partir de TOUS les exercices du
 * chapitre, et imposerait deux maillons dans la chaîne de déblocage séquentiel.
 */
export interface ContenuItem extends Record<string, unknown> {
  item_code: string;
  /** 1 ou 2 : la variante actuellement aplatie dans ce contenu. */
  variante: number;
  /** Les deux variantes, indexées 0 et 1. Retirée avant envoi au client. */
  variantes?: Record<string, unknown>[];
}

/** Nombre de questions d'un contenu d'entraînement, selon son type. */
export function compterQuestions(type: string, contenu: Record<string, unknown>): number {
  const tableau = (cle: string) => (Array.isArray(contenu[cle]) ? (contenu[cle] as unknown[]).length : 0);
  switch (type) {
    case "texte_a_trous":
      return tableau("trous");
    case "classement":
      return tableau("items");
    case "analyse_phrase":
      return tableau("phrases");
    case "ecriture_contrainte":
      return 1;
    default:
      // exercice, qcm, lecture, calcul_mental…
      return tableau("questions") || 1;
  }
}

/**
 * Sert une variante : aplatit `variantes[n]` dans le contenu et retire le
 * tableau des variantes, qui n'a rien à faire chez l'élève.
 */
export function servirVariante(
  contenu: Record<string, unknown>,
  variante: number,
): Record<string, unknown> {
  const variantes = contenu.variantes;
  if (!Array.isArray(variantes)) return contenu;

  const choisie = variantes[variante - 1] ?? variantes[0];
  const { variantes: _retire, ...reste } = contenu;
  void _retire;

  return { ...reste, ...(choisie as Record<string, unknown>), variante };
}

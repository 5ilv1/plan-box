/**
 * Le vocabulaire des matières et des sous-matières, en un seul endroit.
 *
 * Il en existait deux : la liste du formulaire (« Mathématiques », « Numération »)
 * et celle du suivi (« Maths », « Nombres »). Deux vocabulaires pour les mêmes
 * domaines, donc des colonnes qui ne se rejoignaient jamais dans les graphes.
 *
 * Ce module ne contient que des données — aucun React, aucun accès base — pour
 * être importable aussi bien par les formulaires (navigateur) que par les
 * agrégations et les scripts (serveur).
 */

/**
 * Matières proposées à la création, et leurs sous-matières.
 *
 * L'ordre est celui affiché à l'enseignant. Les matières sans sous-matière
 * connue restent saisissables en texte libre (« Personnalisé… » dans le
 * sélecteur) : mieux vaut une valeur écrite à la main qu'un champ vide.
 */
export const MATIERES_CANONIQUES: Record<string, string[]> = {
  "Mathématiques": ["Calcul", "Numération", "Problèmes", "Grandeurs et mesures", "Géométrie"],
  "Français": ["Lecture", "Écriture", "Conjugaison", "Grammaire", "Orthographe", "Vocabulaire"],
  "Anglais": [],
  "Histoire": [],
  "Géographie": [],
  "Sciences": [],
};

export const MATIERES_ORDRE = Object.keys(MATIERES_CANONIQUES);

/**
 * Bucket des leçons à copier. Ce n'est pas une matière qu'on enseigne : c'est
 * une activité transversale (histoire, géographie, sciences) dont on ne suit
 * pas la réussite. Elle n'est donc pas proposée à la création, mais le suivi
 * doit savoir où la ranger.
 */
export const MATIERE_LECONS = "Leçons";

/**
 * Types de blocs dont le **type ne dit pas** de quoi parle l'exercice.
 *
 * Un calcul mental est du calcul, une dictée de l'orthographe : rien à
 * demander. Mais un « exercice » ou un « QCM » peut porter sur n'importe quoi —
 * c'est là, et seulement là, que la sous-matière doit être exigée à la création.
 * Imposer un choix ailleurs serait de la friction sans information.
 */
export const TYPES_SOUS_MATIERE_REQUISE = new Set(["exercice", "qcm", "eval", "classement"]);

export function exigeSousMatiere(type: string): boolean {
  return TYPES_SOUS_MATIERE_REQUISE.has(type);
}

/**
 * Ramène une matière écrite à la main au libellé canonique.
 *
 * `banque_exercices.matiere` est un champ libre depuis toujours, et il le
 * montre : « Français », « français », « Mathématiques », « Maths » et
 * « maths » y cohabitent pour deux matières réelles. On normalise à la lecture
 * plutôt que de réécrire toute la base.
 */
export function normaliserMatiere(brut: string): string | null {
  const m = brut.trim().toLowerCase();
  if (m === "français" || m === "francais") return "Français";
  if (m === "maths" || m === "mathématiques" || m === "mathematiques") return "Mathématiques";
  if (m === "lecture") return "Lecture";
  if (m === "leçons" || m === "lecons") return MATIERE_LECONS;
  if (m === "anglais") return "Anglais";
  if (m === "histoire") return "Histoire";
  if (m === "géographie" || m === "geographie") return "Géographie";
  if (m === "sciences") return "Sciences";
  return brut.trim() || null;
}

/** Sous-matières proposées pour une matière, canoniques d'abord. */
export function sousMatieresDe(matiere: string): string[] {
  return MATIERES_CANONIQUES[matiere] ?? [];
}

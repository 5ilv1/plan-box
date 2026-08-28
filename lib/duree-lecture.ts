// Temps de lecture estimé d'un livre, à partir du nombre de mots.
//
// Un livre importé n'a pas de pages : un EPUB recompose son texte selon
// l'écran, et l'import PDF ne garde que le texte. Le nombre de mots est donc
// la seule mesure dont on dispose — et le temps de lecture en est une
// traduction plus honnête qu'un nombre de pages reconstitué, qui sous-estime
// lourdement les livres jeunesse (gros caractères, illustrations).

/**
 * Vitesse de lecture silencieuse au cycle 3, en mots par minute.
 *
 * Un lecteur de CM1/CM2 tourne entre 120 et 150 mots/minute sur un roman ;
 * on retient la borne basse pour ne pas promettre à un élève une lecture plus
 * courte qu'elle ne le sera.
 */
export const MOTS_PAR_MINUTE = 120;

/** Minutes de lecture estimées, ou null si le texte n'est pas exploitable. */
export function minutesDeLecture(nbMots: number): number | null {
  if (!Number.isFinite(nbMots) || nbMots < 200) return null;
  return Math.round(nbMots / MOTS_PAR_MINUTE);
}

/**
 * Durée arrondie et lisible par un enfant : « environ 20 min », « environ 1 h 30 ».
 *
 * L'arrondi est volontairement grossier — au quart d'heure passé une heure —
 * parce qu'une estimation à la minute près donnerait une fausse précision.
 */
export function formaterDureeLecture(minutes: number): string {
  if (minutes < 10) return "moins de 10 min";

  if (minutes < 60) {
    const arrondi = Math.round(minutes / 5) * 5;
    return `environ ${arrondi} min`;
  }

  const quarts = Math.round(minutes / 15);
  const heures = Math.floor(quarts / 4);
  const reste = (quarts % 4) * 15;
  return reste === 0 ? `environ ${heures} h` : `environ ${heures} h ${reste}`;
}

/** Raccourci : du nombre de mots au libellé, ou null s'il n'y a pas de quoi estimer. */
export function dureeLectureLisible(nbMots: number): string | null {
  const minutes = minutesDeLecture(nbMots);
  return minutes === null ? null : formaterDureeLecture(minutes);
}

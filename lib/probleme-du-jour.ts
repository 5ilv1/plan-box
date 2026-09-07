/**
 * Quand le problème du jour est-il « fait » ?
 *
 * L'élève a trois essais. S'il trouve, tant mieux ; s'il ne trouve pas, la
 * réponse lui est donnée et la journée est jouée — il n'y a plus rien à faire.
 * Les deux cas comptent comme fait.
 *
 * Le tableau de bord ne regardait que `solved` : un élève qui avait cherché,
 * épuisé ses essais et lu la correction retrouvait sa carte intacte, comme s'il
 * n'avait rien fait. Elle est maintenant barrée dès que le problème est
 * terminé, réussi ou non — ce qui est barré, c'est le travail fait, pas la
 * bonne réponse.
 */

/** Nombre d'essais avant que la réponse ne soit donnée. */
export const MAX_TENTATIVES = 3;

export interface TentativeProbleme {
  solved?: boolean | null;
  attempts?: number | null;
}

/** Vrai si l'élève n'a plus rien à faire aujourd'hui sur ce problème. */
export function problemeTermine(tentative: TentativeProbleme | null | undefined): boolean {
  if (!tentative) return false;
  return tentative.solved === true || (tentative.attempts ?? 0) >= MAX_TENTATIVES;
}

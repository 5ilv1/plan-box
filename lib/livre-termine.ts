/**
 * Un livre de la bibliothèque est-il terminé ? (pur, sans accès base)
 *
 * ⚠️ **L'évaluation finale clôt le livre, quel que soit son score.** Jusqu'au
 * 15/10, elle devait être réussie (90 %) : un élève qui l'échouait restait
 * enfermé dans un livre déjà lu jusqu'au bout, sans pouvoir en choisir un autre
 * — l'évaluation est un bilan de lecture, pas une porte. Le score reste
 * enregistré (`evaluation_resultat.reussi`) pour l'enseignant.
 *
 * Un livre est terminé si :
 *   1. une évaluation finale a été passée (`evaluation_resultat`, réussie ou non) ;
 *   2. ou son exercice `est_evaluation_finale` a été fait (`exercice_resultat`,
 *      validé ou non) — trace écrite au même moment que la 1 ;
 *   3. ou, s'il n'a PAS d'évaluation finale dédiée (livres dont les questions de
 *      lecture en tiennent lieu), tous ses exercices sont validés.
 *
 * Partagé par `/api/bibliotheque/statut`, `/choisir`, `/lus` et la liste
 * `/api/bibliotheque` : quatre copies de cette règle avaient déjà quatre fois
 * la même condition de réussite à changer.
 * Contrat : `npx tsx docs/tests/test-livre-termine.mjs`.
 */

export interface ExoLivre {
  id: string;
  estEval: boolean;
}

export interface TracesLecture {
  /** Livres dont une évaluation finale a été passée. */
  evalsPassees: Set<string>;
  /** Exercices de chaque livre. */
  exosParChap: Map<string, ExoLivre[]>;
  /** Exercices que l'élève a faits au moins une fois, validés ou non. */
  exosFaits: Set<string>;
  /** Exercices validés. */
  exosValides: Set<string>;
}

export function livreTermine(chapId: string, t: TracesLecture): boolean {
  if (t.evalsPassees.has(chapId)) return true;
  const exos = t.exosParChap.get(chapId) ?? [];
  if (exos.length === 0) return false;
  const evalFinale = exos.find((e) => e.estEval);
  if (evalFinale) return t.exosFaits.has(evalFinale.id);
  return exos.every((e) => t.exosValides.has(e.id));
}

/** Range les exercices par livre, en repérant l'évaluation finale. */
export function exosParLivre(
  exercices: { id: string; chapitre_id: string; contenu: unknown }[],
): Map<string, ExoLivre[]> {
  const m = new Map<string, ExoLivre[]>();
  for (const e of exercices) {
    const estEval = (e.contenu as { est_evaluation_finale?: unknown } | null)?.est_evaluation_finale === true;
    if (!m.has(e.chapitre_id)) m.set(e.chapitre_id, []);
    m.get(e.chapitre_id)!.push({ id: e.id, estEval });
  }
  return m;
}

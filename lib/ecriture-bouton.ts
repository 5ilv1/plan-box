/**
 * Le bouton unique de l'écriture du jour : « Corriger mon texte », puis
 * « J'ai terminé ».
 *
 * Il y avait trois boutons — corriger, « Je veux valider » (qui masquait les
 * erreurs sans les corriger) et « J'ai terminé ». Un élève pouvait rendre son
 * texte sans l'avoir fait corriger une seule fois, ou masquer ses fautes d'un
 * clic. Désormais le texte passe par la correction, jusqu'à ce qu'elle ne
 * trouve plus rien — ou jusqu'à trois corrections, pour ne jamais enfermer un
 * élève face à une faute qu'il ne sait pas réparer.
 *
 * Pur : le composant fournit l'état, ce module dit quel bouton montrer.
 */

/** Au-delà, l'élève peut rendre son texte même s'il reste des erreurs. */
export const MAX_CORRECTIONS = 3;

export interface EtatCorrection {
  /** Corrections déjà faites sur ce texte (compteur serveur, survit au rechargement). */
  nbCorrections: number;
  /**
   * Le texte tel qu'il était quand la dernière correction n'a RIEN trouvé,
   * ou `null`. Si l'élève modifie son texte ensuite, la vérification ne vaut
   * plus : il pourrait avoir introduit une faute.
   */
  texteSansErreur: string | null;
  texteActuel: string;
}

export type ActionBouton = "corriger" | "terminer";

export function actionBouton(e: EtatCorrection): ActionBouton {
  if (e.nbCorrections >= MAX_CORRECTIONS) return "terminer";
  if (e.texteSansErreur !== null && normaliser(e.texteSansErreur) === normaliser(e.texteActuel)) {
    return "terminer";
  }
  return "corriger";
}

export function correctionsRestantes(nbCorrections: number): number {
  return Math.max(0, MAX_CORRECTIONS - nbCorrections);
}

/**
 * Deux textes qui ne diffèrent que par des espaces sont le même texte :
 * une espace en fin de ligne ne doit pas coûter une correction.
 */
function normaliser(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

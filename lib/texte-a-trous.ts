// ── Placement des trous d'un texte à trous ───────────────────────────────────

export interface Trou {
  /** Rang dans la banque (0, 1, 2…), remplacé ici par l'index réel du mot. */
  position: number;
  mot: string;
  indice?: string;
}

/**
 * Résout la position réelle de chaque trou dans le texte.
 *
 * Les `position` stockées en banque sont des rangs séquentiels (0, 1, 2…),
 * alors que `TexteATrousEleve` attend l'index du mot dans le texte découpé par
 * espaces. Sans cette résolution, les trous se posent sur les premiers mots du
 * texte — l'exercice devient illisible.
 *
 * La comparaison ignore la ponctuation ET les accents : « à » et « a » sont
 * donc indiscernables ici. C'est pourquoi l'ordre des trous doit être celui du
 * texte, et pourquoi l'évaluation ne doit jamais en prélever un sous-ensemble
 * (voir docs/ceintures/CORRECTIF-piocher.md).
 */
export function resoudrePositionsTrous(texteComplet: string, trous: Trou[]): Trou[] {
  const mots = texteComplet.split(/\s+/);
  const resolus: Trou[] = [];
  const positionsUtilisees = new Set<number>();

  const nettoyer = (s: string) =>
    s.replace(/[.,;:!?'"()«»]/g, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const trou of trous) {
    const motNettoye = nettoyer(trou.mot);
    let trouve = false;

    for (let i = 0; i < mots.length; i++) {
      if (positionsUtilisees.has(i)) continue;
      if (nettoyer(mots[i]) === motNettoye) {
        resolus.push({ ...trou, position: i });
        positionsUtilisees.add(i);
        trouve = true;
        break;
      }
    }

    // Mot introuvable dans le texte : on garde la position d'origine plutôt
    // que de perdre le trou.
    if (!trouve) resolus.push(trou);
  }

  return resolus;
}

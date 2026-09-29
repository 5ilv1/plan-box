/**
 * Lit un score qui peut venir d'un modèle : 3, "3", "3/6", "3 / 6".
 *
 * La correction d'écriture sous contrainte demande au modèle un score
 * « contraintes respectées / total », et il le rend tantôt en nombre, tantôt
 * en texte « 3/6 ». Le texte partait tel quel dans `exercice_resultat.score`
 * (entier) : le 29/09, 11 résultats sur 32 ont été refusés par la base.
 *
 * Rend `null` si rien de lisible : on ne fabrique pas de note.
 */
export function lireScore(valeur: unknown): { bon: number; total: number | null } | null {
  if (typeof valeur === "number") {
    return Number.isFinite(valeur) && valeur >= 0 ? { bon: valeur, total: null } : null;
  }
  if (typeof valeur !== "string") return null;
  const m = valeur.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+))?$/);
  if (!m) return null;
  const bon = Number(m[1].replace(",", "."));
  const total = m[2] !== undefined ? Number(m[2]) : null;
  return { bon, total };
}

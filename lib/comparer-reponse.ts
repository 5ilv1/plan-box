// ── Comparaison d'une réponse d'élève à la réponse attendue ──────────────────
//
// Partagée par `components/ExerciceStack.tsx` et `components/CalcMentalStack.tsx`.
// Voir docs/ceintures/CORRECTIF-reponses-chiffrees.md pour les trois défauts
// qu'elle corrige et les décisions assumées.

/**
 * Espaces de toutes sortes : ordinaire, insécable (U+00A0), fine insécable
 * (U+202F), et les autres espaces Unicode qu'un traitement de texte peut
 * glisser dans « 3 000 ».
 */
const SANS_ESPACE = /[\s   -​　]/g;

function normaliser(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(SANS_ESPACE, "")
    .replace(/,/g, "."); // toutes les virgules, pas seulement la première
}

const FRACTION = /^-?\d+\/\d+$/;

/**
 * `true` si la réponse de l'élève vaut la réponse attendue.
 *
 * Trois règles à connaître :
 *  • La tolérance est de 1e-9, c'est-à-dire l'égalité stricte aux erreurs
 *    d'arrondi près : « 10 » vaut « 10,000 », « 3,45 » ne vaut plus « 3,46 ».
 *  • Une fraction attendue n'accepte qu'une fraction : « 0,5 » est refusé pour
 *    « 1/2 ». Quand on demande une fraction, on veut la fraction.
 *  • La comparaison des fractions est stricte : « 2/4 » ne vaut pas « 1/2 »,
 *    sans quoi l'item « simplifie 2/4 » serait inévaluable.
 */
export function comparerReponse(attendue: string, donnee: string): boolean {
  const a = normaliser(attendue ?? "");
  const d = normaliser(donnee ?? "");

  if (a === d) return true;

  // Fractions : comparées terme à terme, jamais par leur valeur décimale.
  if (FRACTION.test(a)) {
    if (!FRACTION.test(d)) return false;
    const [an, ad] = a.split("/").map(Number);
    const [dn, dd] = d.split("/").map(Number);
    return an === dn && ad === dd;
  }
  if (FRACTION.test(d)) return false;

  // Nombres : égalité stricte aux erreurs de virgule flottante près.
  // parseFloat, et non Number, conformément au contrat de
  // docs/ceintures/test-comparer-reponse.mjs : une unité collée au nombre
  // (« 3cm » pour « 3 ») reste acceptée, ce qui est le comportement voulu.
  const na = parseFloat(a);
  const nd = parseFloat(d);
  return !isNaN(na) && !isNaN(nd) && Math.abs(na - nd) < 1e-9;
}

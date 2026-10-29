// ── Comparaison d'une réponse d'élève à la réponse attendue ──────────────────
//
// Partagée par `components/ExerciceStack.tsx` et `components/CalcMentalStack.tsx`.
// Voir docs/ceintures/CORRECTIF-reponses-chiffrees.md pour les trois défauts
// qu'elle corrige et les décisions assumées.

import { evaluerNombreEnLettres } from "@/lib/comparaison-nombres";

const ESP = "[\\s\\u00A0\\u202F\\u2007\\u2009\\u200B\\u3000]";

function normaliser(s: string): string {
  return s
    .trim()
    .toLowerCase()
    // « 3 000 » → « 3000 » : l'espace n'est retiré qu'ENTRE DEUX CHIFFRES.
    // Le retirer partout rendrait « lesenfants » acceptable pour « les enfants »,
    // et relâcherait les 51 réponses en plusieurs mots des banques de français.
    .replace(new RegExp(`(\\d)${ESP}+(?=\\d)`, "g"), "$1")
    // « 1 / 2 » → « 1/2 »
    .replace(new RegExp(`(\\d)${ESP}*/${ESP}*(\\d)`, "g"), "$1/$2")
    // le reste des espaces est simplement normalisé
    .replace(new RegExp(`${ESP}+`, "g"), " ")
    .replace(/,/g, "."); // toutes les virgules, pas seulement la première
}

const FRACTION = /^-?\d+\/\d+$/;

const HEURE = /\b(\d{1,2})\s*(?:h(?:eures?)?|:)\s*(?:(\d{1,2})\s*(?:min(?:utes?)?)?)?(?![\p{L}\d])/iu;

/**
 * L'heure lue dans un texte : « 3 h 25 », « 15h25 », « 3:25 », « 8 h »,
 * « 7 heures 30 », « 1 h 30 min ». Avec `seule`, le texte ne doit contenir
 * que l'heure (à un article ou un point près).
 */
export function lireHeure(t: string, seule = false): { h: number; m: number; minutesEcrites: boolean } | null {
  const texte = (t ?? "").trim();
  const x = texte.match(HEURE);
  if (!x) return null;
  if (seule && texte.replace(x[0], "").replace(/^(il est|à|a)\s+/i, "").replace(/[\s.]/g, "") !== "") return null;
  const h = parseInt(x[1], 10), m = x[2] ? parseInt(x[2], 10) : 0;
  if (h > 23 || m > 59) return null;
  return { h, m, minutesEcrites: !!x[2] };
}

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

  // Heures : « 7 h 30 » ne vaut pas « 7 h 45 ». Comparées en nombres, les
  // deux valaient 7 — un élève qui lit mal l'horloge était compté juste.
  // Les heures de l'après-midi valent leur lecture sur le cadran (15 h 30 =
  // 3 h 30) : une horloge à aiguilles ne dit pas le matin du soir.
  const ha = lireHeure(a, true);
  if (ha) {
    const hd = lireHeure(d, true);
    if (hd) return ha.h % 12 === hd.h % 12 && ha.m === hd.m;
    // « 8 » pour « 8 h » reste accepté ; « 7 » pour « 7 h 30 », non.
    if (ha.minutesEcrites && ha.m !== 0) return false;
  }

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

// ── Nombres écrits en toutes lettres ─────────────────────────────────────────

/**
 * `true` si l'écriture est un nombre composé en toutes lettres.
 *
 * Le mot isolé est exclu à dessein : sans cela « une » vaudrait « un », et un
 * item qui demande l'article serait faussement validé.
 */
function estNombreCompose(txt: string): boolean {
  return /[\s-]/.test(txt.trim()) && evaluerNombreEnLettres(txt) !== null;
}

export interface ResultatComparaison {
  correcte: boolean;
  /** Remarque pédagogique à afficher en plus de la correction. */
  remarque?: string;
}

/**
 * Comme `comparerReponse`, mais tolère la graphie traditionnelle d'un nombre en
 * toutes lettres — « quatre cent cinquante » pour « quatre-cent-cinquante » —
 * et renvoie alors une remarque rappelant la règle des traits d'union.
 *
 * Les DEUX écritures doivent être en lettres : « 450 » ne vaut pas
 * « quatre-cent-cinquante », sinon l'exercice « écris ce nombre en lettres »
 * s'auto-validerait.
 */
export function comparerReponseDetail(attendue: string, donnee: string): ResultatComparaison {
  if (comparerReponse(attendue, donnee)) return { correcte: true };

  const a = (attendue ?? "").trim();
  const d = (donnee ?? "").trim();
  if (!estNombreCompose(a) || !estNombreCompose(d)) return { correcte: false };
  if (evaluerNombreEnLettres(a) !== evaluerNombreEnLettres(d)) return { correcte: false };

  // Même nombre, graphie différente : accepté, avec un mot sur la règle.
  const remarque = a.includes("-") && !d.includes("-")
    ? `C'est juste ! On écrit aussi « ${a} » : depuis 1990, tous les éléments d'un nombre en lettres se relient par des traits d'union.`
    : undefined;

  return { correcte: true, remarque };
}

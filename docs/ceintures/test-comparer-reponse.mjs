#!/usr/bin/env node
/**
 * Test de la comparaison des réponses chiffrées.
 *   node docs/ceintures/test-comparer-reponse.mjs
 *
 * Rejoue ici la fonction attendue dans lib/comparer-reponse.ts. Si tu modifies
 * la fonction de l'application, reporte la modification ici — ce fichier est le
 * contrat, pas une copie décorative.
 */
const ESP = "[\\s\\u00A0\\u202F\\u2007\\u2009\\u200B\\u3000]";
const normaliser = (s) => String(s).trim().toLowerCase()
  .replace(new RegExp(`(\\d)${ESP}+(?=\\d)`, "g"), "$1")
  .replace(new RegExp(`(\\d)${ESP}*/${ESP}*(\\d)`, "g"), "$1/$2")
  .replace(new RegExp(`${ESP}+`, "g"), " ")
  .replace(/,/g, ".");
const FRACTION = /^-?\d+\/\d+$/;

export function comparerReponse(attendue, donnee) {
  const a = normaliser(attendue), d = normaliser(donnee);
  if (a === d) return true;
  if (FRACTION.test(a)) {
    if (!FRACTION.test(d)) return false;
    const [an, ad] = a.split("/").map(Number);
    const [dn, dd] = d.split("/").map(Number);
    return an === dn && ad === dd;
  }
  if (FRACTION.test(d)) return false;
  const na = parseFloat(a), nd = parseFloat(d);
  return !isNaN(na) && !isNaN(nd) && Math.abs(na - nd) < 1e-9;
}

const CAS = [
  ["3 000", "3000", true,  "espace des milliers côté attendu"],
  ["3 000", "3 000", true, "espace des deux côtés"],
  ["3 000", "3", false,    "BUG 1 : parseFloat('3 000') valait 3"],
  ["3000", "3 000", true,  "espace côté élève"],
  ["1250000", "1 250 000", true, "grand nombre espacé par l'élève"],
  ["1250000", "1 250 000", true, "espace fine insécable"],
  ["1/2", "1", false,      "BUG 2 : parseFloat('1/2') valait 1"],
  ["1/2", "1/2", true,     "fraction identique"],
  ["1/2", "1 / 2", true,   "fraction avec espaces"],
  ["1/2", "0,5", false,    "décision : la valeur décimale ne vaut pas la fraction"],
  ["1/2", "2/4", false,    "décision : comparaison stricte des fractions"],
  ["3,5", "3.5", true,     "point au lieu de la virgule"],
  ["3,5", "3,50", true,    "zéro final"],
  ["3,5", "3,5", true,     "identique"],
  ["3,45", "3,46", false,  "le centième doit rester discriminant — impossible avec l'ancienne tolérance de 0,01"],
  ["2,5", "2,499", false,  "l'ancienne tolérance acceptait aussi celui-ci"],
  ["10", "10,000", true,   "zéros inutiles"],
  ["0,25", "1/4", false,   "une fraction ne vaut pas un décimal attendu"],
  ["quarante", "Quarante", true, "réponse en toutes lettres, casse ignorée"],
  ["quarante", "quarante-deux", false, "réponse en toutes lettres, différente"],
  ["40", "quarante", false, "les lettres ne valent pas les chiffres"],
  ["les enfants", "lesenfants", false, "l'espace ne se retire QUE entre deux chiffres"],
  ["les enfants", "Les  enfants", true, "espaces multiples et casse, réponse en mots"],
  ["mon oncle", "mon oncle ", true, "espace final"],
];

let echecs = 0;
console.log("Comparaison des réponses chiffrées\n");
for (const [att, don, attendu, note] of CAS) {
  const obtenu = comparerReponse(att, don);
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} attendu « ${att} », saisi « ${don} » → ${obtenu ? "juste" : "faux"}${ok ? "" : `  ATTENDU ${attendu ? "juste" : "faux"}`}   ${note}`);
}
console.log(`\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);

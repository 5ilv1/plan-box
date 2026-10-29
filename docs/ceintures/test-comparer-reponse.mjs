#!/usr/bin/env npx tsx
/**
 * Test de la comparaison des réponses chiffrées.
 *   npx tsx docs/ceintures/test-comparer-reponse.mjs
 *
 * Teste la fonction de l'application (lib/comparer-reponse.ts) — jusqu'au
 * 23/10, ce fichier en rejouait une copie, qui ne prouvait rien sur
 * l'original.
 */
import { comparerReponse } from "../../lib/comparer-reponse.ts";

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
  // Heures : lues sur une horloge, comparées heure ET minutes.
  ["7 h 30", "7 h 45", false, "heure : les minutes comptent (avant : 7 = 7)"],
  ["7 h 30", "7h30", true, "heure : espaces"],
  ["7 heures 30", "7 h 30", true, "heure : « heures » écrit en entier"],
  ["7 h 30", "19 h 30", true, "heure : l'horloge ne dit pas le matin du soir"],
  ["7 h 30", "7:30", true, "heure : deux-points"],
  ["7 h 30", "Il est 7 h 30.", true, "heure : dans une phrase courte"],
  ["7 h 30", "7", false, "heure : il manque les minutes"],
  ["8 h", "8", true, "heure pleine : le nombre seul reste accepté"],
  ["8 h", "8 h 00", true, "heure pleine : minutes nulles écrites"],
  ["8 h", "8 h 30", false, "heure pleine : autres minutes refusées"],
  ["1 h 30 min", "1 h 30", true, "durée : « min » facultatif"],
  ["90 min", "90", true, "durée en minutes : inchangée"],
  ["5 hm", "5", true, "hectomètre : pas une heure"],
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

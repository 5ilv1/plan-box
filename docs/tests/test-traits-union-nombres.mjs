#!/usr/bin/env npx tsx
/**
 * Contrat de `traitsUnionNombres()` : ce qui doit être relié, et surtout ce
 * qui ne doit pas l'être. Lancer après toute modification du module :
 *   npx tsx docs/tests/test-traits-union-nombres.mjs
 */
import { traitsUnionNombres } from "../../lib/nombres-en-lettres.ts";

const CAS = [
  // ── Ce qu'on vient corriger ────────────────────────────────────────────
  ["trois cent quarante-cinq", "trois-cent-quarante-cinq"],
  ["quatre cent cinquante", "quatre-cent-cinquante"],
  ["mille neuf cent quatre-vingt-dix", "mille-neuf-cent-quatre-vingt-dix"],
  ["deux mille vingt-six", "deux-mille-vingt-six"],
  ["quatre vingt onze", "quatre-vingt-onze"],
  ["un million deux cent mille", "un-million-deux-cent-mille"],
  ["vingt et un", "vingt-et-un"],
  ["soixante et onze élèves", "soixante-et-onze élèves"],
  ["trois cent vingt et un", "trois-cent-vingt-et-un"],
  ["Trois cent deux", "Trois-cent-deux"],
  ["quatre cents", "quatre-cents"],

  // ── Déjà juste : ne rien changer ───────────────────────────────────────
  ["trois-cent-vingt-deux", "trois-cent-vingt-deux"],
  ["345", "345"],
  ["Écris 45 208 en lettres.", "Écris 45 208 en lettres."],

  // ── Un mot seul n'a rien à relier ──────────────────────────────────────
  ["trois pommes", "trois pommes"],
  ["un chat", "un chat"],
  ["Il a vingt ans.", "Il a vingt ans."],

  // ── La ponctuation coupe la série ──────────────────────────────────────
  ["Il en reste vingt. Trois sont partis.", "Il en reste vingt. Trois sont partis."],
  ["un, deux, trois", "un, deux, trois"],
  ["deux cents\ntrois cents", "deux-cents\ntrois-cents"],

  // ── Le « et » qui relie deux nombres distincts ─────────────────────────
  ["trois cents et quatre cents", "trois-cents et quatre-cents"],
  ["vingt et trois", "vingt et trois"],
  ["mille et une nuits", "mille et une nuits"],

  // ── Deux mots-nombres voisins qui ne forment pas un nombre ─────────────
  // Relevés en base : la seule évaluation ne suffisait pas à les écarter.
  ["Un zéro occupe un rang comme les autres chiffres.", "Un zéro occupe un rang comme les autres chiffres."],
  ["Ils utilisent tous les trois une chanson", "Ils utilisent tous les trois une chanson"],
  ["Ils ont tous les deux une barbe", "Ils ont tous les deux une barbe"],
  ["compte les zéros : un zéro, un chiffre", "compte les zéros : un zéro, un chiffre"],

  // ── Nombres composés relevés en base : eux, doivent être reliés ────────
  ["trois cent quarante-deux mille six cents", "trois-cent-quarante-deux-mille-six-cents"],
  ["quatre-vingt-douze mille cinq", "quatre-vingt-douze-mille-cinq"],
  ["cent six mille trente", "cent-six-mille-trente"],
  ["à trois cents mètres de distance", "à trois-cents mètres de distance"],
  ["soixante-dix mille", "soixante-dix-mille"],
  ["deux milliards trois cents millions", "deux-milliards-trois-cents-millions"],

  // ── Mots ordinaires autour ─────────────────────────────────────────────
  ["deux fois trois", "deux fois trois"],
  ["trois plus quatre", "trois plus quatre"],
  ["quatre-vingts pages et deux cahiers", "quatre-vingts pages et deux cahiers"],
];

let echecs = 0;
for (const [entree, attendu] of CAS) {
  const obtenu = traitsUnionNombres(entree);
  if (obtenu !== attendu) {
    echecs++;
    console.log(`✗ « ${entree} »\n    attendu : « ${attendu} »\n    obtenu  : « ${obtenu} »`);
  }
}
console.log(echecs === 0 ? `✓ ${CAS.length} cas passent` : `\n${echecs} échec(s) sur ${CAS.length}`);
process.exit(echecs === 0 ? 0 : 1);

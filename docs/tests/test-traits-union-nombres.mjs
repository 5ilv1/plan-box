#!/usr/bin/env npx tsx
/**
 * Contrat du module : ce qui doit être relié, et surtout ce qui ne doit pas.
 *
 * Deux niveaux. `traitsUnionNombres()` relie les nombres d'un texte ;
 * `traitsUnionSiNombre()` est celui qui tourne en production, et il ne corrige
 * QUE les champs entièrement occupés par un nombre — la réponse d'un « écris
 * 345 en lettres », pas une phrase qui parle de millions au passage.
 *
 * Lancer après toute modification du module :
 *   npx tsx docs/tests/test-traits-union-nombres.mjs
 */
import { traitsUnionNombres, traitsUnionSiNombre } from "../../lib/nombres-en-lettres.ts";

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

// ── Portée : seuls les champs qui SONT un nombre sont corrigés ───────────────
const CHAMPS = [
  // La réponse attendue d'un exercice d'écriture des nombres : on relie.
  ["trois cent quarante-cinq", "trois-cent-quarante-cinq"],
  ["trois cent quarante-cinq.", "trois-cent-quarante-cinq."],
  ["  quatre vingt onze  ", "  quatre-vingt-onze  "],
  ["vingt et un", "vingt-et-un"],
  ["trois cent quarante-deux mille six cents", "trois-cent-quarante-deux-mille-six-cents"],
  ["quatre-vingt-douze mille cinq", "quatre-vingt-douze-mille-cinq"],

  // Frappes traînantes relevées en base : un espace autour du tiret.
  ["cinq -cent-cinquante-six", "cinq-cent-cinquante-six"],
  ["neuf-mille-neuf-cent -quatre-vingt-dix-neuf", "neuf-mille-neuf-cent-quatre-vingt-dix-neuf"],
  ["huit-mille-quatre-cent soixante-seize", "huit-mille-quatre-cent-soixante-seize"],
  ["mille deux  cent", "mille-deux-cent"],

  // Une soustraction espacée n'est pas un nombre : la série ne se referme pas.
  ["dix - cinq", "dix - cinq"],

  // Une phrase qui contient un nombre : on n'y touche pas.
  ["Deux millions de francs", "Deux millions de francs"],
  ["Ajoute un million à la borne du bas.", "Ajoute un million à la borne du bas."],
  ["Il faut environ cent cinquante bouteilles.", "Il faut environ cent cinquante bouteilles."],
  ["Comment écrit-on en chiffres « six milliards » ?", "Comment écrit-on en chiffres « six milliards » ?"],
  ["à trois cents mètres de distance", "à trois cents mètres de distance"],
  ["Un zéro occupe un rang.", "Un zéro occupe un rang."],
  ["345", "345"],
  ["", ""],
];

let echecs = 0;

for (const [entree, attendu] of CAS) {
  const obtenu = traitsUnionNombres(entree);
  if (obtenu !== attendu) {
    echecs++;
    console.log(`✗ traitsUnionNombres « ${entree} »\n    attendu : « ${attendu} »\n    obtenu  : « ${obtenu} »`);
  }
}

for (const [entree, attendu] of CHAMPS) {
  const obtenu = traitsUnionSiNombre(entree);
  if (obtenu !== attendu) {
    echecs++;
    console.log(`✗ traitsUnionSiNombre « ${entree} »\n    attendu : « ${attendu} »\n    obtenu  : « ${obtenu} »`);
  }
}

const total = CAS.length + CHAMPS.length;
console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

#!/usr/bin/env npx tsx
/**
 * Contrat du bilan d'un texte corrigé (retour enseignant).
 *
 * Lancer après toute modification de lib/ecriture-bilan.ts :
 *   npx tsx docs/tests/test-ecriture-bilan.mjs
 */
import { diffMots, bilanCorrections } from "../../lib/ecriture-bilan.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

/* ── 1. Le diff ──────────────────────────────────────────────────────────── */

verifier("rien n'a changé", diffMots("Il pleut.", "Il pleut."), [{ type: "egal", texte: "Il pleut." }]);
verifier("un mot remplacé",
  diffMots("Les enfants jouait.", "Les enfants jouaient."),
  // l'espace voyage avec le mot qui le suit : c'est ce qui empêche les espaces
  // de servir de repères au diff
  [{ type: "egal", texte: "Les enfants" }, { type: "retrait", texte: " jouait" },
   { type: "ajout", texte: " jouaient" }, { type: "egal", texte: "." }]);
verifier("une phrase ajoutée à la fin",
  diffMots("Il pleut.", "Il pleut. Je reste.").filter((s) => s.type !== "egal"),
  [{ type: "ajout", texte: " Je reste." }]);
verifier("recomposer les deux textes depuis le diff (espaces près)",
  (() => {
    const avant = "la court de recréation tu peux joué au foot";
    const apres = "La cour de récréation, tu peux jouer au foot.";
    const d = diffMots(avant, apres);
    const sans = (t) => t.replace(/\s+/g, " ").trim();
    return [
      sans(d.filter((s) => s.type !== "ajout").map((s) => s.texte).join("")) === sans(avant),
      d.filter((s) => s.type !== "retrait").map((s) => s.texte).join("") === apres,
    ];
  })(), [true, true]);

// Le cas qui s'affichait illisible : les espaces servaient de repères.
verifier("des mots ajoutés au milieu ne font pas dérailler l'alignement",
  diffMots("cachcach loup touch touch.", "cache-cache et au loup touche-touche.")
    .map((s) => [s.type, s.texte.trim()]),
  [["retrait", "cachcach"], ["ajout", "cache-cache et au"], ["egal", "loup"],
   ["retrait", "touch touch"], ["ajout", "touche-touche"], ["egal", "."]]);

/* ── 2. Le sort des fautes ───────────────────────────────────────────────── */

const jet = "la court de recréation tu peux joué au foot a cache-cache.";
const fautes = [
  { mot: "court", position: 3, type: "homophone", attendu: "cour" },
  { mot: "recréation", position: 12, type: "orthographe", attendu: "récréation" },
  { mot: "joué", position: 31, type: "grammaire", attendu: "jouer" },
  { mot: "a", position: 44, type: "homophone", attendu: "à" },
];
const rendu = "la cour de récréation tu peux jouet au foot a cache-cache.";
const bilan = bilanCorrections(jet, fautes, rendu);
verifier("corrigée, corrigée, modifiée autrement, laissée",
  bilan.map((b) => [b.mot, b.statut, b.remplacement ?? null]),
  [["court", "corrigee", "cour"], ["recréation", "corrigee", "récréation"],
   ["joué", "modifiee", "jouet"], ["a", "laissee", null]]);

verifier("une faute dans une phrase supprimée : modifiée, remplacée par rien",
  bilanCorrections("Il et content. Je pars.", [{ mot: "et", position: 3, type: "homophone", attendu: "est" }], "Je pars.")
    .map((b) => [b.statut, b.remplacement]), [["modifiee", ""]]);

verifier("une virgule ajoutée en passant ne fait pas d'une correction une modification",
  bilanCorrections("de recréation tu", [{ mot: "recréation", position: 3, type: "orthographe", attendu: "récréation" }],
    "de récréation, tu").map((b) => b.statut), ["corrigee"]);

// Le cas du banc d'essai : deux fautes voisines, un seul bloc de retouche.
verifier("deux fautes voisines corrigées d'un coup : toutes deux corrigées",
  bilanCorrections("la court de", [
    { mot: "la", position: 0, type: "syntaxe", attendu: "La" },
    { mot: "court", position: 3, type: "homophone", attendu: "cour" },
  ], "La cour de").map((b) => b.statut), ["corrigee", "corrigee"]);
verifier("un mot corrigé suivi de mots ajoutés : corrigé",
  bilanCorrections("a cachcach loup", [{ mot: "cachcach", position: 2, type: "orthographe", attendu: "cache-cache" }],
    "a cache-cache et au loup").map((b) => b.statut), ["corrigee"]);
verifier("un mot proche mais faux reste « modifié »",
  bilanCorrections("peux joué au", [{ mot: "joué", position: 5, type: "grammaire", attendu: "jouer" }],
    "peux jouet au").map((b) => [b.statut, b.remplacement]), [["modifiee", "jouet"]]);

verifier("la casse ne compte pas pour juger corrigée",
  bilanCorrections("il pleut", [{ mot: "il", position: 0, type: "syntaxe", attendu: "Il" }], "Il pleut")
    .map((b) => b.statut), ["corrigee"]);

verifier("une élision corrigée (deux mots → un)",
  bilanCorrections("Il dit que on part.", [{ mot: "que on", position: 7, type: "syntaxe", attendu: "qu'on" }], "Il dit qu'on part.")
    .map((b) => [b.statut, b.remplacement]), [["corrigee", "qu'on"]]);

verifier("sans attendu, un mot changé est « modifié »",
  bilanCorrections("Il mange.", [{ mot: "mange", position: 3, type: "grammaire" }], "Il mangeait.")
    .map((b) => b.statut), ["modifiee"]);

verifier("une retouche ailleurs ne change pas le sort d'une faute laissée",
  bilanCorrections("Il et content. Il pleut.", [{ mot: "et", position: 3, type: "homophone", attendu: "est" }],
    "Il et content. Il neige.").map((b) => b.statut), ["laissee"]);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

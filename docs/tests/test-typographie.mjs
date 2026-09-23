#!/usr/bin/env npx tsx
/**
 * Contrat de la détection des majuscules et des élisions.
 *
 * Détection par programme, sans modèle : ces tests SONT la mesure. La moitié
 * sont des pièges — un texte juste qu'une détection naïve corrigerait.
 *
 * Lancer après toute modification de lib/typographie.ts :
 *   npx tsx docs/tests/test-typographie.mjs
 */
import {
  elisionsManquantes, majusculesManquantes, fautesTypographiques,
  estAnnonceMajuscule, estAnnonceElision,
} from "../../lib/typographie.ts";
import { fusionnerTypographie } from "../../lib/ecriture-correction.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}
const elis = (t) => elisionsManquantes(t).map((f) => [f.mot, f.attendu]);
const majs = (t) => majusculesManquantes(t).map((f) => [f.mot, f.attendu]);

/* ── 1. Élisions manquantes ──────────────────────────────────────────────── */

verifier("que on", elis("Il dit que on part."), [["que on", "qu'on"]]);
verifier("le arbre", elis("Je vois le arbre."), [["le arbre", "l'arbre"]]);
verifier("je ai", elis("Hier je ai couru."), [["je ai", "j'ai"]]);
verifier("la école", elis("Il va à la école."), [["la école", "l'école"]]);
verifier("de une", elis("Il parle de une fille."), [["de une", "d'une"]]);
verifier("ne est", elis("Il ne est pas là."), [["ne est", "n'est"]]);
verifier("me appelle", elis("Je me appelle Léo."), [["me appelle", "m'appelle"]]);
verifier("se est", elis("Il se est levé."), [["se est", "s'est"]]);
verifier("si il", elis("Viens si il pleut."), [["si il", "s'il"]]);
verifier("ce est", elis("Oui, ce est vrai."), [["ce est", "c'est"]]);
verifier("lorsque il", elis("Je pars lorsque il arrive."), [["lorsque il", "lorsqu'il"]]);
verifier("jusque à", elis("Il court jusque à la mer."), [["jusque à", "jusqu'à"]]);
verifier("je y", elis("Je y vais."), [["Je y", "J'y"]]);
verifier("le homme (h muet)", elis("Je vois le homme."), [["le homme", "l'homme"]]);
verifier("je habite (h muet)", elis("Ici je habite."), [["je habite", "j'habite"]]);
verifier("une œuvre", elis("Il parle de œufs."), [["de œufs", "d'œufs"]]);

verifier("l'apostrophe oubliée : l école", elis("Je vais à l école."), [["l école", "l'école"]]);
verifier("l'apostrophe oubliée : s appel", elis("Mon chat s appel Tom."), [["s appel", "s'appel"]]);
verifier("l'apostrophe oubliée : qu il", elis("Je crois qu il vient."), [["qu il", "qu'il"]]);

/* ── 2. Pièges : aucune élision ──────────────────────────────────────────── */

const justes = [
  "Le héros est arrivé.",           // h aspiré
  "Il prend la hache.",             // h aspiré
  "Le hibou chante la nuit.",       // h aspiré
  "Le hamster dort.",               // h aspiré (absent de la liste des muets)
  "Prends-le avec toi.",            // impératif
  "Donne-la à ta sœur.",            // impératif
  "Ai-je eu raison ?",              // inversion
  "Puis-je entrer ?",               // inversion
  "Viens si elle est là.",          // « si elle » ne s'élide pas
  "Il mange ce abricot.",           // « cet », pas « c' » : pas une élision
  "Le onze est mon numéro.",        // onze
  "Il a dit oui, le oui du cœur.",  // oui
  "Le yaourt est bon.",             // y consonne
  "Il faut que Paul vienne.",       // consonne
  "Il va jusqu'à la mer.",          // déjà élidé
  "C'est l'heure.",                 // déjà élidé
  "Il le a vu.".replace("le a", "l'a"), // déjà élidé
];
verifier("aucune élision sur les pièges", justes.flatMap((t) => elis(t)), []);

/* ── 3. Majuscules manquantes ────────────────────────────────────────────── */

verifier("début de texte", majs("il pleut."), [["il", "Il"]]);
verifier("après un point", majs("Il pleut. je reste."), [["je", "Je"]]);
verifier("après ! et ?", majs("Viens ! tu es là ? oui."), [["tu", "Tu"], ["oui", "Oui"]]);
verifier("après un guillemet ouvrant", majs("Il dit. « bonjour »"), [["bonjour", "Bonjour"]]);
verifier("texte d'élève sans aucune majuscule",
  majs("hier on est allé au parc. apres on a mangé."), [["hier", "Hier"], ["apres", "Apres"]]);

/* ── 4. Pièges : aucune majuscule ────────────────────────────────────────── */

const bien = [
  "« Quoi ? » dit-il.",              // incise après un dialogue
  "« Au secours ! » cria la fille.", // incise après un dialogue
  "Il hésita… puis partit.",         // points de suspension
  "Il hésita... puis partit.",       // points de suspension en trois points
  "Des pommes, des poires, etc. et des fruits.", // abréviation
  "Il pleut.\nil fait froid",        // retour à la ligne précédé d'un point : ↓
];
verifier("aucune majuscule sur les pièges (sauf la ligne après un point)",
  bien.flatMap((t) => majs(t)), [["il", "Il"]]);
verifier("un retour à la ligne SANS point ne dit rien (poème, liste)",
  majs("Il pleut\nil fait froid"), []);
verifier("un mot déjà en majuscule n'est pas signalé", majs("Il pleut. Je reste."), []);

/* ── 5. Ensemble, sans doublon ───────────────────────────────────────────── */

verifier("« que il » en tête : une seule faute, avec la majuscule",
  fautesTypographiques("Il part. que il pleuve ou non.").map((f) => [f.mot, f.attendu, f.nature]),
  [["que il", "Qu'il", "elision"]]);
verifier("les deux sortes, dans l'ordre du texte",
  fautesTypographiques("le arbre est grand. je le vois.").map((f) => [f.mot, f.attendu]),
  [["le arbre", "L'arbre"], ["je", "Je"]]);

/* ── 6. Reconnaître ce que le modèle annonce ─────────────────────────────── */

verifier("annonce de majuscule", [estAnnonceMajuscule("léo", "Léo"), estAnnonceMajuscule("léo", "Léa")], [true, false]);
verifier("annonce d'élision", [estAnnonceElision("que on", "qu'on"), estAnnonceElision("on", "ont")], [true, false]);

/* ── 7. Fusion avec ce que signale le modèle ─────────────────────────────── */

const DICO = new Set(["paris", "après", "il", "va", "à", "avec"]);
const connu = (c) => DICO.has(c);
const fus = (t, erreurs) => fusionnerTypographie(t, erreurs, connu).map((e) => [e.mot, e.type]);

const t1 = "Il pleut. je reste avec léo et paris.";
verifier("majuscule de début de phrase : celle du détecteur, une seule fois",
  fus(t1, [{ mot: "je", type: "syntaxe", position: 10, attendu: "Je" }]), [["je", "syntaxe"]]);
verifier("un prénom hors du dictionnaire : l'avis du modèle est gardé",
  fus(t1, [{ mot: "léo", type: "syntaxe", position: 24, attendu: "Léo" }]),
  [["je", "syntaxe"], ["léo", "syntaxe"]]);
verifier("« paris » existe (des paris) : pas un prénom pour nous",
  fus(t1, [{ mot: "paris", type: "syntaxe", position: 31, attendu: "Paris" }]), [["je", "syntaxe"]]);

const t2 = "Viens si elle est là.";
verifier("une fausse élision du modèle est retirée, rien n'est ajouté",
  fus(t2, [{ mot: "si elle", type: "syntaxe", position: 6, attendu: "s'elle" }]), []);

const t3 = "Il va à la plage. apres il rentre.";
verifier("une faute du modèle au même endroit l'emporte : un endroit, un signalement",
  fus(t3, [{ mot: "apres", type: "orthographe", position: 18, attendu: "après" }]),
  [["apres", "orthographe"]]);

const t5 = "Elle avança. « prends-le avec toi »";
verifier("une remarque de syntaxe sans attendu, sur une faute détectée : le détecteur l'emporte",
  fus(t5, [{ mot: "prends-le", type: "syntaxe", position: t5.indexOf("prends") }]), [["prends", "syntaxe"]]);
verifier("une remarque de syntaxe ailleurs (ponctuation…) est gardée",
  fus("Il pleut et il fait froid", [{ mot: "froid", type: "syntaxe", position: 20 }]), [["froid", "syntaxe"]]);

const t4 = "a. b. c. d. e. f. g.";
const quatorze = Array.from({ length: 14 }, (_, i) => ({ mot: "x", type: "grammaire", position: 100 + i }));
verifier("sous le plafond, les fautes du modèle passent avant les majuscules",
  fusionnerTypographie(t4, quatorze, connu).filter((e) => e.type === "grammaire").length, 14);
verifier("et le plafond tient", fusionnerTypographie(t4, quatorze, connu).length, 15);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

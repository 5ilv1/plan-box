#!/usr/bin/env npx tsx
/**
 * Contrat de la correction automatique d'un texte d'élève.
 *
 * La règle tient en une phrase : **on n'affiche que ce qu'on a vérifié**. Un
 * CE2 qui « corrige » un mot juste apprend la faute — une erreur ratée coûte
 * moins cher qu'une erreur inventée.
 *
 * Lancer après toute modification de lib/ecriture-correction.ts :
 *   npx tsx docs/tests/test-ecriture-correction.mjs
 */
import {
  verifierErreurs, occurrences, segments, cleLexique, motsAVerifier,
  motAtteste, estNomPropre, reporterErreurs, MAX_ERREURS,
} from "../../lib/ecriture-correction.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

// Un dictionnaire de poche : ces mots existent, les autres non.
const MOTS = new Set(["chevaux", "mangeaient", "élève", "maison", "ou", "où", "a", "à",
  "petit", "petits", "chats", "hui", "grand", "père", "grand-père", "il", "mange",
  "mangent", "les", "des", "très", "eau", "galop"]);
const connu = (c) => MOTS.has(c);

/* ── 1. Le mot doit être dans le texte ───────────────────────────────────── */

const texte = "Les chevaux mangeaient dans la maison. Les chats sont trés petit.";

verifier("un mot absent du texte est écarté",
  verifierErreurs(texte, [{ mot: "zzzz", type: "orthographe", position: 0 }], connu), []);

verifier("la position du modèle est recalculée, pas crue",
  verifierErreurs(texte, [{ mot: "trés", type: "orthographe", position: 0 }], connu)
    .map((e) => e.position), [texte.indexOf("trés")]);

verifier("un mot au milieu d'un autre n'est pas surligné",
  // « a » est dans « chevaux » ? non — mais « maison » contient « ai » ; on
  // vérifie qu'un fragment ne passe pas pour un mot.
  verifierErreurs("La maison est grande.", [{ mot: "ai", type: "orthographe", position: 4 }], connu), []);

verifier("occurrences : mot entier seulement",
  occurrences("Le chat chatouille le chat.", "chat"), [3, 22]);

verifier("occurrences : la casse ne compte pas",
  occurrences("Chat et chat.", "chat"), [0, 8]);

verifier("occurrences : l'accent compte",
  occurrences("Il est ou ? Là où il veut.", "où"), [15]);

/* ── 2. Deux occurrences du même mot ─────────────────────────────────────── */

const deux = "Il mange. Elle mange aussi.";
verifier("deux signalements du même mot visent deux endroits",
  verifierErreurs(deux, [
    { mot: "mange", type: "grammaire", position: 3 },
    { mot: "mange", type: "grammaire", position: 15 },
  ], connu).map((e) => e.position), [3, 15]);

verifier("un troisième signalement, sans occurrence libre, est écarté",
  verifierErreurs(deux, [
    { mot: "mange", type: "grammaire", position: 3 },
    { mot: "mange", type: "grammaire", position: 15 },
    { mot: "mange", type: "grammaire", position: 3 },
  ], connu).length, 2);

/* ── 3. Le dictionnaire écarte les faux positifs ─────────────────────────── */

verifier("« chevaux » existe : ce n'est pas une faute d'orthographe",
  verifierErreurs(texte, [{ mot: "chevaux", type: "orthographe", position: 4 }], connu), []);

verifier("« mangeaient » existe : forme fléchie acceptée",
  verifierErreurs(texte, [{ mot: "mangeaient", type: "orthographe", position: 12 }], connu), []);

verifier("« trés » n'existe pas : la faute passe",
  verifierErreurs(texte, [{ mot: "trés", type: "orthographe", position: 57 }], connu).length, 1);

verifier("le dictionnaire ne dit rien d'un accord : « petit » reste signalé",
  verifierErreurs(texte, [{ mot: "petit", type: "grammaire", position: 62 }], connu).length, 1);

verifier("mot composé : tous les segments connus ⇒ écarté",
  verifierErreurs("Aujourd'hui il pleut.", [{ mot: "Aujourd'hui", type: "orthographe", position: 0 }], connu), []);

/* ── 4. La correction proposée ───────────────────────────────────────────── */

const avecCorrection = (correction) =>
  verifierErreurs(texte, [{ mot: "trés", type: "orthographe", position: 57, correction }], connu)[0];

verifier("une correction qui existe est gardée", avecCorrection("très")?.correction, "très");
verifier("une correction inventée est retirée", avecCorrection("trèss")?.correction, undefined);
verifier("une correction identique au mot est retirée", avecCorrection("trés")?.correction, undefined);
verifier("l'erreur survit à une correction retirée", avecCorrection("trèss")?.mot, "trés");

/* ── 5. Formes invalides ─────────────────────────────────────────────────── */

verifier("un type inconnu est écarté",
  verifierErreurs(texte, [{ mot: "chats", type: "style", position: 43 }], connu), []);
verifier("un mot vide est écarté",
  verifierErreurs(texte, [{ mot: "   ", type: "orthographe", position: 0 }], connu), []);
verifier("une réponse qui n'est pas un tableau ne casse rien",
  verifierErreurs(texte, { erreurs: [] }, connu), []);
verifier("une réponse nulle ne casse rien", verifierErreurs(texte, null, connu), []);

/* ── 6. Le texte fait foi ────────────────────────────────────────────────── */

verifier("le mot rendu est celui du texte, avec sa casse",
  verifierErreurs("Chevalx au galop.", [{ mot: "chevalx", type: "orthographe", position: 0 }], connu)[0]?.mot,
  "Chevalx");

verifier("les erreurs sortent dans l'ordre du texte",
  verifierErreurs("zzz puis yyy", [
    { mot: "yyy", type: "orthographe", position: 9 },
    { mot: "zzz", type: "orthographe", position: 0 },
  ], connu).map((e) => e.mot), ["zzz", "yyy"]);

verifier("plafond à 15 erreurs",
  verifierErreurs(
    Array.from({ length: 20 }, (_, i) => `faut${i}`).join(" "),
    Array.from({ length: 20 }, (_, i) => ({ mot: `faut${i}`, type: "orthographe", position: 0 })),
    connu,
  ).length, MAX_ERREURS);

/* ── 7. Dictionnaire injoignable : on ne supprime pas tout ───────────────── */

verifier("sans dictionnaire, les erreurs passent comme avant",
  verifierErreurs(texte, [{ mot: "chevaux", type: "orthographe", position: 4 }], () => false).length, 1);

/* ── 8. Utilitaires ──────────────────────────────────────────────────────── */

verifier("clé de lexique : minuscules, accents GARDÉS", cleLexique("Élève"), "élève");
verifier("clé de lexique : rien d'autre que des lettres", cleLexique("l'eau"), "");
verifier("segments d'un mot composé", segments("aujourd'hui"), ["aujourd", "hui"]);
verifier("mots à vérifier : mot et correction, sans doublon",
  motsAVerifier([
    { mot: "trés", correction: "très" },
    { mot: "trés" },
  ]).sort(), ["très", "trés"]);

/* ── 9. Accents, élisions, noms propres ──────────────────────────────────── */

verifier("l'accent distingue « très » de « trés »",
  [motAtteste("très", connu), motAtteste("trés", connu)], [true, false]);
verifier("« élève » est attesté, « eleve » non",
  [motAtteste("élève", connu), motAtteste("eleve", connu)], [true, false]);
verifier("une élision est attestée : « qu'il »", motAtteste("qu'il", connu), true);
verifier("« aujourd'hui » aussi, alors que « aujourd » seul n'existe pas",
  motAtteste("aujourd'hui", connu), true);
verifier("un mot à tiret : chaque segment compte", motAtteste("grand-père", connu), true);
verifier("« quil » sans apostrophe reste une faute", motAtteste("quil", connu), false);

const phrase = "Léa joue. Elle a vu Timéo hier.";
verifier("un prénom en cours de phrase ne se vérifie pas",
  estNomPropre(phrase, phrase.indexOf("Timéo"), "Timéo"), true);
verifier("une majuscule de début de phrase n'est pas un nom propre",
  estNomPropre(phrase, phrase.indexOf("Elle"), "Elle"), false);
verifier("le tout premier mot non plus",
  estNomPropre(phrase, 0, "Léa"), false);
verifier("un prénom inconnu n'est jamais signalé en orthographe",
  verifierErreurs(phrase, [{ mot: "Timéo", type: "orthographe", position: 20 }], connu), []);

/* ── 10. Suivre les erreurs pendant que l'élève écrit ────────────────────── */

const avant = "Il mange. Tu mange. Elle mange.";
const faute = { mot: "mange", type: "grammaire", position: avant.indexOf("mange", 13) }; // « Tu mange »

verifier("rien ne change, rien ne bouge",
  reporterErreurs(avant, avant, [faute]).map((e) => e.position), [faute.position]);

verifier("une retouche en début de texte décale l'erreur, elle ne saute pas ailleurs",
  reporterErreurs(avant, "Oui. " + avant, [faute]).map((e) => e.position), [faute.position + 5]);

verifier("une retouche après l'erreur ne la déplace pas",
  reporterErreurs(avant, avant + " Fin.", [faute]).map((e) => e.position), [faute.position]);

verifier("corriger le mot fait disparaître l'erreur — même si le mot existe ailleurs",
  reporterErreurs(avant, avant.replace("Tu mange", "Tu manges"), [faute]), []);

verifier("remplacer le mot par autre chose aussi",
  reporterErreurs(avant, avant.replace("Tu mange", "Tu cours"), [faute]), []);

verifier("une retouche dans une autre phrase laisse l'erreur intacte",
  reporterErreurs(avant, avant.replace("Il mange", "Il mangeait"), [faute])
    .map((e) => avant.replace("Il mange", "Il mangeait").slice(e.position, e.position + 5)), ["mange"]);

verifier("supprimer du texte avant l'erreur la ramène d'autant",
  reporterErreurs(avant, avant.slice(10), [faute]).map((e) => e.position), [faute.position - 10]);

verifier("plusieurs erreurs : chacune suit son sort",
  reporterErreurs("aa bb cc", "aa XX cc", [
    { mot: "aa", position: 0 }, { mot: "bb", position: 3 }, { mot: "cc", position: 6 },
  ]).map((e) => e.mot), ["aa", "cc"]);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

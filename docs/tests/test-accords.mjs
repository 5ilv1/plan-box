#!/usr/bin/env npx tsx
/**
 * Contrat de la vérification des accords et des temps.
 *
 * Lancer après toute modification de lib/accords.ts ou de la partie accords
 * de lib/ecriture-correction.ts :
 *   npx tsx docs/tests/test-accords.mjs
 */
import motsFrancais from "an-array-of-french-words";
import { memeMot, trancherAccord, IRREGULIERS } from "../../lib/accords.ts";
import { phrasePrecedente } from "../../lib/homophones.ts";
import { lireAccord } from "../../lib/ecriture-analyse.ts";
import {
  verifierErreurs, questionsDAccord, appliquerVerdicts, publier,
} from "../../lib/ecriture-correction.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}
const DICO = new Set(motsFrancais);
const connu = (c) => DICO.has(c);

/* ── 1. La table des irréguliers ne contient que des mots ────────────────── */

const inconnus = Object.entries(IRREGULIERS)
  .flatMap(([verbe, formes]) => formes.filter((f) => !DICO.has(f)).map((f) => `${verbe}:${f}`));
verifier("chaque forme irrégulière existe dans le dictionnaire", inconnus, []);

/* ── 2. Le même mot ──────────────────────────────────────────────────────── */

const memes = [
  ["jouait", "jouaient"], ["mange", "mangent"], ["petit", "petits"], ["grand", "grande"],
  ["chanté", "chanter"], ["cheval", "chevaux"], ["sera", "seras"], ["finit", "finissait"],
  ["mangeais", "mangeait"], ["est", "sont"], ["va", "vont"], ["bois", "buvais"], ["a", "ont"],
  ["peut", "peuvent"], ["fait", "font"], ["dort", "dorment"], ["attend", "attendent"],
  ["partais", "partirai"], ["visitions", "visiterons"], ["marcheront", "marchaient"],
];
verifier("autres formes du même mot",
  memes.filter(([a, b]) => !memeMot(a, b)), []);

const differents = [
  ["mange", "manche"], ["chat", "chien"], ["est", "et"], ["bois", "vois"], ["jouait", "joue-t-il"],
  ["porte", "porte"],
];
verifier("pas le même mot",
  differents.filter(([a, b]) => memeMot(a, b)), []);

/* ── 3. Trancher ─────────────────────────────────────────────────────────── */

verifier("la phrase de l'élève est acceptable ⇒ pas de faute",
  trancherAccord(["ecrit"]), { faute: false });
verifier("les deux sont acceptables (présent de narration…) ⇒ pas de faute",
  trancherAccord(["ecrit", "attendu"]), { faute: false });
verifier("seule la corrigée l'est ⇒ faute", trancherAccord(["attendu"]), { faute: true });
verifier("aucune ⇒ on se tait", trancherAccord([]), { faute: null });
verifier("illisible ⇒ on se tait", trancherAccord(null), { faute: null });

/* ── 4. Dans la vérification complète ────────────────────────────────────── */

const texte = "Les enfants jouait dans la cour. Ils est contents. Il mange une pomme.";
const brutes = [
  { mot: "jouait", type: "grammaire", position: 12, attendu: "jouaient" },
  { mot: "est", type: "grammaire", position: 37, attendu: "sont" },
  // une « correction » qui change de mot : ce n'est pas un accord
  { mot: "mange", type: "grammaire", position: 55, attendu: "croque" },
  // pas d'attendu : invérifiable, on se tait
  { mot: "contents", type: "grammaire", position: 41 },
];
const verifiees = verifierErreurs(texte, brutes, connu);
verifier("seules les formes du même mot passent au test",
  verifiees.map((e) => [e.mot, !!e.aAccorder]), [["jouait", true], ["est", true]]);

const questions = questionsDAccord(texte, verifiees);
verifier("deux phrases qui ne diffèrent que par le mot",
  [questions[0].A, questions[0].B].sort(),
  ["Les enfants jouaient dans la cour.", "Les enfants jouait dans la cour."].sort());
verifier("l'ordre élève / corrigée alterne",
  questions.map((q) => q.ecritEn), ["A", "B"]);

// « jouait » : seule la corrigée ; « est » : les deux (le vérificateur doute).
const acc = questions.map((q, i) =>
  i === 0 ? [q.ecritEn === "A" ? "B" : "A"] : ["A", "B"]);
const finales = appliquerVerdicts(verifiees, [], [], [], [], questions, acc);
verifier("faute confirmée seulement quand la phrase de l'élève est refusée",
  finales.map((e) => [e.mot, e.attendu]), [["jouait", "jouaient"]]);

verifier("un verdict illisible efface la faute",
  appliquerVerdicts(verifiees, [], [], [], [], questions, [null, null]), []);

verifier("publier retire le drapeau d'accord",
  publier(finales).some((e) => "aAccorder" in e), false);

/* ── 4 bis. L'étiquette ne décide pas ────────────────────────────────────── */

const pluriel = "Il a des tache blanche.";
verifier("un pluriel oublié étiqueté « orthographe » passe au test des deux phrases",
  verifierErreurs(pluriel, [{ mot: "tache", type: "orthographe", position: 9, attendu: "taches" }], connu)
    .map((e) => [e.mot, e.type, e.aAccorder]), [["tache", "grammaire", true]]);
verifier("une vraie faute d'orthographe reste une faute d'orthographe",
  verifierErreurs("Il a des tachs.", [{ mot: "tachs", type: "orthographe", position: 9, attendu: "taches" }], connu)
    .map((e) => [e.type, !!e.aAccorder]), [["orthographe", false]]);

/* ── 5. Le contexte des temps, et la lecture des verdicts ────────────────── */

const recit = "Hier ma mère m'a emmené à la plage. Je bois une limonade. Il fait chaud.";
verifier("la phrase d'avant sert de contexte",
  phrasePrecedente(recit, recit.indexOf("bois")), "Hier ma mère m'a emmené à la plage.");
verifier("pas de contexte au début du texte", phrasePrecedente(recit, 0), "");

verifier("verdicts : A, B, les deux, aucune",
  [lireAccord([{ paire: 1, correctes: ["A"] }], 1),
   lireAccord([{ paire: 1, correctes: ["B", "A"] }], 1),
   lireAccord([{ paire: 1, correctes: [] }], 1)],
  [["A"], ["B", "A"], []]);
verifier("verdicts illisibles",
  [lireAccord([{ paire: 1, correctes: ["C"] }], 1),
   lireAccord([{ paire: 2, correctes: ["A"] }], 1),
   lireAccord([{ paire: 1, correctes: ["A"] }, { paire: 1, correctes: ["B"] }], 1),
   lireAccord([{ paire: 1 }], 1)],
  [null, null, null, null]);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

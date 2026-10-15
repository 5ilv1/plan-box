#!/usr/bin/env npx tsx
/**
 * Contrat de la relecture des QCM (lib/relire-qcm.ts).
 *
 * Une question sans bonne option, avec plusieurs, ou dont la bonne option
 * n'est pas celle attendue est écartée. Un verdict illisible ne fait rien
 * écarter : la relecture ne doit jamais vider un QCM par sa propre panne.
 *
 *   npx tsx docs/tests/test-relire-qcm.mjs
 */
import { trancherQcm, lireVerdicts, couperQcm } from "../../lib/relire-qcm.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

const q = (question, options, reponse_correcte) => ({ question, options, reponse_correcte });
// Les deux questions du 13/10, et une saine.
const sansBonne = q("Ma sœur ... très courageuse.", ["es", "êtes", "sommes", "suis"], 0);
const deuxBonnes = q("Laquelle est déclarative ?", ["Quelle heure est-il ?", "Le vent souffle fort ce soir.", "Range ta chambre !", "Les fleurs poussent au printemps."], 1);
const saine = q("Tu ... un beau vélo.", ["a", "as", "avons", "ont"], 1);
const garde = (qs, vs) => trancherQcm(qs, vs).questions.map((x) => x.question);
const raisons = (qs, vs) => trancherQcm(qs, vs).ecartees.map((x) => x.raison);

/* ── Trancher ───────────────────────────────────────────────────────────── */
verifier("saine gardée", garde([saine], [["as"]]), [saine.question]);
verifier("aucune bonne option", raisons([sansBonne], [[]]), ["aucune"]);
verifier("deux bonnes options", raisons([deuxBonnes], [["Le vent souffle fort ce soir.", "Les fleurs poussent au printemps."]]), ["plusieurs"]);
verifier("le relecteur désigne une autre option", raisons([saine], [["a"]]), ["autre"]);
verifier("casse et espaces ignorés", garde([saine], [["  AS "]]), [saine.question]);
verifier("option recopiée deux fois = une seule", garde([saine], [["as", "as"]]), [saine.question]);
verifier("texte hors options : gardée (verdict décalé)", garde([saine], [["avez"]]), [saine.question]);
verifier("verdict absent : gardée", garde([saine], [null]), [saine.question]);
verifier("mélange", garde([sansBonne, saine, deuxBonnes], [[], ["as"], ["Le vent souffle fort ce soir."]]), [saine.question, deuxBonnes.question]);
verifier("l'ordre est conservé", garde([saine, deuxBonnes], [["as"], ["Le vent souffle fort ce soir."]]), [saine.question, deuxBonnes.question]);

verifier("question dessinée jamais écartée", garde([{ ...saine, question: "Quelle figure ?", figure: { type: "disque" } }], [[]]), ["Quelle figure ?"]);
verifier("options dessinées jamais écartées", garde([{ ...saine, question: "7/8 ?", options_figures: [{}, {}, {}, {}] }], [[]]), ["7/8 ?"]);

/* ── Lire la sortie de l'outil ──────────────────────────────────────────── */
verifier("sortie absente", lireVerdicts(undefined, 2), [null, null]);
verifier("sortie normale", lireVerdicts([{ question: 1, options_justes: ["as"] }, { question: 2, options_justes: [] }], 2), [["as"], []]);
verifier("numéro hors limites ignoré", lireVerdicts([{ question: 3, options_justes: ["x"] }], 2), [null, null]);
verifier("numéro non entier ignoré", lireVerdicts([{ question: 1.5, options_justes: ["x"] }], 2), [null, null]);
verifier("options non textuelles ignorées", lireVerdicts([{ question: 1, options_justes: [2] }], 1), [null]);
verifier("deux verdicts contradictoires : aucun", lireVerdicts([{ question: 1, options_justes: ["a"] }, { question: 1, options_justes: ["as"] }], 1), [null]);
verifier("verdict manquant pour une question", lireVerdicts([{ question: 2, options_justes: ["b"] }], 2), [null, ["b"]]);

/* ── Couper ─────────────────────────────────────────────────────────────── */
verifier("coupe à la marge", couperQcm([1, 2, 3, 4, 5], 3), [1, 2, 3]);
verifier("moins que demandé : tout", couperQcm([1, 2], 3), [1, 2]);

if (echecs) { console.log(`\n✗ ${echecs}/${total} cas en échec`); process.exit(1); }
console.log(`✓ ${total} cas passent`);

#!/usr/bin/env npx tsx
/**
 * Contrat du Rallye Bestioles (lib/rallye-bestioles.ts) et de ses fiches
 * (lib/rallye-bestioles.json).
 *
 *  • tirage : 3 podcasts distincts, jamais un podcast déjà joué, le même
 *    toute la journée pour un élève, différent d'un élève ou d'un jour à l'autre ;
 *  • score : 1 point par bonne réponse, 0 sinon, deux bonnes options acceptées ;
 *  • classement : points cumulés des podcasts terminés, ex aequo au même rang,
 *    prénoms en double départagés par l'initiale du nom ;
 *  • fiches : 5 questions, 3 options, bonnes réponses valides, audio Radio France.
 *
 * Lancer après toute modification du module ou des fiches :
 *   npx tsx docs/tests/test-rallye-bestioles.mjs
 */
import { tirerPropositions, scorePartie, estBonne, classer, questionsPubliques } from "../../lib/rallye-bestioles.ts";
import fiches from "../../lib/rallye-bestioles.json" with { type: "json" };

let ok = 0, ko = 0;
const verifier = (cond, nom) => { if (cond) ok++; else { ko++; console.log("✗", nom); } };

// ── Tirage ──
const tous = fiches.map((f) => f.numero);
const t1 = tirerPropositions(tous, "rb_12", "2026-10-23");
verifier(t1.length === 3 && new Set(t1).size === 3, "3 podcasts distincts");
verifier(JSON.stringify(t1) === JSON.stringify(tirerPropositions(tous, "rb_12", "2026-10-23")), "même tirage dans la journée");
verifier(JSON.stringify(t1) === JSON.stringify(tirerPropositions([...tous].reverse(), "rb_12", "2026-10-23")), "tirage indépendant de l'ordre de la liste");
verifier(JSON.stringify(t1) !== JSON.stringify(tirerPropositions(tous, "rb_12", "2026-10-24")), "autre jour ⇒ autre tirage");
verifier(JSON.stringify(t1) !== JSON.stringify(tirerPropositions(tous, "rb_13", "2026-10-23")), "autre élève ⇒ autre tirage");
const restants = tous.filter((n) => !t1.includes(n));
verifier(tirerPropositions(restants, "rb_12", "2026-10-24").every((n) => !t1.includes(n)), "un podcast joué n'est plus proposé");
verifier(JSON.stringify(tirerPropositions([7, 9], "rb_12", "2026-10-23").sort()) === "[7,9]", "moins de 3 restants ⇒ ce qui reste");
verifier(tirerPropositions([], "rb_12", "2026-10-23").length === 0, "plus rien ⇒ aucune proposition");
let couverts = new Set();
for (let j = 1; j <= 28; j++) for (let e = 0; e < 25; e++) tirerPropositions(tous, `rb_${e}`, `2026-11-${String(j).padStart(2, "0")}`).forEach((n) => couverts.add(n));
verifier(couverts.size > tous.length * 0.95, "le tirage couvre presque toutes les fiches");

// ── Score ──
const f = { questions: [
  { question: "a", options: ["x", "y", "z"], bonnes: [1] },
  { question: "b", options: ["x", "y", "z"], bonnes: [0, 2] },
  { question: "c", options: ["x", "y", "z"], bonnes: [2] },
] };
verifier(scorePartie(f, [1, 2, 0]) === 2, "1 point par bonne réponse, 0 sinon");
verifier(scorePartie(f, [null, null, null]) === 0, "pas répondu ⇒ 0");
verifier(estBonne(f.questions[1], 0) && estBonne(f.questions[1], 2) && !estBonne(f.questions[1], 1), "deux bonnes options acceptées");
verifier(questionsPubliques(f).every((q) => !("bonnes" in q)), "les questions publiques n'ont pas les réponses");

// ── Classement ──
const p = (cle, prenom, score, termine = true, nom = "") => ({ cle, prenom, nom, score, termine });
const c = classer([p("a", "Léa", 4), p("a", "Léa", 5), p("b", "Tom", 9), p("c", "Zoé", 3), p("c", "Zoé", 5, false), p("d", "Ali", 3)]);
verifier(c[0].prenom === "Léa" && c[0].rang === 1 && c[1].prenom === "Tom" && c[1].rang === 1, "ex aequo ⇒ même rang");
verifier(c[2].rang === 3 && c[3].rang === 3, "rang suivant les ex aequo : 1, 1, 3, 3");
verifier(c.find((l) => l.prenom === "Zoé").points === 3, "un podcast non terminé ne compte pas");
verifier(c[2].prenom === "Ali", "à points égaux, ordre alphabétique");
verifier(c.find((l) => l.cle === "a").podcasts === 2, "nombre de podcasts terminés");
const d = classer([p("x", "Emma", 2, true, "Martin"), p("y", "Emma", 1, true, "Durand")]);
verifier(d[0].prenom === "Emma M." && d[1].prenom === "Emma D.", "prénoms en double ⇒ initiale du nom");
verifier(classer([]).length === 0, "personne ⇒ classement vide");

// ── Fiches ──
verifier(fiches.length >= 130, `au moins 130 fiches (${fiches.length})`);
verifier(new Set(tous).size === tous.length, "numéros uniques");
for (const fi of fiches) {
  const nom = `fiche ${fi.numero}`;
  verifier(fi.questions.length === 5, `${nom} : 5 questions`);
  verifier(/^https:\/\/media\.radiofrance-podcast\.net\//.test(fi.audio), `${nom} : audio servi par Radio France`);
  verifier(/^https:\/\/www\.radiofrance\.fr\//.test(fi.page), `${nom} : page radiofrance.fr`);
  for (const [i, q] of fi.questions.entries()) {
    verifier(q.question.length > 3 && q.options.length === 3 && q.options.every((o) => o.length > 0), `${nom} q${i + 1} : énoncé et 3 options`);
    verifier(q.bonnes.length >= 1 && q.bonnes.length < 3 && q.bonnes.every((b) => b >= 0 && b < 3), `${nom} q${i + 1} : bonnes réponses valides`);
  }
}

console.log(`${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);

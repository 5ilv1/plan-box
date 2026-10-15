#!/usr/bin/env npx tsx
/**
 * Contrat de « livre terminé » (bibliothèque).
 *
 * L'évaluation finale clôt le livre QUEL QUE SOIT le score : un élève qui
 * l'échoue ne doit plus rester enfermé dans un livre lu jusqu'au bout.
 *
 * Lancer après toute modification de lib/livre-termine.ts :
 *   npx tsx docs/tests/test-livre-termine.mjs
 */
import { livreTermine, exosParLivre } from "../../lib/livre-termine.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

const exos = exosParLivre([
  { id: "a1", chapitre_id: "A", contenu: { titre: "ch1" } },
  { id: "a2", chapitre_id: "A", contenu: { titre: "ch2" } },
  { id: "aE", chapitre_id: "A", contenu: { est_evaluation_finale: true } },
  { id: "b1", chapitre_id: "B", contenu: null },
  { id: "b2", chapitre_id: "B", contenu: { est_evaluation_finale: "true" } }, // pas un booléen
]);
const traces = (o = {}) => ({
  evalsPassees: new Set(o.evals ?? []),
  exosParChap: exos,
  exosFaits: new Set(o.faits ?? []),
  exosValides: new Set(o.valides ?? []),
});

/* ── Rangement des exercices ────────────────────────────────────────────── */
verifier("éval finale repérée", exos.get("A").map((e) => e.estEval), [false, false, true]);
verifier("« true » en texte n'est pas une éval", exos.get("B").map((e) => e.estEval), [false, false]);

/* ── Livre avec évaluation finale ───────────────────────────────────────── */
verifier("rien de fait", livreTermine("A", traces()), false);
verifier("chapitres validés, éval pas passée", livreTermine("A", traces({ faits: ["a1", "a2"], valides: ["a1", "a2"] })), false);
verifier("éval passée et RATÉE (evaluation_resultat)", livreTermine("A", traces({ evals: ["A"] })), true);
verifier("éval faite et RATÉE (exercice_resultat non validé)", livreTermine("A", traces({ faits: ["aE"] })), true);
verifier("éval faite et réussie", livreTermine("A", traces({ faits: ["aE"], valides: ["aE"] })), true);
verifier("éval d'un AUTRE livre", livreTermine("A", traces({ evals: ["B"] })), false);
verifier("un chapitre raté ne clôt pas", livreTermine("A", traces({ faits: ["a1"] })), false);

/* ── Livre sans évaluation finale dédiée ────────────────────────────────── */
verifier("tous validés", livreTermine("B", traces({ faits: ["b1", "b2"], valides: ["b1", "b2"] })), true);
verifier("faits mais un non validé", livreTermine("B", traces({ faits: ["b1", "b2"], valides: ["b1"] })), false);
verifier("évaluation passée par la page d'évaluation", livreTermine("B", traces({ evals: ["B"] })), true);

/* ── Livre inconnu ──────────────────────────────────────────────────────── */
verifier("sans exercice", livreTermine("Z", traces()), false);
verifier("sans exercice mais évalué", livreTermine("Z", traces({ evals: ["Z"] })), true);

if (echecs) { console.log(`\n✗ ${echecs}/${total} cas en échec`); process.exit(1); }
console.log(`✓ ${total} cas passent`);

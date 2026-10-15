#!/usr/bin/env npx tsx
/**
 * Contrat de la reprise des seules erreurs (lib/reprise-erreurs.ts).
 *
 * Dans le doute, TOUT est reposé (comportement d'avant) : jamais une bonne
 * réponse ne doit être attribuée à une question qu'elle ne concerne pas.
 *
 *   npx tsx docs/tests/test-reprise-erreurs.mjs
 */
import { clesARevoir, fusionnerReprise } from "../../lib/reprise-erreurs.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

const rep = (...v) => ({ reponses_eleve: v.map(([id, correcte]) => ({ id, reponse: "x", correcte })) });
const ids = [1, 2, 3, 4];

/* ── Quelles questions reposer ──────────────────────────────────────────── */
verifier("deux ratées sur quatre", clesARevoir("en_cours", rep([1, true], [2, false], [3, true], [4, false]), ids), [2, 4]);
verifier("ordre de l'exercice, pas des réponses", clesARevoir("en_cours", rep([4, false], [2, false], [1, true], [3, true]), ids), [2, 4]);
verifier("réaffecté (a_faire) : idem", clesARevoir("a_faire", rep([1, true], [2, false], [3, true], [4, true]), ids), [2]);
verifier("bloc fait : rien de filtré", clesARevoir("fait", rep([1, true], [2, false], [3, true], [4, true]), ids), null);
verifier("aucune réponse : tout", clesARevoir("en_cours", {}, ids), null);
verifier("réponses vides : tout", clesARevoir("en_cours", { reponses_eleve: [] }, ids), null);
verifier("tout faux : tout", clesARevoir("en_cours", rep([1, false], [2, false], [3, false], [4, false]), ids), null);
verifier("tout juste : tout (rien à cibler)", clesARevoir("en_cours", rep([1, true], [2, true], [3, true], [4, true]), ids), null);
verifier("question jamais répondue : reposée", clesARevoir("en_cours", rep([1, true], [2, true], [3, true]), ids), [4]);
verifier("correcte null : reposée", clesARevoir("en_cours", rep([1, true], [2, null], [3, true], [4, true]), ids), [2]);
verifier("réponse d'une question disparue : tout", clesARevoir("en_cours", rep([1, true], [9, false]), ids), null);
verifier("id illisible : tout", clesARevoir("en_cours", { reponses_eleve: [{ id: "1", correcte: true }] }, ids), null);
verifier("pas un tableau : tout", clesARevoir("en_cours", { reponses_eleve: "oui" }, ids), null);
verifier("contenu nul : tout", clesARevoir("en_cours", null, ids), null);

/* ── Regroupement (analyse de phrase : une phrase = plusieurs étapes) ───── */
const phrase = (id) => Math.floor((id - 1) / 10);
const etapes = rep([1, true], [2, true], [11, true], [12, false], [21, true]);
verifier("une étape ratée : la phrase reprise", clesARevoir("en_cours", etapes, [0, 1, 2], phrase), [1]);

/* ── Fusion ─────────────────────────────────────────────────────────────── */
const avant = rep([1, true], [2, false], [3, true], [4, false]).reponses_eleve;
const f = fusionnerReprise(avant, [{ id: 2, reponse: "ok", correcte: true }, { id: 4, reponse: "non", correcte: false }], [2, 4]);
verifier("score sur l'exercice entier", [f.bon, f.total], [3, 4]);
verifier("les justes d'avant gardées", f.reponses.filter((r) => r.id === 1 || r.id === 3).length, 2);
verifier("la reprise remplace l'ancienne réponse", f.reponses.find((r) => r.id === 2).reponse, "ok");
verifier("une seule réponse par question", f.reponses.map((r) => r.id).sort(), [1, 2, 3, 4]);
const fp = fusionnerReprise(etapes.reponses_eleve, [{ id: 11, reponse: "a", correcte: true }, { id: 12, reponse: "b", correcte: true }], [1], phrase);
verifier("analyse : la phrase reprise remplace toutes ses étapes", [fp.bon, fp.total], [5, 5]);
verifier("anciennes illisibles : seules les nouvelles", fusionnerReprise(null, [{ id: 2, reponse: "", correcte: true }], [2]).total, 1);

if (echecs) { console.log(`\n✗ ${echecs}/${total} cas en échec`); process.exit(1); }
console.log(`✓ ${total} cas passent`);

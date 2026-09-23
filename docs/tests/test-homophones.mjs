#!/usr/bin/env npx tsx
/**
 * Contrat de la vérification des homophones (« a » / « à », « vert » / « verre »).
 *
 * Deux garde-fous, et ce qu'ils garantissent :
 *  1. la FAMILLE fermée : le modèle ne peut pas proposer un mot sans rapport ;
 *  2. le TEST DE SUBSTITUTION : pour une paire grammaticale, la décision se
 *     déduit d'un choix entre deux phrases, pas du jugement du modèle.
 *
 * Lancer après toute modification de lib/homophones.ts ou de la partie
 * homophones de lib/ecriture-correction.ts :
 *   npx tsx docs/tests/test-homophones.mjs
 */
import {
  paireDe, memeFamille, estHomophone, phraseAutour, variantesDuTest,
  memeForme, trancher, PAIRES,
} from "../../lib/homophones.ts";
import {
  verifierErreurs, questionsDeTest, appliquerTests, publier,
} from "../../lib/ecriture-correction.ts";
import { lireVerdict } from "../../lib/ecriture-analyse.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}
const connu = () => true; // tous les mots existent : c'est le cas des homophones

/* ── 1. Familles ─────────────────────────────────────────────────────────── */

verifier("a / à : même famille", memeFamille("a", "à"), true);
verifier("vert / verre : même famille", memeFamille("vert", "verre"), true);
verifier("vert / chat : pas de famille", memeFamille("vert", "chat"), false);
verifier("un mot n'est pas son propre homophone", memeFamille("a", "a"), false);
verifier("la casse ne compte pas", memeFamille("Et", "est"), true);
verifier("est / sont : un accord, pas un homophone", memeFamille("est", "sont"), false);
verifier("« ou » est testable, « chat » non", [!!paireDe("ou"), !!paireDe("chat")], [true, false]);
verifier("« mer » est un homophone sans test", [estHomophone("mer"), !!paireDe("mer")], [true, false]);

/* ── 2. Les phrases du test ──────────────────────────────────────────────── */

const texte = "Hier il pleuvait. Léo va a la plage. Il a mangé.";
const posA = texte.indexOf("a la");
verifier("la phrase autour du mot, sans les voisines",
  (({ debut, fin }) => texte.slice(debut, fin))(phraseAutour(texte, posA)), "Léo va a la plage.");

verifier("les deux variantes ne diffèrent que par le mot",
  variantesDuTest(texte, posA, "a", paireDe("a")),
  { avecSubstitut: "Léo va avait la plage.", avecAutre: "Léo va à la plage." });

verifier("la majuscule est gardée dans la substitution",
  variantesDuTest("Est-ce que tu viens ?", 0, "Est", paireDe("est")).avecSubstitut,
  "Était-ce que tu viens ?");

/* ── 3. Trancher ─────────────────────────────────────────────────────────── */

const pA = paireDe("a");
verifier("« a » là où « avait » ne va pas ⇒ faute, attendu « à »",
  trancher("a", pA, false), { faute: true, attendu: "à" });
verifier("« a » là où « avait » va ⇒ pas de faute",
  trancher("a", pA, true), { faute: false });
verifier("« à » là où « avait » va ⇒ faute, attendu « a »",
  trancher("à", pA, true), { faute: true, attendu: "a" });
verifier("verdict illisible ⇒ on se tait",
  trancher("a", pA, null), { faute: null });

verifier("« A la plage » en début de phrase : majuscule sans accent acceptée",
  memeForme("A", "à"), true);
verifier("« a » minuscule n'est pas « à »", memeForme("a", "à"), false);
verifier("« A la plage » n'est jamais signalé", trancher("A", pA, false), { faute: false });

verifier("chaque paire a son indice, et l'indice ne donne pas la réponse",
  PAIRES.every((p) => p.indice.includes(p.substitut) && !p.indice.includes(`« ${p.autre} »`)), true);

/* ── 4. Dans la vérification complète ────────────────────────────────────── */

const brutes = [
  // une vraie confusion, étiquetée « grammaire » par le modèle
  { mot: "a", type: "grammaire", position: posA, attendu: "à", indice: "réfléchis" },
  // une fausse alerte : « a » est juste ici
  { mot: "a", type: "homophone", position: texte.indexOf("a mangé"), attendu: "à" },
];
const verifiees = verifierErreurs(texte, brutes, connu);
verifier("l'étiquette ne décide pas : les deux passent au test",
  verifiees.map((e) => [e.type, e.aTester]), [["homophone", true], ["homophone", true]]);
verifier("l'indice est celui du test, pas celui du modèle",
  verifiees[0].indice.includes("avait"), true);

const questions = questionsDeTest(texte, verifiees);
verifier("une question par faute à tester", questions.length, 2);
verifier("l'ordre A/B alterne", questions.map((q) => q.substitutEn), ["A", "B"]);

// Le vérificateur choisit la phrase juste : « à la plage » ; « Il a mangé ».
const choix = questions.map((q) => {
  const juste = q.A.includes("à la plage") || q.A.includes("Il avait mangé") ? "A" : "B";
  return juste;
});
const finales = appliquerTests(verifiees, questions, choix);
verifier("la vraie confusion reste, la fausse alerte disparaît",
  finales.map((e) => [e.mot, e.position, e.attendu]), [["a", posA, "à"]]);

verifier("un verdict illisible efface la faute",
  appliquerTests(verifiees, questions, [null, null]), []);

verifier("publier retire les champs internes",
  Object.keys(publier(finales)[0]).sort(), ["indice", "mot", "position", "type"]);

// Lexical : la famille suffit à passer, sans test.
const vert = "Je bois dans un vert.";
const lex = verifierErreurs(vert, [
  { mot: "vert", type: "orthographe", position: 15, attendu: "verre", indice: "Pense au récipient." },
], connu);
verifier("« vert » pour « verre » : même famille ⇒ gardé, sans test",
  lex.map((e) => [e.type, !!e.aTester]), [["homophone", false]]);

verifier("« vert » pour « chat » : hors famille ⇒ écarté (et le dictionnaire l'écarte aussi)",
  verifierErreurs(vert, [{ mot: "vert", type: "orthographe", position: 15, attendu: "chat" }], connu), []);

verifier("une confusion annoncée sans attendu ⇒ on se tait",
  verifierErreurs(vert, [{ mot: "vert", type: "homophone", position: 15 }], connu), []);

verifier("« ils est » → « sont » reste un accord, pas un homophone",
  verifierErreurs("Ils est partis.", [{ mot: "est", type: "grammaire", position: 4, attendu: "sont" }], connu)
    .map((e) => [e.type, !!e.aTester]), [["grammaire", false]]);

/* ── 5. Lire la réponse du vérificateur ──────────────────────────────────── */

// Il nomme le mot, pas une lettre : une confusion ou un décalage se voit.
const q = { index: 0, A: "…avait…", B: "…à…", substitutEn: "A", motA: "avait", motB: "à" };
verifier("le mot de la phrase A ⇒ A", lireVerdict([{ paire: 1, mot: "avait" }], 1, q), "A");
verifier("le mot de la phrase B ⇒ B", lireVerdict([{ paire: 1, mot: "à" }], 1, q), "B");
verifier("guillemets et casse ne comptent pas", lireVerdict([{ paire: 1, mot: "« À »" }], 1, q), "B");
verifier("un mot hors de la paire ⇒ illisible", lireVerdict([{ paire: 1, mot: "a" }], 1, q), null);
verifier("un doute ⇒ illisible", lireVerdict([{ paire: 1, mot: "?" }], 1, q), null);
verifier("la paire manque ⇒ illisible", lireVerdict([{ paire: 2, mot: "avait" }], 1, q), null);
verifier("deux réponses contradictoires ⇒ illisible",
  lireVerdict([{ paire: 1, mot: "avait" }, { paire: 1, mot: "à" }], 1, q), null);
verifier("la même réponse répétée ⇒ lisible",
  lireVerdict([{ paire: 1, mot: "avait" }, { paire: 1, mot: "avait" }], 1, q), "A");
verifier("chaque question porte les deux mots, dans l'ordre des phrases",
  questions.map((x) => [x.substitutEn, x.motA, x.motB]), [["A", "avait", "à"], ["B", "à", "avait"]]);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

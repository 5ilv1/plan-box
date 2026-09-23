#!/usr/bin/env npx tsx
/**
 * Contrat de `extraireJSON()`, partagé par les quatorze routes de génération.
 *
 * La règle qui compte : tout texte qui se lisait avant se lit à l'identique.
 * Les nouveautés — les tableaux, et l'essai du candidat suivant quand le
 * premier est une accolade de la phrase d'introduction — ne font que
 * rattraper des réponses qui échouaient.
 *
 *   npx tsx docs/tests/test-extraire-json.mjs
 */
import { extraireJSON } from "../../lib/prompts-communs.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}
const echoue = (f) => { try { f(); return false; } catch { return true; } };

/* ── Objets : le comportement d'avant ────────────────────────────────────── */

verifier("objet nu", extraireJSON('{"a":1}'), { a: 1 });
verifier("objet entre backticks", extraireJSON('```json\n{"a":1}\n```'), { a: 1 });
verifier("phrase avant et après", extraireJSON('Voici : {"a":1} Je vérifie : ok.'), { a: 1 });
verifier("accolades dans une chaîne", extraireJSON('{"t":"un } piège {"}'), { t: "un } piège {" });
verifier("guillemet échappé dans une chaîne", extraireJSON('{"t":"il dit \\"}\\""}'), { t: 'il dit "}"' });
verifier("objets imbriqués", extraireJSON('{"a":{"b":[1,{"c":2}]}}'), { a: { b: [1, { c: 2 }] } });
verifier("le premier objet seulement", extraireJSON('{"a":1} {"b":2}'), { a: 1 });
verifier("aucun objet : erreur", echoue(() => extraireJSON("rien ici")), true);
verifier("objet tronqué : erreur", echoue(() => extraireJSON('{"a":1')), true);

// Nouveauté : une accolade dans l'introduction ne condamne plus la réponse.
verifier("accolade parasite avant le vrai objet",
  extraireJSON('Je remplace {n} par le nombre. {"a":1}'), { a: 1 });

/* ── Tableaux : le correcteur de réponses ────────────────────────────────── */

// LE cas du 23/09 : « Je vérifie… » en tête, et la validation était sautée.
verifier("tableau après « Je vérifie »",
  extraireJSON('Je vérifie chaque réponse.\n[{"id":1,"reponse":"finis"}]', "["),
  [{ id: 1, reponse: "finis" }]);
verifier("tableau vide", extraireJSON("[]", "["), []);
verifier("crochets dans une chaîne",
  extraireJSON('[{"reponse":"a ] b ["}]', "["), [{ reponse: "a ] b [" }]);
verifier("crochet parasite avant le vrai tableau",
  extraireJSON('Réponses [corrigées] : [{"id":2,"reponse":"x"}]', "["), [{ id: 2, reponse: "x" }]);
verifier("aucun tableau : erreur", echoue(() => extraireJSON('{"a":1}', "[")), true);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

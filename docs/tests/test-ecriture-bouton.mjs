#!/usr/bin/env npx tsx
/**
 * Contrat du bouton unique de l'écriture du jour.
 *   npx tsx docs/tests/test-ecriture-bouton.mjs
 */
import { actionBouton, correctionsRestantes, MAX_CORRECTIONS } from "../../lib/ecriture-bouton.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) {
    echecs++; console.log(`✗ ${nom}\n    attendu : ${JSON.stringify(attendu)}\n    obtenu  : ${JSON.stringify(obtenu)}`);
  }
}
const T = "Le chat dort sur le canapé.";
const a = (nbCorrections, texteSansErreur, texteActuel = T) => actionBouton({ nbCorrections, texteSansErreur, texteActuel });

verifier("au départ : corriger", a(0, null), "corriger");
// On ne rend pas un texte jamais corrigé.
verifier("une correction avec des erreurs : corriger encore", a(1, null), "corriger");
verifier("la dernière correction n'a rien trouvé : terminer", a(1, T), "terminer");
// Modifier le texte après un sans-faute peut ajouter une faute : on revérifie.
verifier("texte modifié après le sans-faute : corriger", a(1, T, T + " Il ronfle."), "corriger");
verifier("seulement des espaces en plus : toujours terminer", a(1, T, `  ${T}\n`), "terminer");
// Jamais enfermé : après trois corrections, on rend, erreurs ou pas.
verifier("trois corrections avec erreurs : terminer", a(3, null), "terminer");
verifier("trois corrections puis texte modifié : terminer quand même", a(3, T, "autre chose"), "terminer");
verifier("au-delà de trois (compteur ancien) : terminer", a(5, null), "terminer");
verifier("deux corrections avec erreurs : corriger", a(2, null), "corriger");

verifier("le maximum est trois", MAX_CORRECTIONS, 3);
verifier("restantes au départ", correctionsRestantes(0), 3);
verifier("restantes après deux", correctionsRestantes(2), 1);
verifier("jamais négatif", correctionsRestantes(7), 0);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

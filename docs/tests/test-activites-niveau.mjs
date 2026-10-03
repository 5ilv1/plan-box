#!/usr/bin/env npx tsx
/**
 * Contrat des interrupteurs « activités sur tablette, par niveau ».
 *
 * Un réglage absent, abîmé ou d'un niveau inconnu doit valoir ALLUMÉ : une
 * erreur ici priverait une classe de son travail sans que rien ne le dise.
 *
 * Lancer après toute modification de lib/activites-niveau.ts :
 *   npx tsx docs/tests/test-activites-niveau.mjs
 */
import { lireReglageActivites, activiteAllumee, basculer, niveauDesGroupes } from "../../lib/activites-niveau.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

/* ── Lecture : tout ce qui n'est pas « false » vaut allumé ───────────────── */
verifier("réglage absent", lireReglageActivites(null), {});
verifier("réglage d'un autre type", lireReglageActivites("oui"), {});
verifier("activité inconnue ignorée", lireReglageActivites({ motus: { CE2: false } }), {});
verifier("niveau inconnu ignoré", lireReglageActivites({ ecriture: { CE1: false } }), {});
verifier("true n'est pas écrit", lireReglageActivites({ ecriture: { CE2: true, CM1: false } }), { ecriture: { CM1: false } });
verifier("« false » en texte ne vaut pas éteint", lireReglageActivites({ ecriture: { CE2: "false" } }), {});

const r = { probleme_du_jour: { CE2: false } };
verifier("éteint pour CE2", activiteAllumee(r, "probleme_du_jour", "CE2"), false);
verifier("allumé pour CM1", activiteAllumee(r, "probleme_du_jour", "CM1"), true);
verifier("l'écriture n'est pas touchée", activiteAllumee(r, "ecriture", "CE2"), true);
verifier("niveau inconnu : allumé", activiteAllumee(r, "probleme_du_jour", "CE1"), true);
verifier("niveau absent : allumé", activiteAllumee(r, "probleme_du_jour", null), true);

/* ── Basculer ────────────────────────────────────────────────────────────── */
verifier("éteindre", basculer({}, "ecriture", "CM2", false), { ecriture: { CM2: false } });
verifier("éteindre un second niveau", basculer({ ecriture: { CM2: false } }, "ecriture", "CE2", false), { ecriture: { CM2: false, CE2: false } });
verifier("rallumer retire la clé", basculer({ ecriture: { CM2: false, CE2: false } }, "ecriture", "CM2", true), { ecriture: { CE2: false } });
verifier("rallumer le dernier retire l'activité", basculer({ ecriture: { CM2: false } }, "ecriture", "CM2", true), {});
verifier("les autres activités restent", basculer({ probleme_du_jour: { CE2: false } }, "ecriture", "CM1", false), { probleme_du_jour: { CE2: false }, ecriture: { CM1: false } });
{
  const avant = { ecriture: { CM2: false } };
  basculer(avant, "ecriture", "CE2", false);
  verifier("basculer ne modifie pas l'original", avant, { ecriture: { CM2: false } });
}

/* ── Niveau d'un élève d'après ses groupes ───────────────────────────────── */
verifier("groupe CM1", niveauDesGroupes(["CM1"]), "CM1");
verifier("groupe sans niveau puis CE2", niveauDesGroupes(["Lecture A", "CE2"]), "CE2");
verifier("minuscules", niveauDesGroupes(["groupe cm2"]), "CM2");
verifier("aucun niveau", niveauDesGroupes(["Lecture A", null]), null);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

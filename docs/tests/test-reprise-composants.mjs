#!/usr/bin/env npx tsx
/**
 * Contrat des gardes de reprise des activités à validation unique.
 *
 * Une garde trop permissive ne plante pas : elle rend à l'élève un travail qui
 * se rapporte à d'autres questions. Il retrouve des réponses qu'il n'a jamais
 * données, ou une étiquette manquante qui l'empêche de valider sa série. D'où
 * le nombre de cas de refus ci-dessous — ils comptent plus que les cas qui
 * passent.
 *
 * Lancer après toute modification de lib/reprise-composants.ts :
 *   npx tsx docs/tests/test-reprise-composants.mjs
 */
import {
  repriseTexteATrous,
  repriseClassement,
  repriseAnalysePhrase,
  repriseComparaison,
  repriseRangement,
} from "../../lib/reprise-composants.ts";
import { empreinteContenu, empreinte } from "../../lib/reprise.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}
const refuse = (nom, obtenu) => verifier(nom, obtenu, null);

/* ── 1. Texte à trous ───────────────────────────────────────────────────── */

const POS = [3, 7, 11];

verifier("trous : réponses partielles conservées",
  repriseTexteATrous({ reponses: { 3: "est", 7: "" }, tentative: 1 }, POS),
  { reponses: { 3: "est", 7: "" }, tentative: 1 });

verifier("trous : tentative absente → 0",
  repriseTexteATrous({ reponses: { 3: "est" } }, POS).tentative, 0);

// L'énoncé a changé : les positions ne désignent plus les mêmes mots.
refuse("trous : position inconnue",
  repriseTexteATrous({ reponses: { 3: "est", 99: "et" }, tentative: 0 }, POS));
refuse("trous : valeur non textuelle",
  repriseTexteATrous({ reponses: { 3: 42 }, tentative: 0 }, POS));
refuse("trous : rien de saisi",
  repriseTexteATrous({ reponses: { 3: "", 7: "  " }, tentative: 0 }, POS));
refuse("trous : état vide", repriseTexteATrous({}, POS));
refuse("trous : état absent", repriseTexteATrous(null, POS));

/* ── 2. Classement ──────────────────────────────────────────────────────── */

const CATS = ["Apparence", "Caractère"];

verifier("classement : réserve et catégories complètes",
  repriseClassement({ pool: [2, 0], classement: { Apparence: [1], Caractère: [3] } }, 4, CATS),
  { pool: [2, 0], classement: { Apparence: [1], Caractère: [3] } });

verifier("classement : tout placé, rien en réserve",
  repriseClassement({ pool: [], classement: { Apparence: [0, 1], Caractère: [2] } }, 3, CATS).pool, []);

// Une étiquette en double ou manquante rendrait l'exercice invalidable.
refuse("classement : item en double",
  repriseClassement({ pool: [0], classement: { Apparence: [0], Caractère: [] } }, 2, CATS));
refuse("classement : item manquant",
  repriseClassement({ pool: [0], classement: { Apparence: [], Caractère: [] } }, 3, CATS));
refuse("classement : catégorie renommée",
  repriseClassement({ pool: [0], classement: { Apparence: [1], Nature: [] } }, 2, CATS));
refuse("classement : catégorie ajoutée",
  repriseClassement({ pool: [], classement: { Apparence: [0], Caractère: [1] } }, 2, [...CATS, "Métier"]));
refuse("classement : rien de classé",
  repriseClassement({ pool: [0, 1], classement: { Apparence: [], Caractère: [] } }, 2, CATS));

/* ── 3. Analyse de phrase ───────────────────────────────────────────────── */

const analyseEnCours = {
  phraseIdx: 1, etapeIdx: 2,
  reponses: { 0: { Verbe: { debut: 2, fin: 2, correct: true } } },
  score: { bon: 1, total: 1 },
};
verifier("analyse : reprise au milieu",
  repriseAnalysePhrase(analyseEnCours, 5),
  { phraseIdx: 1, etapeIdx: 2,
    reponses: { 0: { Verbe: { debut: 2, fin: 2, correct: true, montre: false } } },
    score: { bon: 1, total: 1 } });

verifier("analyse : le groupe montré après trois essais est conservé",
  repriseAnalysePhrase({ ...analyseEnCours,
    reponses: { 0: { Sujet: { debut: 0, fin: 1, correct: false, montre: true } } } }, 5)
    .reponses[0].Sujet.montre, true);

// Une phrase illisible a été écartée par recalerGroupes : les index glissent.
refuse("analyse : phrase hors bornes (liste assainie plus courte)",
  repriseAnalysePhrase({ ...analyseEnCours, phraseIdx: 4 }, 3));
refuse("analyse : rien de commencé",
  repriseAnalysePhrase({ phraseIdx: 0, etapeIdx: 0, reponses: {}, score: { bon: 0, total: 0 } }, 5));
refuse("analyse : score incohérent",
  repriseAnalysePhrase({ ...analyseEnCours, score: { bon: 3, total: 1 } }, 5));
refuse("analyse : groupe à l'envers",
  repriseAnalysePhrase({ ...analyseEnCours,
    reponses: { 0: { Verbe: { debut: 5, fin: 2, correct: true } } } }, 5));

/* ── 4. Comparaison ─────────────────────────────────────────────────────── */

verifier("comparaison : saisie partielle",
  repriseComparaison({ reponses: ["<", null, ">"], justes: [0], premiereTentative: null }, 3),
  { reponses: ["<", null, ">"], justes: [0], premiereTentative: null });

// LE cas qui compte : sans le premier essai, l'élève coupé après une erreur
// revient corriger et ressort avec un sans-faute.
verifier("comparaison : le premier essai survit",
  repriseComparaison(
    { reponses: ["<", ">"], justes: [0], premiereTentative: [true, false] }, 2).premiereTentative,
  [true, false]);

refuse("comparaison : nombre de paires changé",
  repriseComparaison({ reponses: ["<", ">"], justes: [], premiereTentative: null }, 3));
refuse("comparaison : premier essai de mauvaise taille",
  repriseComparaison({ reponses: ["<", ">"], justes: [], premiereTentative: [true] }, 2));
refuse("comparaison : rien de répondu",
  repriseComparaison({ reponses: [null, null], justes: [], premiereTentative: null }, 2));

/* ── 5. Rangement ───────────────────────────────────────────────────────── */

const rangementEnCours = {
  etats: [
    { reserve: [2], places: [0, 1], statut: "saisie" },
    { reserve: [1, 0, 2], places: [], statut: "saisie" },
  ],
  premiereTentative: [null, null],
};
verifier("rangement : une série entamée, l'autre intacte",
  repriseRangement(rangementEnCours, [3, 3]), rangementEnCours);

verifier("rangement : le premier essai raté survit",
  repriseRangement({ ...rangementEnCours, premiereTentative: [false, null] }, [3, 3]).premiereTentative,
  [false, null]);

refuse("rangement : étiquette perdue (série invalidable)",
  repriseRangement({ etats: [{ reserve: [], places: [0, 1], statut: "saisie" }],
    premiereTentative: [null] }, [3]));
refuse("rangement : étiquette en double",
  repriseRangement({ etats: [{ reserve: [0], places: [0, 1], statut: "saisie" }],
    premiereTentative: [null] }, [3]));
refuse("rangement : nombre de séries changé",
  repriseRangement(rangementEnCours, [3, 3, 3]));
refuse("rangement : statut inconnu",
  repriseRangement({ etats: [{ reserve: [1], places: [0], statut: "gagné" }],
    premiereTentative: [null] }, [2]));
refuse("rangement : rien de posé",
  repriseRangement({ etats: [{ reserve: [0, 1], places: [], statut: "saisie" }],
    premiereTentative: [null] }, [2]));

/* ── 6. Empreintes : ce qui invalide un travail, et ce qui ne l'invalide pas ── */

const trous = { texte_complet: "Le chat ___ noir.", trous: [{ position: 2, mot: "est" }] };
const e1 = empreinteContenu("texte_a_trous", "b1", trous);
verifier("empreinte : stable d'un appel à l'autre", empreinteContenu("texte_a_trous", "b1", trous), e1);
verifier("empreinte : un titre retouché ne jette pas le travail",
  empreinteContenu("texte_a_trous", "b1", { ...trous, titre: "Nouveau titre" }), e1);
verifier("empreinte : un mot changé jette le travail",
  empreinteContenu("texte_a_trous", "b1", { ...trous, trous: [{ position: 2, mot: "était" }] }) !== e1, true);
verifier("empreinte : un autre bloc, une autre empreinte",
  empreinteContenu("texte_a_trous", "b2", trous) !== e1, true);

verifier("empreinte : comparaison sensible au signe attendu",
  empreinteContenu("comparaison", "b", { paires: [{ gauche: "3", droite: "4", signe: "<" }] }) !==
  empreinteContenu("comparaison", "b", { paires: [{ gauche: "3", droite: "4", signe: ">" }] }), true);
verifier("empreinte : analyse sensible aux groupes",
  empreinteContenu("analyse_phrase", "b", { phrases: [{ texte: "Le chat dort.", groupes: [{ debut: 0, fin: 1 }] }] }) !==
  empreinteContenu("analyse_phrase", "b", { phrases: [{ texte: "Le chat dort.", groupes: [{ debut: 0, fin: 2 }] }] }), true);
verifier("empreinte : rangement sensible aux éléments",
  empreinteContenu("rangement", "b", { critere: "croissant", series: [{ elements: ["1", "2"] }] }) !==
  empreinteContenu("rangement", "b", { critere: "croissant", series: [{ elements: ["2", "1"] }] }), true);
verifier("empreinte : classement sensible aux catégories",
  empreinteContenu("classement", "b", { categories: ["A"], items: [{ texte: "x", categorie: "A" }] }) !==
  empreinteContenu("classement", "b", { categories: ["B"], items: [{ texte: "x", categorie: "A" }] }), true);

verifier("empreinte : contenu absent → pas de reprise", empreinteContenu("texte_a_trous", "b", null), null);
verifier("empreinte : contenu incomplet → pas de reprise",
  empreinteContenu("texte_a_trous", "b", { texte_complet: "x" }), null);
verifier("empreinte : type non couvert → pas de reprise",
  empreinteContenu("dictee", "b", { phrases: [] }), null);
verifier("empreinte : la fonction de base reste stable", empreinte("a", ["b"]), empreinte("a", ["b"]));

/* ── 7. L'aller-retour par JSON ─────────────────────────────────────────── */
//
// L'état ne passe pas de la mémoire à la mémoire : il traverse `JSON.stringify`,
// la base, puis `JSON.parse`. C'est là que ça casse en silence — un `Set`
// devient `{}`, une clé numérique devient du texte — et la reprise se contente
// alors de ne jamais revenir, sans une ligne dans la console.

const allerRetour = (v) => JSON.parse(JSON.stringify(v));

// Ce que chaque composant écrit réellement dans son `onProgres`.
const ecrits = {
  trous: { reponses: Object.fromEntries([[3, "est"], [7, "et"]].map(([k, v]) => [String(k), v])), tentative: 1 },
  classement: { pool: [2], classement: Object.fromEntries([["Apparence", [0]], ["Caractère", [1]]]) },
  analyse: { phraseIdx: 1, etapeIdx: 0, reponses: { 0: { Verbe: { debut: 1, fin: 1, correct: true } } }, score: { bon: 1, total: 1 } },
  // `justes` est un Set dans le composant : il est étalé en tableau AVANT
  // l'enregistrement. Sans cela, JSON en ferait « {} » et toutes les lignes
  // déjà justes redeviendraient modifiables.
  comparaison: { reponses: ["<", ">"], justes: [...new Set([0])], premiereTentative: [true, false] },
  rangement: { etats: [{ reserve: [2], places: [0, 1], statut: "saisie" }], premiereTentative: [null] },
};

verifier("aller-retour : trous",
  repriseTexteATrous(allerRetour(ecrits.trous), POS), { reponses: { 3: "est", 7: "et" }, tentative: 1 });
verifier("aller-retour : classement",
  repriseClassement(allerRetour(ecrits.classement), 3, CATS), ecrits.classement);
verifier("aller-retour : analyse",
  repriseAnalysePhrase(allerRetour(ecrits.analyse), 3).phraseIdx, 1);
verifier("aller-retour : comparaison, les lignes justes survivent",
  repriseComparaison(allerRetour(ecrits.comparaison), 2).justes, [0]);
verifier("aller-retour : comparaison, le premier essai survit",
  repriseComparaison(allerRetour(ecrits.comparaison), 2).premiereTentative, [true, false]);
verifier("aller-retour : rangement",
  repriseRangement(allerRetour(ecrits.rangement), [3]), ecrits.rangement);

// Le piège dans l'autre sens : un Set enregistré tel quel devient « {} », et
// les lignes déjà justes redeviendraient modifiables sans que rien ne le dise.
verifier("aller-retour : un Set non étalé perd tout",
  repriseComparaison(allerRetour({ reponses: ["<", ">"], justes: new Set([0]), premiereTentative: null }), 2).justes,
  []);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

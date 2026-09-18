#!/usr/bin/env npx tsx
/**
 * Contrat du relevé d'un travail resté en cours.
 *
 * Ces deux nombres deviennent une **note**. Un relevé faux ne se voit pas : il
 * s'enregistre, part dans le graphe de réussite, et personne ne saura qu'il a
 * été inventé. D'où la règle tenue ici : ce qu'on ne sait pas établir vaut
 * `null`, et l'enseignant saisit lui-même.
 *
 * Lancer après toute modification de lib/progres-partiel.ts :
 *   npx tsx docs/tests/test-progres-partiel.mjs
 */
import { progresDepuisBloc, progresDepuisReprise } from "../../lib/progres-partiel.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}
const refuse = (nom, obtenu) => verifier(nom, obtenu, null);
const dep = (type, etat, contenu) => progresDepuisReprise(type, etat, contenu);

/* ── 1. Ce que le bloc sait déjà ─────────────────────────────────────────── */

// Un bloc « en cours » AVEC un score : l'élève a fini, mais sous le seuil.
verifier("bloc : le premier essai fait foi",
  progresDepuisBloc({ premier_score: 6, premier_score_total: 10, score_eleve: 10, score_total: 10 }),
  { bon: 6, total: 10, source: "bloc" });
verifier("bloc : à défaut, le score final",
  progresDepuisBloc({ score_eleve: 7, score_total: 8 }),
  { bon: 7, total: 8, source: "bloc" });
refuse("bloc : aucun score", progresDepuisBloc({ matiere: "Français" }));
refuse("bloc : total nul", progresDepuisBloc({ score_eleve: 0, score_total: 0 }));
refuse("bloc : score supérieur au total", progresDepuisBloc({ score_eleve: 12, score_total: 10 }));
refuse("bloc : contenu absent", progresDepuisBloc(null));

/* ── 2. Le cas de l'énoncé : 9 faites sur 10, la dixième est infaisable ──── */

verifier("exercice : 9 réponses données, 9 justes → 9/9",
  dep("exercice", { ordre: [0,1,2,3,4,5,6,7,8,9], score: 9,
    reponses: Array.from({ length: 9 }, (_, i) => ({ id: i, reponse: "x", correcte: true })) }, {}),
  { bon: 9, total: 9, source: "reprise" });
verifier("exercice : 9 données dont 2 fausses → 7/9",
  dep("exercice", { score: 7, reponses: new Array(9).fill({ id: 1, reponse: "x", correcte: true }) }, {}),
  { bon: 7, total: 9, source: "reprise" });
refuse("exercice : score manquant", dep("exercice", { reponses: [{}] }, {}));
refuse("exercice : rien de répondu", dep("exercice", { score: 0, reponses: [] }, {}));

verifier("analyse de phrase : le score courant suffit",
  dep("analyse_phrase", { phraseIdx: 2, score: { bon: 11, total: 14 } }, {}),
  { bon: 11, total: 14, source: "reprise" });
refuse("analyse de phrase : rien de commencé",
  dep("analyse_phrase", { score: { bon: 0, total: 0 } }, {}));

/* ── 3. Le relevé du premier essai, quand il existe ──────────────────────── */

verifier("texte à trous : relevé du premier essai",
  dep("texte_a_trous", { premierResultat: { 3: true, 7: true, 11: false } }, {}),
  { bon: 2, total: 3, source: "reprise" });

// LE refus qui compte : sans relevé, on sait ce que l'élève a tapé mais pas si
// c'est juste. La comparaison tient compte des élisions et vit dans le
// composant ; la refaire ici risquerait de contredire son écran.
refuse("texte à trous : saisi mais jamais vérifié",
  dep("texte_a_trous", { reponses: { 3: "est", 7: "et" }, tentative: 0 },
    { trous: [{ position: 3, mot: "est" }] }));

/* ── 4. Ce qui se recalcule sans ambiguïté ───────────────────────────────── */

const CONTENU_CLASSEMENT = {
  categories: ["Déterminant", "Nom"],
  items: [{ texte: "le", categorie: "Déterminant" }, { texte: "chat", categorie: "Nom" },
          { texte: "une", categorie: "Déterminant" }],
};
verifier("classement : une seule posée, et juste → 1/1",
  dep("classement", { pool: [2], classement: { "Déterminant": [0], "Nom": [] } }, CONTENU_CLASSEMENT),
  { bon: 1, total: 1, source: "reprise" });
verifier("classement : deux justes",
  dep("classement", { pool: [], classement: { "Déterminant": [0, 2], "Nom": [1] } }, CONTENU_CLASSEMENT),
  { bon: 3, total: 3, source: "reprise" });
verifier("classement : une erreur comptée",
  dep("classement", { pool: [2], classement: { "Déterminant": [1], "Nom": [0] } }, CONTENU_CLASSEMENT),
  { bon: 0, total: 2, source: "reprise" });
verifier("classement : le relevé du premier essai prime sur le recalcul",
  dep("classement", { pool: [], classement: { "Déterminant": [0, 2], "Nom": [1] },
    premierResultat: { 0: true, 1: false, 2: true } }, CONTENU_CLASSEMENT),
  { bon: 2, total: 3, source: "reprise" });
refuse("classement : rien de posé",
  dep("classement", { pool: [0,1,2], classement: { "Déterminant": [], "Nom": [] } }, CONTENU_CLASSEMENT));

const CONTENU_COMPARAISON = { paires: [
  { gauche: "3", droite: "4", signe: "<" },
  { gauche: "9", droite: "2", signe: ">" },
  { gauche: "5", droite: "8", signe: "<" },
] };
verifier("comparaison : 2 posées, 1 fausse → 1/2",
  dep("comparaison", { reponses: ["<", "<", null] }, CONTENU_COMPARAISON),
  { bon: 1, total: 2, source: "reprise" });
verifier("comparaison : le premier essai prime",
  dep("comparaison", { reponses: ["<", ">", "<"], premiereTentative: [true, false, true] }, CONTENU_COMPARAISON),
  { bon: 2, total: 3, source: "reprise" });
refuse("comparaison : rien de posé",
  dep("comparaison", { reponses: [null, null, null] }, CONTENU_COMPARAISON));

const CONTENU_RANGEMENT = { series: [{ elements: ["1", "2", "3"] }, { elements: ["4", "5", "6"] }] };
verifier("rangement : une série juste, une à moitié posée → 1/1",
  dep("rangement", { etats: [
    { reserve: [], places: [0, 1, 2], statut: "saisie" },
    { reserve: [2], places: [0, 1], statut: "saisie" },
  ] }, CONTENU_RANGEMENT),
  { bon: 1, total: 1, source: "reprise" });
verifier("rangement : série complète mais dans le désordre → 0/1",
  dep("rangement", { etats: [
    { reserve: [], places: [2, 0, 1], statut: "saisie" },
    { reserve: [0, 1, 2], places: [], statut: "saisie" },
  ] }, CONTENU_RANGEMENT),
  { bon: 0, total: 1, source: "reprise" });
verifier("rangement : le premier essai prime",
  dep("rangement", { etats: [{ reserve: [], places: [0,1,2], statut: "juste" }],
    premiereTentative: [false, null] }, CONTENU_RANGEMENT),
  { bon: 0, total: 1, source: "reprise" });
refuse("rangement : rien de posé",
  dep("rangement", { etats: [
    { reserve: [0,1,2], places: [], statut: "saisie" },
    { reserve: [0,1,2], places: [], statut: "saisie" },
  ] }, CONTENU_RANGEMENT));

/* ── 5. Refus ────────────────────────────────────────────────────────────── */

refuse("type non couvert", dep("dictee", { score: 5 }, {}));
refuse("état absent", dep("exercice", null, {}));
refuse("contenu manquant pour un recalcul",
  dep("comparaison", { reponses: ["<"] }, {}));
refuse("relevé non booléen",
  dep("texte_a_trous", { premierResultat: { 3: "oui" } }, {}));

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

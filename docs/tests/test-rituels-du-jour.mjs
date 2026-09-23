#!/usr/bin/env npx tsx
/**
 * Contrat des rituels du jour dans le taux de complétion.
 *
 * Le problème du jour et le calcul du jour comptent des DEUX côtés — barre de
 * l'élève et panneau de l'enseignant — ou d'aucun. Ce qui se vérifie ici :
 *  • un rituel ne compte qu'un jour où l'élève a du travail assigné, sans quoi
 *    un samedi où un seul élève ouvre son tableau de bord deviendrait un jour
 *    de classe à 0 % pour toute la classe ;
 *  • il ne compte que pour le niveau où il a été posé ;
 *  • « terminé » vaut « fait », même sans avoir trouvé — trois essais épuisés,
 *    la correction lue, il n'y a plus rien à faire.
 *
 * Lancer après toute modification de lib/rituels-du-jour.ts :
 *   npx tsx docs/tests/test-rituels-du-jour.mjs
 */
import { construireRituels, joursTravailles, TYPE_PROBLEME_DU_JOUR, TYPE_CALCUL_DU_JOUR }
  from "../../lib/rituels-du-jour.ts";
import { completion } from "../../lib/suivi-metriques.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

const LUNDI = "2026-09-21", SAMEDI = "2026-09-26";
const bloc = (uid, date, statut = "fait") => ({
  eleve_id: uid.startsWith("pb_") ? uid.slice(3) : null,
  repetibox_eleve_id: uid.startsWith("rb_") ? Number(uid.slice(3)) : null,
  date_assignation: date,
  statut,
});

const eleves = [
  { uid: "rb_1", niveau: "CM1" },
  { uid: "rb_2", niveau: "CM1" },
  { uid: "pb_aaa", niveau: "CE2" },
];

/* ── 1. Le jour travaillé ────────────────────────────────────────────────── */

verifier("un jour sans travail assigné ne porte pas de rituel",
  construireRituels({
    eleves, blocs: [],
    problemesPoses: [{ date: LUNDI, niveau: "CM1" }], problemesFaits: [],
    calculsPoses: [{ date: LUNDI, niveau: "CM1" }], calculsFaits: [],
  }).length, 0);

verifier("le samedi ouvert par un élève ne devient pas un jour de classe",
  construireRituels({
    eleves, blocs: [bloc("rb_1", LUNDI)],
    problemesPoses: [], problemesFaits: [],
    calculsPoses: [{ date: SAMEDI, niveau: "CM1" }], calculsFaits: [{ uid: "rb_1", date: SAMEDI }],
  }).length, 0);

verifier("le rituel suit l'élève qui a du travail, pas les autres",
  construireRituels({
    eleves, blocs: [bloc("rb_1", LUNDI)],
    problemesPoses: [{ date: LUNDI, niveau: "CM1" }], problemesFaits: [],
    calculsPoses: [], calculsFaits: [],
  }).map((r) => r.repetibox_eleve_id), [1]);

/* ── 2. Le niveau ────────────────────────────────────────────────────────── */

const deuxNiveaux = construireRituels({
  eleves,
  blocs: [bloc("rb_1", LUNDI), bloc("pb_aaa", LUNDI)],
  problemesPoses: [{ date: LUNDI, niveau: "CE2" }], problemesFaits: [],
  calculsPoses: [{ date: LUNDI, niveau: "CM1" }], calculsFaits: [],
});
verifier("un problème posé en CE2 ne compte pas pour un CM1",
  deuxNiveaux.filter((r) => r.type === TYPE_PROBLEME_DU_JOUR).map((r) => r.eleve_id), ["aaa"]);
verifier("un calcul posé en CM1 ne compte pas pour un CE2",
  deuxNiveaux.filter((r) => r.type === TYPE_CALCUL_DU_JOUR).map((r) => r.repetibox_eleve_id), [1]);

/* ── 3. Fait ou non ──────────────────────────────────────────────────────── */

const jour = construireRituels({
  eleves,
  blocs: [bloc("rb_1", LUNDI), bloc("rb_2", LUNDI)],
  problemesPoses: [{ date: LUNDI, niveau: "CM1" }],
  problemesFaits: [{ uid: "rb_1", date: LUNDI }],
  calculsPoses: [{ date: LUNDI, niveau: "CM1" }],
  calculsFaits: [],
});
verifier("deux élèves × deux rituels", jour.length, 4);
verifier("un seul rituel fait", jour.filter((r) => r.statut === "fait").length, 1);
verifier("les autres sont à faire",
  jour.filter((r) => r.statut === "a_faire").length, 3);

// Le chiffre que lit l'élève et celui que lit l'enseignant sortent du même calcul.
const sesBlocs = [bloc("rb_1", LUNDI, "fait"), bloc("rb_1", LUNDI, "a_faire")];
const sesRituels = jour.filter((r) => r.repetibox_eleve_id === 1);
verifier("2 travaux dont 1 fait + 2 rituels dont 1 fait = 50 %",
  completion([...sesBlocs, ...sesRituels]).pct, 50);

/* ── 4. Les rituels ne sont que des blocs de complétion ──────────────────── */

verifier("aucun contenu : rien à agréger en réussite",
  jour.every((r) => r.contenu === null && r.duree_secondes === null), true);
verifier("aucune date limite : un rituel n'est jamais « en retard »",
  jour.every((r) => r.date_limite === null), true);
verifier("un identifiant stable, pour ne pas doubler d'un chargement à l'autre",
  new Set(jour.map((r) => r.id)).size, jour.length);

/* ── 5. joursTravailles ──────────────────────────────────────────────────── */

verifier("les deux sources d'élèves sont reconnues",
  [...joursTravailles([bloc("rb_7", LUNDI), bloc("pb_xyz", SAMEDI)])].sort(),
  ["pb_xyz|2026-09-26", "rb_7|2026-09-21"]);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

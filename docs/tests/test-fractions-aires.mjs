#!/usr/bin/env npx tsx
/**
 * Contrat du QCM « lire une fraction sur un dessin ».
 *
 * Ce que ces cas protègent, et qui ne se voit pas à l'œil sur dix questions :
 *  • aucune option ne vaut la bonne réponse — sinon un élève qui a raison est
 *    compté faux (2/4 dessiné, 1/2 proposé) ;
 *  • le dessin dit bien la fraction attendue : autant de parts coloriées que
 *    le numérateur, autant de parts que le dénominateur ;
 *  • le quadrillage d'un rectangle divise le nombre de parts, sans quoi la
 *    dernière ligne serait incomplète et le dessin mentirait.
 *
 * Lancer après toute modification de lib/fractions-aires.ts :
 *   npx tsx docs/tests/test-fractions-aires.mjs
 */
import {
  distracteurs,
  colonnesPour,
  partsColoriees,
  genererQuestionsFractions,
  DENOMINATEURS_PAR_NIVEAU,
} from "../../lib/fractions-aires.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

const valeur = (f) => { const [a, b] = f.split("/").map(Number); return a / b; };

/* ── 1. Les distracteurs sont des erreurs d'élève, pas du hasard ─────────── */

verifier("3/8 : inversée, blanches, coloriées sur blanches",
  distracteurs(3, 8).slice(0, 3), ["8/3", "5/8", "3/5"]);

verifier("2/4 : la forme simplifiée n'est jamais proposée",
  distracteurs(2, 4).some((f) => valeur(f) === 0.5), false);

verifier("2/4 : les blanches valent la bonne réponse, donc écartées",
  distracteurs(2, 4).includes("2/4"), false);

verifier("1/2 : trois mauvaises réponses malgré le cas dégénéré",
  distracteurs(1, 2).length >= 3, true);

// Le cas général : sur toutes les fractions propres jusqu'aux douzièmes,
// jamais une option qui vaut la bonne réponse, jamais un doublon.
let fautives = 0, doublons = 0;
for (let d = 2; d <= 12; d++) {
  for (let n = 1; n < d; n++) {
    const trois = distracteurs(n, d).slice(0, 3);
    if (trois.length < 3) fautives++;
    if (trois.some((f) => valeur(f) === n / d)) fautives++;
    if (new Set(trois).size !== 3) doublons++;
  }
}
verifier("aucune option ne vaut la bonne réponse (66 fractions)", fautives, 0);
verifier("aucun doublon parmi les distracteurs", doublons, 0);

/* ── 2. Quadrillage du rectangle ─────────────────────────────────────────── */

verifier("4 parts : une ligne", colonnesPour(4), 4);
verifier("6 parts : une ligne", colonnesPour(6), 6);
verifier("8 parts : 4 colonnes", colonnesPour(8), 4);
verifier("9 parts : 3 colonnes", colonnesPour(9), 3);
verifier("12 parts : 4 colonnes", colonnesPour(12), 4);
verifier("7 parts : pas de quadrillage possible, on reste en ligne", colonnesPour(7), 7);
verifier("11 parts : idem", colonnesPour(11), 11);

let mauvaisDecoupage = 0;
for (let d = 2; d <= 12; d++) if (d % colonnesPour(d) !== 0) mauvaisDecoupage++;
verifier("le nombre de colonnes divise toujours le nombre de parts", mauvaisDecoupage, 0);

/* ── 3. Les parts coloriées ──────────────────────────────────────────────── */

verifier("un nombre vaut « les n premières »",
  partsColoriees({ type: "fraction_aire", forme: "cercle", parts: 8, coloriees: 3 }), [0, 1, 2]);
verifier("un tableau est trié et dédoublonné",
  partsColoriees({ type: "fraction_aire", forme: "cercle", parts: 6, coloriees: [4, 0, 4, 2] }), [0, 2, 4]);
verifier("un indice hors du dessin est ignoré",
  partsColoriees({ type: "fraction_aire", forme: "cercle", parts: 4, coloriees: [0, 9, -1] }), [0]);

/* ── 4. Le QCM engendré ──────────────────────────────────────────────────── */

// Tirage reproductible : un générateur congruentiel, pas Math.random.
function aleaFixe(graine = 42) {
  let x = graine;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

const qcm = genererQuestionsFractions({
  nb: 20,
  formes: ["cercle", "rectangle"],
  denominateurs: DENOMINATEURS_PAR_NIVEAU.CM2,
  alea: aleaFixe(),
});

verifier("20 questions demandées, 20 rendues", qcm.length, 20);
verifier("quatre options partout", qcm.every((q) => q.options.length === 4), true);
verifier("la bonne réponse est dans les options",
  qcm.every((q) => q.options[q.reponse_correcte] !== undefined), true);
verifier("options uniques", qcm.every((q) => new Set(q.options).size === 4), true);

verifier("le dessin dit la fraction attendue",
  qcm.every((q) => {
    const [n, d] = q.options[q.reponse_correcte].split("/").map(Number);
    return q.figure.parts === d && partsColoriees(q.figure).length === n;
  }), true);

verifier("il reste toujours au moins une part blanche",
  qcm.every((q) => partsColoriees(q.figure).length < q.figure.parts), true);

verifier("aucune option ne vaut la bonne réponse",
  qcm.every((q) => {
    const bonne = valeur(q.options[q.reponse_correcte]);
    return q.options.filter((f) => valeur(f) === bonne).length === 1;
  }), true);

verifier("la position de la bonne réponse varie",
  new Set(qcm.map((q) => q.reponse_correcte)).size > 1, true);

verifier("le rectangle emporte son quadrillage",
  qcm.filter((q) => q.figure.forme === "rectangle")
     .every((q) => q.figure.parts % q.figure.colonnes === 0), true);

// Les parts contiguës partent du haut ; dispersées, elles ne se suivent plus.
const contigu = genererQuestionsFractions({ nb: 12, denominateurs: [8, 10, 12], alea: aleaFixe(7) });
verifier("par défaut, les parts coloriées se suivent depuis la première",
  contigu.every((q) => {
    const p = partsColoriees(q.figure);
    return p.every((v, i) => v === i);
  }), true);

const disperse = genererQuestionsFractions({
  nb: 12, denominateurs: [8, 10, 12], dispersees: true, alea: aleaFixe(7),
});
verifier("dispersées : au moins une série ne se suit pas",
  disperse.some((q) => partsColoriees(q.figure).some((v, i) => v !== i)), true);

// Une seule forme demandée, une seule forme servie.
verifier("formes respectées",
  genererQuestionsFractions({ nb: 6, formes: ["cercle"], alea: aleaFixe(3) })
    .every((q) => q.figure.forme === "cercle"), true);

// Les dénominateurs restent dans le programme du niveau.
verifier("dénominateurs du CE2 respectés",
  genererQuestionsFractions({ nb: 15, denominateurs: DENOMINATEURS_PAR_NIVEAU.CE2, alea: aleaFixe(9) })
    .every((q) => DENOMINATEURS_PAR_NIVEAU.CE2.includes(q.figure.parts)), true);

// Plus de questions que de fractions possibles : on repose, on ne casse pas.
verifier("plus de questions que de fractions disponibles",
  genererQuestionsFractions({ nb: 20, formes: ["cercle"], denominateurs: [2, 3], alea: aleaFixe(5) }).length, 20);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

#!/usr/bin/env npx tsx
/**
 * Contrat de la variété des thèmes d'écriture.
 *   npx tsx docs/tests/test-theme-ecriture-variete.mjs
 */
import {
  choisirAxes, moinsRecent, familleDeContrainte, FAMILLES_CONTRAINTE,
  UNIVERS_JOUR, UNIVERS_SEMAINE, INDICES_UNIVERS,
} from "../../lib/theme-ecriture-variete.ts";
import { TYPES_JOUR, TYPES_SEMAINE } from "../../lib/ecriture-types.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) {
    echecs++; console.log(`✗ ${nom}\n    attendu : ${JSON.stringify(attendu)}\n    obtenu  : ${JSON.stringify(obtenu)}`);
  }
}
/** Un hasard rejouable, pour que le contrat ne dépende pas du tirage. */
function graine(n) {
  let x = n;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

// ── Les contraintes déjà en base sont reconnues ─────────────────────────────
// Prises telles quelles dans themes_ecriture (septembre-octobre 2026).
const reelles = [
  ["Utilise au moins trois adjectifs différents pour décrire ce vêtement.", "adjectifs"],
  ["Commence chaque raison par les mots « D'abord », « Ensuite » et « Enfin ».", "connecteurs"],
  ["Utilise au moins deux comparaisons (par exemple : « rapide comme… » ou « doux comme… »).", "comparaison"],
  ["Présente le dialogue correctement avec un tiret pour chaque prise de parole, et utilise au moins un mot qui exprime une émotion (surprise, joie, impatience…).", "dialogue"],
  ["Utilise au moins deux questions dans ton dialogue.", "dialogue"],
  ["Utilise au moins deux points d'exclamation et un mot en majuscules pour attirer l'attention des lecteurs.", "question-exclamation"],
  ["Utilise au moins deux verbes d'action à l'infinitif dans les étapes de préparation (par exemple : mélanger, secouer, saupoudrer…).", "verbes"],
  ["Utilise au moins deux verbes à l'impératif pour les étapes de la recette (ex : mélange, verse, ajoute…).", "verbes"],
  ["Ton récit doit contenir un retournement de situation inattendu.", "rebondissement"],
];
for (const [texte, cle] of reelles) verifier(`reconnue : ${texte.slice(0, 40)}…`, familleDeContrainte(texte), cle);
verifier("contrainte vide : inconnue", familleDeContrainte(""), null);

// Chaque famille reconnaît sa propre consigne — sinon une contrainte écrite
// d'après elle passerait pour une autre, et la rotation se tromperait.
for (const f of FAMILLES_CONTRAINTE) verifier(`la famille ${f.cle} se reconnaît`, familleDeContrainte(f.consigne), f.cle);

// ── Chaque univers a son indice ─────────────────────────────────────────────
// Un univers sans indice passerait pour « jamais servi » et sortirait tous les jours.
for (const u of [...UNIVERS_JOUR, ...UNIVERS_SEMAINE]) {
  verifier(`indice pour « ${u} »`, Boolean(INDICES_UNIVERS[u]) && INDICES_UNIVERS[u].test(u), true);
}

// ── moinsRecent ─────────────────────────────────────────────────────────────
const rang = { a: 0, b: 1, c: 2, d: Infinity, e: Infinity };
const tires = new Set();
for (let i = 0; i < 200; i++) tires.add(moinsRecent(["a", "b", "c", "d", "e"], (x) => rang[x], graine(i)));
verifier("tirés parmi les 3 moins récents (jamais servis d'abord)", [...tires].sort(), ["c", "d", "e"]);
verifier("ampleur 1 : le jamais servi, jamais le plus récent",
  ["d", "e"].includes(moinsRecent(["a", "b", "c", "d", "e"], (x) => rang[x], graine(3), 1)), true);
verifier("un seul candidat", moinsRecent(["a"], () => 0, graine(1)), "a");

// ── Sur la durée : rien ne revient trop tôt ─────────────────────────────────
// On simule 60 jours, chaque thème rejoignant l'historique comme en base.
function simuler(mode, types, jours, n) {
  const historique = [];
  const suite = [];
  const alea = graine(n);
  for (let j = 0; j < jours; j++) {
    const ax = choisirAxes(mode, types, historique, alea);
    suite.push(ax);
    historique.unshift({ sujet: ax.univers, contrainte: ax.famille.consigne, type_ecriture: ax.type, mode });
    if (historique.length > 50) historique.pop();
  }
  return suite;
}
function ecartMin(valeurs) {
  let min = Infinity;
  const vu = new Map();
  valeurs.forEach((v, i) => { if (vu.has(v)) min = Math.min(min, i - vu.get(v)); vu.set(v, i); });
  return min;
}
for (const graineSim of [1, 2, 3]) {
  const jour = simuler("jour", TYPES_JOUR, 60, graineSim);
  verifier(`jour (${graineSim}) : un type ne revient pas avant ${TYPES_JOUR.length - 2} jours`,
    ecartMin(jour.map((a) => a.type)) >= TYPES_JOUR.length - 2, true);
  verifier(`jour (${graineSim}) : un univers ne revient pas avant ${UNIVERS_JOUR.length - 2} jours`,
    ecartMin(jour.map((a) => a.univers)) >= UNIVERS_JOUR.length - 2, true);
  const nbFamillesJour = FAMILLES_CONTRAINTE.filter((f) => f.modes.includes("jour")).length;
  verifier(`jour (${graineSim}) : une contrainte ne revient pas avant ${nbFamillesJour - 2} jours`,
    ecartMin(jour.map((a) => a.famille.cle)) >= nbFamillesJour - 2, true);
  // L'ancien défaut : une suite fixe qui se répète. Deux cycles ne doivent pas se ressembler.
  const t = jour.map((a) => a.type);
  verifier(`jour (${graineSim}) : pas d'ordre fixe d'un cycle à l'autre`,
    t.slice(0, TYPES_JOUR.length).join() !== t.slice(TYPES_JOUR.length, 2 * TYPES_JOUR.length).join(), true);
}
const semaine = simuler("semaine", TYPES_SEMAINE, 30, 7);
verifier("semaine : seulement des familles du mode semaine",
  semaine.every((a) => a.famille.modes.includes("semaine")), true);
verifier("semaine : univers de l'atelier", semaine.every((a) => UNIVERS_SEMAINE.includes(a.univers)), true);

// ── Depuis l'historique réel ────────────────────────────────────────────────
// Les dix derniers thèmes du jour au 27/10 : l'école partout, les adjectifs
// sept fois sur dix. Le prochain choix doit s'en écarter.
const reel = [
  ["mini-dialogue", "La maîtresse entre dans la classe avec un grand sourire…", "Présente le dialogue correctement avec un tiret pour chaque prise de parole."],
  ["portrait en quelques lignes", "Pense à un personnage que tu croises souvent dans ton quartier ou près de l'école…", "Utilise au moins deux adjectifs pour décrire ce personnage."],
  ["description courte", "Regarde ton pull, ta veste ou ton manteau posé sur ta chaise…", "Utilise au moins trois adjectifs différents pour décrire ce vêtement."],
  ["message ou annonce", "La maîtresse demande à toute la classe d'afficher un message dans l'école…", "Utilise au moins deux points d'exclamation et un mot en majuscules."],
  ["recette imaginaire", "Écris la recette imaginaire d'une potion magique…", "Utilise au moins deux adjectifs amusants pour décrire tes ingrédients."],
  ["devinette ou énigme à écrire", "Pense à quelque chose que tu vois chaque jour dans ta classe…", "Utilise au moins deux adjectifs différents pour décrire ton sujet."],
  ["liste argumentée (3 raisons)", "Donne trois bonnes raisons de préférer les livres aux écrans…", "Pour chaque raison, commence ta phrase par un mot différent (« D'abord », « Ensuite », « Enfin »)."],
  ["point de vue d'un objet", "Tu es le cartable posé dans le couloir de l'école…", "Utilise au moins deux verbes qui expriment ce que tu entends ou ce que tu vois."],
  ["observation du quotidien", "Regarde tes mains en ce moment…", "Utilise au moins deux adjectifs différents pour décrire ce que tu vois."],
  ["carte postale ou petit mot", "Les vacances arrivent bientôt et ton meilleur ami part…", "Utilise au moins deux adjectifs pour décrire ce que tu vas vivre."],
].map(([type_ecriture, sujet, contrainte]) => ({ type_ecriture, sujet, contrainte, mode: "jour" }));
const anciensTypes = reel.map((t) => t.type_ecriture);
for (let i = 0; i < 20; i++) {
  const ax = choisirAxes("jour", TYPES_JOUR, reel, graine(100 + i));
  if (anciensTypes.includes(ax.type)) verifier(`réel (${i}) : un type pas servi ces dix jours`, ax.type, "un type nouveau");
  if (ax.famille.cle === "adjectifs") verifier(`réel (${i}) : pas encore les adjectifs`, ax.famille.cle, "autre chose");
  if (ax.univers === "l'école et la classe") verifier(`réel (${i}) : pas encore l'école`, ax.univers, "un autre univers");
}
// ── Les axes notés font foi (essai du 28/10 : « lieu-temps » 4 fois sur 5) ──
verifier("« à quel moment et à quel endroit » est reconnu",
  familleDeContrainte("Dans ton texte, précise à quel moment de la journée et à quel endroit chaque étape se fait."), "lieu-temps");
{
  // Un thème noté « lieu-temps » sans aucun mot reconnaissable : la famille ne revient pas.
  const noteSansMot = [{ sujet: "Un billet plié en quatre.", contrainte: "Raconte ça bien.", famille_contrainte: "lieu-temps",
    univers: "une pointe d'imaginaire dans la vie de tous les jours", type_ecriture: TYPES_JOUR[0], mode: "jour" }];
  let revient = 0, univRevient = 0;
  for (let g = 1; g <= 40; g++) {
    const ax = choisirAxes("jour", TYPES_JOUR, noteSansMot, graine(g));
    if (ax.famille.cle === "lieu-temps") revient++;
    if (ax.univers === "une pointe d'imaginaire dans la vie de tous les jours") univRevient++;
  }
  verifier("famille notée : ne ressort pas juste après", revient, 0);
  verifier("univers noté : ne ressort pas juste après", univRevient, 0);
}
// Pour vérifier une boucle d'un coup : un seul cas compté.
total++;
console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

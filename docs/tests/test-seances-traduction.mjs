#!/usr/bin/env npx tsx
/**
 * Contrat du pont entre la programmation Notion et le vocabulaire de PlanBox.
 *
 * Ce module décide dans quel sous-domaine du suivi atterrissent les exercices
 * engendrés depuis la programmation. Une erreur ici ne se voit pas : elle se
 * contente de fausser le graphe de réussite. D'où les cas ci-dessous, tous
 * tirés de séances réelles de la base « Programmation année en cours ».
 *
 * Lancer après toute modification de lib/seances-traduction.ts :
 *   npx tsx docs/tests/test-seances-traduction.mjs
 */
import {
  matiereDeLaSeance,
  sousDomaineDeLaSeance,
  codeChapitre,
  estEvaluation,
  niveauxReels,
  difficultePourNiveau,
  typesSuggeres,
  jourDepuisLundi,
  traduireSeance,
  sousDomaineConnu,
} from "../../lib/seances-traduction.ts";
import {
  appelPourSeance, empechement, consigneDepuisSeance, titreDuBloc,
} from "../../lib/seances-generation.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

/* ── 1. Périmètre : maths et français seulement ─────────────────────────── */

verifier("matière : Maths CM", matiereDeLaSeance(["Maths CM"]), "Mathématiques");
verifier("matière : Maths", matiereDeLaSeance(["Maths"]), "Mathématiques");
verifier("matière : Problème", matiereDeLaSeance(["Problème"]), "Mathématiques");
verifier("matière : EDL", matiereDeLaSeance(["EDL"]), "Français");
verifier("matière : lecture CE2 (casse libre)", matiereDeLaSeance(["lecture CE2"]), "Français");
verifier("matière : lecture cm2", matiereDeLaSeance(["lecture cm2"]), "Français");
// Hors périmètre : la séance est ignorée, pas rangée au hasard.
for (const m of ["Histoire année 1", "Géographie", "sciences", "anglais", "Arts visuels", "QLM", "Kokoro"]) {
  verifier(`matière : ${m} hors périmètre`, matiereDeLaSeance([m]), null);
}
verifier("matière : la 1re reconnue gagne", matiereDeLaSeance(["QLM", "EDL"]), "Français");

/* ── 2. Le code de chapitre iParcours, dans le titre ────────────────────── */

verifier("code : (N3 · fiche 16)",
  codeChapitre("Maths CM2 - S5 Lundi - Représenter des fractions par des aires (N3 · fiche 16)"), "Numération");
verifier("code : (G1 · fiche 91)",
  codeChapitre("Maths CM2 - S3 Jeudi - Reproduire des figures dans un quadrillage (G1 · fiche 91)"), "Géométrie");
verifier("code : (N8 · fiche 57)",
  codeChapitre("Maths CM2 - S5 Mardi - Résoudre des problèmes additifs (N8 · fiche 57)"), "Numération");
// L'autre forme attestée : les bilans portent leur code dans le libellé.
verifier("code : ÉVALUATION G1",
  codeChapitre("Maths CM2 - S4 Lundi - ÉVALUATION G1 : Éléments de géométrie"), "Géométrie");
verifier("code : ÉVALUATION D2 (données)",
  codeChapitre("Maths CM2 - S2 Mardi - ÉVALUATION D2 : Probabilités"), "Organisation et gestion de données");
verifier("code : ÉVALUATION M1 (mesures)",
  codeChapitre("Maths CM2 - S6 Vendredi - ÉVALUATION M1 : Périmètres et aires"), "Grandeurs et mesures");
// Le CE2 n'utilise pas ces codes.
verifier("code : absent en CE2",
  codeChapitre("Maths CE2 - S2 Lundi - Additionner jusqu'à 9 999 : découverte"), null);
verifier("code : lettre inconnue ignorée", codeChapitre("Séance (Z4 · fiche 1)"), null);

/* ── 3. Sous-domaine, et la confiance qu'on lui accorde ─────────────────── */

const sd = (mat, disc, titre) => sousDomaineDeLaSeance(mat, disc, titre);

verifier("sous-domaine : Conjugaison sûre",
  sd("Français", ["Conjugaison"], "Conjugaison - Le présent"),
  { sousMatiere: "Conjugaison", incertaine: false });
verifier("sous-domaine : Production d'écrits → Écriture",
  sd("Français", ["Production d'écrits"], "Tâche finale"),
  { sousMatiere: "Écriture", incertaine: false });
verifier("sous-domaine : apostrophe typographique acceptée",
  sd("Français", ["Production d’écrits"], "Tâche finale").sousMatiere, "Écriture");
verifier("sous-domaine : Vocabulaire",
  sd("Français", ["Vocabulaire"], "Les mots du portrait"),
  { sousMatiere: "Vocabulaire", incertaine: false });

// LE piège : Notion n'offre pas « Orthographe », elle la range en Grammaire.
// On accepte la valeur mais on la signale, pour que l'écran fasse confirmer.
verifier("sous-domaine : Grammaire marquée incertaine (l'ortho s'y cache)",
  sd("Français", ["Grammaire"], "Grammaire - Bilan de grammaire"),
  { sousMatiere: "Grammaire", incertaine: true });

verifier("sous-domaine : maths avec code, sûr",
  sd("Mathématiques", [], "Maths CM2 - Décomposer (N1 · fiche 3)"),
  { sousMatiere: "Numération", incertaine: false });
// Les 27 séances de CE2 sans code : on déduit, on le dit.
verifier("sous-domaine : maths sans code, incertain",
  sd("Mathématiques", [], "Maths CE2 - S2 Lundi - Additionner jusqu'à 9 999"),
  { sousMatiere: "Numération", incertaine: true });
verifier("sous-domaine : lecture reconnue au titre, sans Discipline",
  sd("Français", [], "Lecture - Griotte, la petite sorcière"),
  { sousMatiere: "Lecture", incertaine: false });

// Tout ce qui sort d'ici doit exister dans le référentiel de saisie.
for (const s of ["Conjugaison", "Grammaire", "Écriture", "Vocabulaire", "Lecture"]) {
  verifier(`référentiel : ${s} est une sous-matière de Français`, sousDomaineConnu("Français", s), true);
}
for (const s of ["Numération", "Géométrie", "Grandeurs et mesures", "Organisation et gestion de données", "Calcul", "Problèmes"]) {
  verifier(`référentiel : ${s} est une sous-matière de Mathématiques`, sousDomaineConnu("Mathématiques", s), true);
}

/* ── 4. Évaluations : à ne pas transformer en devoir ────────────────────── */

verifier("éval : reconnue", estEvaluation("Maths CM2 - ÉVALUATION N1 : Nombres entiers"), true);
verifier("éval : sans accent", estEvaluation("EVALUATION G1"), true);
verifier("éval : « Bilan »", estEvaluation("Grammaire - Bilan de grammaire"), true);
verifier("éval : séance ordinaire", estEvaluation("Maths CE2 - Additionner jusqu'à 9 999"), false);
verifier("éval : le type eval passe en tête", typesSuggeres("Numération", true)[0], "eval");
verifier("types : conjugaison → texte à trous d'abord", typesSuggeres("Conjugaison", false)[0], "texte_a_trous");
verifier("types : grammaire → analyse de phrase d'abord", typesSuggeres("Grammaire", false)[0], "analyse_phrase");
// `classement` et `ecriture` sont volontairement absents : une séance ne donne
// ni les catégories du premier, ni le sujet du second.
verifier("types : vocabulaire sans classement", typesSuggeres("Vocabulaire", false), ["qcm", "exercice"]);
verifier("types : écriture sans le type ecriture",
  typesSuggeres("Écriture", false).includes("ecriture"), false);
verifier("types : sous-domaine inconnu → repli raisonnable",
  typesSuggeres("Zorglub", false), ["exercice", "qcm"]);

/* ── 5. Niveaux : « CM » vaut CM1 + CM2 ─────────────────────────────────── */

verifier("niveaux : CM éclaté", niveauxReels(["CM"]), ["CM1", "CM2"]);
verifier("niveaux : CE2 + CM", niveauxReels(["CE2", "CM"]), ["CE2", "CM1", "CM2"]);
verifier("niveaux : pas de doublon", niveauxReels(["CM", "CM1"]), ["CM1", "CM2"]);
verifier("niveaux : valeur inconnue écartée", niveauxReels(["CP", "CE2"]), ["CE2"]);
verifier("niveaux : rien", niveauxReels([]), []);

/* ── 6. La différenciation, lue dans le corps de page ───────────────────── */

// Format unique et constant sur les 12 pages sondées.
const DIFF = "Différenciation : ★☆☆ tous · ★★☆ CM1 et CM2 · ★★★ CM2";
verifier("étoiles : CE2 n'est visé que par « tous »", difficultePourNiveau(DIFF, "CE2"), "facile");
verifier("étoiles : CM1 monte à deux étoiles", difficultePourNiveau(DIFF, "CM1"), "moyen");
verifier("étoiles : CM2 prend le segment le plus exigeant", difficultePourNiveau(DIFF, "CM2"), "difficile");
// Sans ligne, la progression naturelle vaut mieux qu'une difficulté uniforme.
verifier("étoiles : absente → CE2 facile", difficultePourNiveau(null, "CE2"), "facile");
verifier("étoiles : absente → CM2 difficile", difficultePourNiveau(null, "CM2"), "difficile");
verifier("étoiles : ligne sans étoile → repli", difficultePourNiveau("Différenciation : aucune", "CM1"), "moyen");

/* ── 7. Dates ───────────────────────────────────────────────────────────── */

verifier("jour : lundi", jourDepuisLundi("2026-09-14", "2026-09-14"), 0);
verifier("jour : vendredi", jourDepuisLundi("2026-09-18", "2026-09-14"), 4);
verifier("jour : samedi hors semaine", jourDepuisLundi("2026-09-19", "2026-09-14"), -1);
verifier("jour : dimanche précédent hors semaine", jourDepuisLundi("2026-09-13", "2026-09-14"), -1);

/* ── 8. La traduction complète ──────────────────────────────────────────── */

const seanceFr = {
  id: "abc", date: "2026-09-15", titre: "Grammaire - Le groupe nominal",
  objectifs: "Identifier déterminant, nom et adjectif.",
  matieresNotion: ["EDL"], disciplines: ["Grammaire"],
  niveaux: ["CE2", "CM"], corpus: "Griotte est la plus jeune sorcière de la forêt.",
  differenciationBrute: DIFF,
};
const fr = traduireSeance(seanceFr, "2026-09-14");
// Une séance de français taguée CE2+CM devient trois lignes différenciées.
verifier("traduction : trois niveaux", fr.map((x) => x.niveau), ["CE2", "CM1", "CM2"]);
verifier("traduction : difficultés différentes", fr.map((x) => x.difficulte), ["facile", "moyen", "difficile"]);
verifier("traduction : le corpus suit chaque ligne", fr.every((x) => x.corpus?.includes("Griotte")), true);
verifier("traduction : jour de la semaine", fr[0].jour, 1);
verifier("traduction : incertitude propagée", fr[0].sousMatiereIncertaine, true);

const seanceMaths = {
  id: "def", date: "2026-09-17", titre: "Maths CM2 - S3 Jeudi - Reproduire des figures (G1 · fiche 91)",
  objectifs: "Reproduire une figure sur quadrillage.",
  matieresNotion: ["Maths CM"], disciplines: [], niveaux: ["CM2"],
  corpus: null, differenciationBrute: null,
};
const ma = traduireSeance(seanceMaths, "2026-09-14");
// Les maths sont déjà séparées par niveau : une séance, une ligne.
verifier("traduction : maths, une seule ligne", ma.length, 1);
verifier("traduction : maths, sous-domaine sûr",
  [ma[0].sousMatiere, ma[0].sousMatiereIncertaine], ["Géométrie", false]);
verifier("traduction : maths, jour", ma[0].jour, 3);

// Hors périmètre et hors semaine : rien, jamais d'approximation.
verifier("traduction : hors périmètre → vide",
  traduireSeance({ ...seanceMaths, matieresNotion: ["Géographie"] }, "2026-09-14"), []);
verifier("traduction : hors semaine → vide",
  traduireSeance({ ...seanceMaths, date: "2026-09-26" }, "2026-09-14"), []);

/* ── 9. De la séance à l'appel de génération ────────────────────────────── */

const ligneFr = fr[2];   // « Grammaire - Le groupe nominal », CM2, avec corpus
const ligneMa = ma[0];   // « Reproduire des figures (G1 · fiche 91) », CM2

// Chaque route a son propre contrat : c'est là que les erreurs coûtent 15 s
// d'attente avant un 400.
const exo = appelPourSeance(ligneFr, "exercice");
verifier("appel : exercice → bonne route", exo.endpoint, "/api/generer-exercice");
verifier("appel : exercice, le corpus est transmis", exo.body.corpus?.includes("Griotte"), true);
verifier("appel : exercice, difficulté de la ligne", exo.body.difficulte, "difficile");
verifier("appel : exercice, niveauNom (pas niveau)", exo.body.niveauNom, "CM2");

// La route d'analyse échoue en 500 sans `fonctionsActives` : jamais l'oublier.
const ap = appelPourSeance(ligneFr, "analyse_phrase");
verifier("appel : analyse de phrase, fonctions fournies",
  Array.isArray(ap.body.fonctionsActives) && ap.body.fonctionsActives.length > 0, true);

// Le calcul mental ne renvoie pas { resultat } mais { calculs }.
const cm = appelPourSeance(ligneMa, "calcul_mental");
verifier("appel : calcul mental, réponse sans enveloppe", cm.enveloppe, "racine");
verifier("appel : calcul mental, niveauNom", cm.body.niveauNom, "CM2");
verifier("appel : exercice, réponse enveloppée", exo.enveloppe, "resultat");

// La lecture veut un vrai texte, pas une consigne.
const lec = appelPourSeance(ligneFr, "lecture");
verifier("appel : lecture, le corpus va dans texte", lec.body.texte?.includes("Griotte"), true);

// `eval` emprunte le moteur des exercices.
verifier("appel : eval passe par la route exercice",
  appelPourSeance(ligneMa, "eval").endpoint, "/api/generer-exercice");

// Les empêchements se disent avant l'appel, pas après un 400.
verifier("empêchement : lecture sans corpus", typeof empechement(ligneMa, "lecture"), "string");
verifier("empêchement : lecture avec corpus", empechement(ligneFr, "lecture"), null);
verifier("empêchement : classement toujours bloqué", typeof empechement(ligneFr, "classement"), "string");
verifier("empêchement : exercice jamais bloqué", empechement(ligneMa, "exercice"), null);

// La consigne porte les objectifs, sans répéter le titre quand il fait double emploi.
verifier("consigne : cite les objectifs",
  consigneDepuisSeance(ligneMa).includes("Reproduire une figure sur quadrillage"), true);
verifier("consigne : objectif tautologique non répété",
  consigneDepuisSeance({ ...ligneMa, objectifs: ligneMa.titre }).includes("Objectifs travaillés"), false);

// Le titre du bloc est celui que verra l'élève : sans repère d'emploi du temps.
verifier("titre : sans code ni jour",
  titreDuBloc(ligneMa), "Reproduire des figures");
verifier("titre : préfixe de discipline retiré",
  titreDuBloc({ ...ligneMa, titre: "Grammaire - Le groupe nominal" }), "Le groupe nominal");
verifier("titre : jamais vide",
  titreDuBloc({ ...ligneMa, titre: "Maths CM2 - S3 Jeudi -" }).length > 0, true);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

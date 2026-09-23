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
  decouperVolets,
  sousDomaineConnu,
} from "../../lib/seances-traduction.ts";
import {
  appelPourSeance, empechement, consigneDepuisSeance, titreDuBloc,
} from "../../lib/seances-generation.ts";
import { ErreurNotion, messageErreurNotion, extraireDuCorps, extraireCalculMental, tableauCalculMental } from "../../lib/seances-notion.ts";

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

verifier("sous-domaine : Grammaire, Discipline explicite donc sûre",
  sd("Français", ["Grammaire"], "Grammaire - Bilan de grammaire"),
  { sousMatiere: "Grammaire", incertaine: false });
// Sans Discipline ni indice au titre, le repli sur Grammaire est une déduction.
verifier("sous-domaine : français sans Discipline, incertain",
  sd("Français", [], "Séance de français"),
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
verifier("types : aucun doublon", (() => {
  const t = typesSuggeres("Numération", true);
  return t.length === new Set(t).size;
})(), true);
verifier("types : conjugaison → texte à trous d'abord", typesSuggeres("Conjugaison", false)[0], "texte_a_trous");
verifier("types : grammaire → analyse de phrase d'abord", typesSuggeres("Grammaire", false)[0], "analyse_phrase");
// `classement` et `ecriture` sont volontairement absents : une séance ne donne
// ni les catégories du premier, ni le sujet du second.
verifier("types : vocabulaire, les plus adaptés d'abord",
  typesSuggeres("Vocabulaire", false).slice(0, 2), ["qcm", "exercice"]);
// La suggestion guide, elle n'enferme pas : tout type pilotable reste
// atteignable, sinon on ne peut pas demander du calcul mental sur une séance
// de numération.
verifier("types : le calcul mental reste atteignable partout",
  typesSuggeres("Numération", false).includes("calcul_mental"), true);
verifier("types : le classement reste absent (non pilotable)",
  typesSuggeres("Vocabulaire", false).includes("classement"), false);
verifier("types : écriture sans le type ecriture",
  typesSuggeres("Écriture", false).includes("ecriture"), false);
verifier("types : sous-domaine inconnu → repli raisonnable",
  typesSuggeres("Zorglub", false).slice(0, 2), ["exercice", "qcm"]);

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

/* ── 6 bis. Les deux notions d'une séance de grammaire ──────────────────── */

// Cas réels du mardi : l'enseignant travaille grammaire ET orthographe, et
// l'écrit dans le titre avec « · ». Notion n'a pas de Discipline pour le dire.
const dv = (titre, objectifs) => decouperVolets("Français", ["Grammaire"], titre, objectifs);

const v1 = dv("Grammaire - Les types de phrases · a / à",
  "Identifier et produire les types de phrases (déclarative, interrogative, exclamative). Distinguer les homophones a / à.");
verifier("volets : deux lignes", v1.length, 2);
verifier("volets : sous-domaines", v1.map((v) => v.sousMatiere), ["Grammaire", "Orthographe"]);
verifier("volets : titre de grammaire", v1[0].titre, "Grammaire - Les types de phrases");
verifier("volets : titre d'orthographe", v1[1].titre, "Orthographe - a / à");
verifier("volets : objectif de grammaire, sans l'ortho",
  v1[0].objectifs, "Identifier et produire les types de phrases (déclarative, interrogative, exclamative).");
verifier("volets : objectif d'orthographe, sans la grammaire",
  v1[1].objectifs, "Distinguer les homophones a / à.");
verifier("volets : aucune incertitude, l'enseignant l'a écrit",
  v1.map((v) => v.incertaine), [false, false]);

// Trois notions d'orthographe d'un coup, ponctuées par « ; ».
const v2 = dv("Grammaire - La forme négative · son/sont · on/ont · -ent",
  "La forme négative ; les homophones son/sont et on/ont ; la marque -ent du verbe.");
verifier("volets : ortho multiple, titre", v2[1].titre, "Orthographe - son/sont · on/ont · -ent");
verifier("volets : ortho multiple, objectif de grammaire", v2[0].objectifs, "La forme négative.");
verifier("volets : ortho multiple, objectif d'ortho",
  v2[1].objectifs, "les homophones son/sont et on/ont. la marque -ent du verbe.");

// L'objectif recopie parfois le titre : le partage ne donne rien, on retombe
// sur les segments plutôt que de rendre une ligne vide.
const v3 = dv("Grammaire - Le sujet et le verbe · et / est", "Le sujet et le verbe · et / est.");
verifier("volets : objectif = titre, « · » lu comme au titre",
  [v3[0].objectifs, v3[1].objectifs], ["Le sujet et le verbe.", "et / est."]);

// Une séance de grammaire sans « · » reste une seule ligne.
const v4 = dv("Grammaire - L'accord sujet-verbe", "L'accord sujet-verbe.");
verifier("volets : pas de « · » → une ligne", v4.length, 1);
verifier("volets : pas de « · » → titre intact", v4[0].titre, "Grammaire - L'accord sujet-verbe");

// Le découpage ne touche que la grammaire : une conjugaison reste entière.
verifier("volets : conjugaison non découpée",
  decouperVolets("Français", ["Conjugaison"], "Conjugaison - Le présent · être et avoir", "Le présent.").length, 1);
verifier("volets : maths non découpées",
  decouperVolets("Mathématiques", [], "Maths CM2 - Décomposer (N1 · fiche 3)", "Décomposer.").length, 1);

verifier("référentiel : Orthographe est une sous-matière de Français",
  sousDomaineConnu("Français", "Orthographe"), true);
verifier("types : orthographe → texte à trous d'abord",
  typesSuggeres("Orthographe", false)[0], "texte_a_trous");

// Bout en bout : une séance du mardi donne six lignes, deux notions × trois niveaux.
const mardi = traduireSeance({
  id: "mar", date: "2026-09-08", titre: "Grammaire - Les types de phrases · a / à",
  objectifs: "Identifier et produire les types de phrases. Distinguer les homophones a / à.",
  matieresNotion: ["EDL"], disciplines: ["Grammaire"], niveaux: ["CE2", "CM"],
  corpus: null, differenciationBrute: null,
}, "2026-09-07");
verifier("mardi : six lignes", mardi.length, 6);
verifier("mardi : sous-domaines",
  [...new Set(mardi.map((x) => x.sousMatiere))], ["Grammaire", "Orthographe"]);
verifier("mardi : volets distingués", [...new Set(mardi.map((x) => x.volet))], [0, 1]);
verifier("mardi : clés uniques",
  new Set(mardi.map((x) => `${x.seanceId}_${x.volet}_${x.niveau}`)).size, 6);
verifier("mardi : titre du bloc d'orthographe allégé",
  titreDuBloc(mardi[3]), "a / à");

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
verifier("traduction : Discipline explicite, aucune incertitude", fr[0].sousMatiereIncertaine, false);
verifier("traduction : un seul volet sans « · »", fr.length, 3);
verifier("traduction : volet 0 partout", fr.map((x) => x.volet), [0, 0, 0]);

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

/* ── 9 bis. Le corpus, dans les deux gabarits de la base ────────────────── */
//
// Deux mises en page coexistent, et l'écart n'était pas anodin : les séances de
// LECTURE — les seules pour lesquelles le type `lecture` exige un texte —
// étaient les seules dont on ne trouvait jamais le texte.

const bloc = (type, texte) => ({ type, [type]: { rich_text: [{ plain_text: texte }] } });

// Gabarit 1 : séance de langue. Le corpus tient en un bloc, suivi aussitôt des
// lignes d'intendance — qu'il ne faut surtout pas avaler.
const pageLangue = [
  bloc("quote", "Corpus de la semaine - « Portrait de Rosalie »"),
  bloc("quote", "Sous le chapiteau, Rosalie finit son numéro sans trembler. Elle ne tombe pas."),
  bloc("paragraph", "Discipline : Conjugaison (lundi) · Niveaux : CE2 / CM1 / CM2 · Durée : 45 min"),
  bloc("paragraph", "Différenciation : ★☆☆ tous · ★★☆ CM1 et CM2 · ★★★ CM2"),
  bloc("heading_2", "1. Rituel - transposition du corpus (5 min)"),
];
verifier("corpus : séance de langue, un seul bloc",
  extraireDuCorps(pageLangue).corpus,
  "Sous le chapiteau, Rosalie finit son numéro sans trembler. Elle ne tombe pas.");
verifier("corpus : l'intendance n'est pas avalée",
  extraireDuCorps(pageLangue).corpus.includes("Discipline"), false);
verifier("corpus : la différenciation est lue au passage",
  extraireDuCorps(pageLangue).differenciation.startsWith("Différenciation :"), true);

// Gabarit 2 : séance de lecture. Autre titre, texte étalé, note de renvoi en tête.
const pageLecture = [
  bloc("paragraph", "Discipline : Lecture / compréhension (jeudi) · Niveaux : CE2 / CM1 / CM2"),
  bloc("paragraph", "Différenciation : ★☆☆ tous · ★★☆ CM1 et CM2 · ★★★ CM2"),
  bloc("heading_2", "Texte de lecture - « Rosalie, l'écuyère »"),
  bloc("paragraph", "Prolongement du corpus « Portrait de Rosalie » - feuille imprimable dans Documents."),
  bloc("paragraph", "Sous le grand chapiteau, Rosalie est la reine de la piste."),
  bloc("paragraph", "Ses longs cheveux blonds volent derrière elle comme un ruban d'or."),
  bloc("heading_2", "Dictée flash du jour (5 min)"),
  bloc("quote", "Son sourire ne faiblit jamais."),
];
const lu = extraireDuCorps(pageLecture);
verifier("corpus : séance de lecture, les paragraphes sont recollés",
  lu.corpus,
  "Sous le grand chapiteau, Rosalie est la reine de la piste.\n\n" +
  "Ses longs cheveux blonds volent derrière elle comme un ruban d'or.");
// LA note : laissée dans le corpus, l'IA fabriquerait des questions sur la feuille.
verifier("corpus : la note de renvoi est écartée", lu.corpus.includes("imprimable"), false);
verifier("corpus : on s'arrête au titre suivant", lu.corpus.includes("sourire"), false);
verifier("corpus : la différenciation est lue avant le texte",
  lu.differenciation.includes("★★★ CM2"), true);

// Sans annonce, pas de corpus : on ne prend pas le premier paragraphe venu.
verifier("corpus : aucune annonce → rien",
  extraireDuCorps([bloc("paragraph", "Un paragraphe ordinaire, assez long pour passer le seuil des quarante.")]).corpus,
  null);
// Une annonce suivie d'un titre seul ne fait pas un corpus.
verifier("corpus : annonce sans texte → rien",
  extraireDuCorps([bloc("quote", "Corpus de la semaine - « Portrait »"), bloc("heading_2", "Suite")]).corpus,
  null);
verifier("corpus : texte trop court → rien",
  extraireDuCorps([bloc("quote", "Corpus de la semaine"), bloc("quote", "Trop court.")]).corpus,
  null);

/* ── 9 ter. Le calcul mental des séances de maths ──────────────────────── */

const bl = (type, texte) => ({ type, [type]: { rich_text: [{ plain_text: texte }] } });

// Forme CM : procédure, ligne de calculs à « · », conseil.
const pageCM = [
  bl("heading_2", "1. Calcul mental — 5 min"),
  bl("paragraph", "Ajouter 9, 19, 29 (procédure N7, fiche 49) :"),
  bl("paragraph", "45 + 9 · 67 + 19 · 134 + 29 · 256 + 9 · 78 + 19"),
  bl("paragraph", "Faire verbaliser : j'ajoute 10, 20 ou 30, puis je retire 1."),
  { type: "divider", divider: {} },
  bl("heading_2", "2. Rappel oral — 5 min"),
  bl("paragraph", "Rien à voir · avec · le calcul"),
];
const cmCM = extraireCalculMental(pageCM);
verifier("calcul mental CM : procédure", cmCM.procedure, "Ajouter 9, 19, 29 (procédure N7, fiche 49)");
verifier("calcul mental CM : intitulé sans la référence", cmCM.intitule, "Ajouter 9, 19, 29");
verifier("calcul mental CM : les cinq modèles", cmCM.modeles, ["45 + 9", "67 + 19", "134 + 29", "256 + 9", "78 + 19"]);
verifier("calcul mental CM : le conseil", cmCM.conseil, "Faire verbaliser : j'ajoute 10, 20 ou 30, puis je retire 1.");
verifier("calcul mental CM : on s'arrête à la rubrique suivante", cmCM.modeles.includes("avec"), false);

// Forme CE2 : procédure dans le titre, calculs dans un tableau livré à part.
const pageCE2 = [
  bl("heading_2", "1️⃣ Calcul mental (5 min) — Le nombre qui suit (> 100)"),
  { type: "table", id: "tab-1", table: { has_column_header: true } },
  { type: "divider", divider: {} },
];
verifier("calcul mental CE2 : le tableau est repéré", tableauCalculMental(pageCE2), { id: "tab-1", entete: true });
const cmCE2 = extraireCalculMental(pageCE2, [["199", "200"], ["349", "350"]]);
verifier("calcul mental CE2 : procédure lue dans le titre", cmCE2.procedure, "Le nombre qui suit (> 100)");
verifier("calcul mental CE2 : modèles avec leur réponse", cmCE2.modeles, ["199 → 200", "349 → 350"]);
verifier("calcul mental CE2 : sans les rangées, pas de modèles mais une procédure",
  extraireCalculMental(pageCE2).modeles, []);

verifier("calcul mental : pas de rubrique → rien",
  extraireCalculMental([bl("heading_2", "1. Rappel oral"), bl("paragraph", "Du texte.")]), null);
verifier("calcul mental : rubrique vide et titre nu → rien",
  extraireCalculMental([bl("heading_2", "1. Calcul mental"), bl("heading_2", "2. Suite")]), null);
verifier("calcul mental : pas de tableau sous une rubrique CM", tableauCalculMental(pageCM), null);

// La traduction en fait une ligne à part, de calcul, jamais une évaluation.
const seanceCM = {
  id: "cm1", date: "2026-10-01", titre: "Maths CM2 - S5 Jeudi - ÉVALUATION N1 : Les nombres",
  objectifs: "Évaluer.", matieresNotion: ["Maths CM"], disciplines: [], niveaux: ["CM2"],
  corpus: null, differenciationBrute: null, calculMental: cmCM,
};
const tr = traduireSeance(seanceCM, "2026-09-28");
const ligneCM = tr.find((l) => l.titre.startsWith("Calcul mental"));
verifier("traduction : une ligne de calcul mental en plus", tr.length, 2);
verifier("traduction : titre lisible", ligneCM.titre, "Calcul mental — Ajouter 9, 19, 29");
verifier("traduction : sous-domaine Calcul", ligneCM.sousMatiere, "Calcul");
verifier("traduction : calcul mental proposé d'abord", ligneCM.typesSuggeres[0], "calcul_mental");
// Un jour de bilan commence aussi par cinq minutes de calcul mental : ce
// n'est pas une évaluation, et il ne doit pas être décoché d'office.
verifier("traduction : jamais une évaluation", ligneCM.estEvaluation, false);
verifier("traduction : volet distinct de la séance", [tr[0].volet, ligneCM.volet], [0, 1]);
verifier("traduction : les modèles voyagent", ligneCM.calculsModeles.length, 5);
verifier("traduction : pas de calcul mental hors des maths",
  traduireSeance({ ...seanceCM, matieresNotion: ["EDL"], disciplines: ["Grammaire"], niveaux: ["CM2"],
    titre: "Grammaire - X" }, "2026-09-28").some((l) => l.titre.startsWith("Calcul mental")), false);

const appelCM = appelPourSeance(ligneCM, "calcul_mental");
verifier("génération : les modèles sont dans la consigne", appelCM.body.consignes.includes("45 + 9"), true);
verifier("génération : interdiction de recopier", /n'en recopie aucun/.test(appelCM.body.consignes), true);
verifier("génération : bon niveau", appelCM.body.niveauNom, "CM2");

/* ── 10. Ce qu'une panne Notion montre à l'enseignant ───────────────────── */
//
// Le message de Notion cite l'identifiant de base interrogé. Un identifiant mal
// saisi peut être un jeton — c'est arrivé, et la configuration s'est affichée
// en clair dans le panneau. Rien de ce que dit Notion ne doit atteindre l'écran.

const SECRET = "ntn_5249-0745-5385-C1RT-negSITwbaa5C";
const err404 = new ErreurNotion(404, `Could not find database with ID: ${SECRET}.`);

verifier("panne : le message de Notion n'est jamais répété",
  messageErreurNotion(err404).includes(SECRET), false);
verifier("panne : 404 renvoie à la bonne variable",
  messageErreurNotion(err404).includes("NOTION_DB_SEANCES"), true);
verifier("panne : 401 renvoie au jeton",
  messageErreurNotion(new ErreurNotion(401, "API token is invalid.")).includes("NOTION_TOKEN"), true);
verifier("panne : 401 ne répète pas Notion",
  messageErreurNotion(new ErreurNotion(401, "API token is invalid.")).includes("invalid"), false);
verifier("panne : 429 invite à réessayer",
  messageErreurNotion(new ErreurNotion(429, "rate limited")).includes("Réessayez"), true);
verifier("panne : code inconnu reste lisible",
  messageErreurNotion(new ErreurNotion(500, "boom")).includes("500"), true);
verifier("panne : code inconnu ne répète pas Notion",
  messageErreurNotion(new ErreurNotion(500, "boom")).includes("boom"), false);
// L'erreur de configuration, elle, est écrite par nous : elle ne cite rien.
verifier("panne : configuration manquante, message conservé",
  messageErreurNotion(new Error("Programmation Notion non configurée : NOTION_TOKEN et NOTION_DB_SEANCES manquants."))
    .includes("non configurée"), true);
verifier("panne : erreur sans message",
  messageErreurNotion(null), "La programmation n'a pas pu être lue.");

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

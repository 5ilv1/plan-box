#!/usr/bin/env npx tsx
/**
 * Contrat du socle de suivi : ce qu'on compte, comment on le range, comment on
 * le note.
 *
 * Les trois pièges que ce fichier garde :
 *   1. le périmètre — podcasts et ceintures ne comptent PAS dans la complétion ;
 *   2. le classement — un bloc qu'on ne sait pas ranger va dans « Non classé »,
 *      jamais au hasard dans une matière ;
 *   3. le bâclage — il faut DEUX signaux (vite ET faux), jamais la vitesse seule.
 *
 * Lancer après toute modification de lib/suivi-metriques.ts :
 *   npx tsx docs/tests/test-suivi-metriques.mjs
 */
import {
  estComptePourCompletion,
  matiereDuBloc,
  scoreBloc,
  nbQuestionsBloc,
  champsTerminaison,
  champsReprise,
  rythme,
  signalBaclage,
  completion,
  estEnRetard,
  agregerParMatiere,
  uidDuBloc,
  decouperUid,
  lundiDe,
  decalerJours,
  bornesPeriode,
  bornesPrecedentes,
  DUREE_MAX_SECONDES,
  NON_CLASSE,
  SOUS_DOMAINES,
  normaliserMatiere,
} from "../../lib/suivi-metriques.ts";
import { MATIERES_CANONIQUES, exigeSousMatiere } from "../../lib/matieres-referentiel.ts";

let echecs = 0;
let total = 0;

function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  if (o !== a) {
    echecs++;
    console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`);
  }
}

/* ── 1. Périmètre ───────────────────────────────────────────────────────── */

for (const t of ["exercice", "qcm", "calcul_mental", "dictee", "ecriture", "lecon_copier", "eval"]) {
  verifier(`périmètre : ${t} compte`, estComptePourCompletion(t), true);
}
// La demande est explicite : ceintures, podcasts et cartes à réviser dehors.
for (const t of ["ressource", "ceinture_multiplication", "repetibox", "media", "libre"]) {
  verifier(`périmètre : ${t} est exclu`, estComptePourCompletion(t), false);
}
verifier("périmètre : type inconnu exclu", estComptePourCompletion("zorglub"), false);

/* ── 2. Classement par matière ──────────────────────────────────────────── */

// contenu.matiere fait foi quand il existe
verifier("matière : contenu.matiere prioritaire",
  matiereDuBloc("exercice", { matiere: "Mathématiques" }).matiere, "Mathématiques");
// Sans sous-matière, le sous-domaine nomme l'activité — jamais « Maths · Maths ».
// Et il se déclare IMPRÉCIS : c'est ce drapeau que le script de reprise suit.
verifier("matière : repli sur le type d'activité",
  matiereDuBloc("exercice", { matiere: "Mathématiques" }),
  { matiere: "Mathématiques", sousDomaine: "Exercices", precis: false });
verifier("matière : QCM avec matière mais sans sous-matière",
  matiereDuBloc("qcm", { matiere: "Français" }),
  { matiere: "Français", sousDomaine: "QCM", precis: false });
verifier("matière : accents et casse normalisés",
  matiereDuBloc("exercice", { matiere: "francais" }).matiere, "Français");
verifier("matière : sous_matiere reprise telle quelle, et précise",
  matiereDuBloc("exercice", { matiere: "Français", sous_matiere: "Conjugaison" }),
  { matiere: "Français", sousDomaine: "Conjugaison", precis: true });
verifier("matière : sous_matiere vide ne compte pas comme précise",
  matiereDuBloc("exercice", { matiere: "Français", sous_matiere: "  " }).precis, false);
// Un type sans ambiguïté est précis sans qu'on ait rien à saisir.
verifier("matière : le type suffit à être précis",
  matiereDuBloc("calcul_mental", { matiere: "maths" }),
  { matiere: "Mathématiques", sousDomaine: "Calcul", precis: true });

// La liste fermée : le script n'y puise que des valeurs connues.
verifier("sous-domaines : Numération en maths",
  SOUS_DOMAINES["Mathématiques"].includes("Numération"), true);
verifier("sous-domaines : Conjugaison en français",
  SOUS_DOMAINES["Français"].includes("Conjugaison"), true);
// Le vocabulaire du formulaire fait foi : « maths » ressort « Mathématiques ».
verifier("normalisation : maths → Mathématiques", normaliserMatiere("maths"), "Mathématiques");
verifier("normalisation : casse et accents", normaliserMatiere("  FRANCAIS "), "Français");
verifier("normalisation : inconnue rendue telle quelle", normaliserMatiere("Zorglub"), "Zorglub");
// Le formulaire et le suivi lisent la même liste : un exercice rangé en
// « Numération » à la création doit ressortir « Numération » dans le graphe.
verifier("référentiel : la liste du suivi est celle du formulaire",
  MATIERES_CANONIQUES["Français"].every((sm) => SOUS_DOMAINES["Français"].includes(sm)), true);
// Le type dit déjà tout pour un calcul mental : rien à exiger à la saisie.
verifier("exigence : exercice et QCM la réclament",
  [exigeSousMatiere("exercice"), exigeSousMatiere("qcm"), exigeSousMatiere("classement")],
  [true, true, true]);
verifier("exigence : les types sans ambiguïté ne la réclament pas",
  [exigeSousMatiere("calcul_mental"), exigeSousMatiere("dictee"), exigeSousMatiere("rangement")],
  [false, false, false]);

// sinon le type décide
const P = { precis: true };
verifier("matière : calcul_mental → Mathématiques/Calcul",
  matiereDuBloc("calcul_mental", null), { matiere: "Mathématiques", sousDomaine: "Calcul", ...P });
verifier("matière : comparaison → Mathématiques/Numération",
  matiereDuBloc("comparaison", {}), { matiere: "Mathématiques", sousDomaine: "Numération", ...P });
verifier("matière : rangement → Mathématiques/Numération",
  matiereDuBloc("rangement", {}), { matiere: "Mathématiques", sousDomaine: "Numération", ...P });
verifier("matière : analyse_phrase → Français/Grammaire",
  matiereDuBloc("analyse_phrase", {}), { matiere: "Français", sousDomaine: "Grammaire", ...P });
verifier("matière : dictee → Français/Orthographe",
  matiereDuBloc("dictee", {}), { matiere: "Français", sousDomaine: "Orthographe", ...P });
verifier("matière : texte_a_trous → Français/Orthographe",
  matiereDuBloc("texte_a_trous", {}), { matiere: "Français", sousDomaine: "Orthographe", ...P });
verifier("matière : ecriture → Français/Écriture",
  matiereDuBloc("ecriture", {}), { matiere: "Français", sousDomaine: "Écriture", ...P });
verifier("matière : ressource → Lecture/Podcasts",
  matiereDuBloc("ressource", {}), { matiere: "Lecture", sousDomaine: "Podcasts", ...P });

// Le piège : un qcm sans matière ne doit pas être rangé au hasard.
verifier("matière : qcm sans matière → Non classé",
  matiereDuBloc("qcm", {}), { matiere: NON_CLASSE, sousDomaine: NON_CLASSE, precis: false });
verifier("matière : classement sans matière → Non classé",
  matiereDuBloc("classement", null), { matiere: NON_CLASSE, sousDomaine: NON_CLASSE, precis: false });
verifier("matière : matière vide ignorée",
  matiereDuBloc("qcm", { matiere: "   " }).matiere, NON_CLASSE);

/* ── 3. Scores ──────────────────────────────────────────────────────────── */

verifier("score : 1er essai et final distincts",
  scoreBloc({ premier_score: 4, premier_score_total: 10, score_eleve: 9, score_total: 10, nb_tentatives: 2 }),
  { pctPremier: 40, pctFinal: 90, tentatives: 2, nbQuestions: 10 });
verifier("score : total nul ne divise pas par zéro",
  scoreBloc({ score_eleve: 3, score_total: 0 }).pctFinal, null);
verifier("score : contenu vide",
  scoreBloc(null), { pctPremier: null, pctFinal: null, tentatives: 1, nbQuestions: null });
verifier("score : tentatives par défaut à 1",
  scoreBloc({ score_eleve: 1, score_total: 2 }).tentatives, 1);

// L'unité du rythme est l'item NOTÉ : le total du score passe avant les
// tableaux du contenu. Une analyse de phrase porte 5 phrases mais 24 groupes
// notés — compter les phrases rendait le seuil de bâclage incomparable d'un
// type à l'autre.
verifier("questions : le total noté fait foi",
  nbQuestionsBloc({ phrases: [1, 2, 3, 4, 5], premier_score_total: 24, score_total: 24 }), 24);
verifier("questions : repli sur les tableaux sans note",
  nbQuestionsBloc({ questions: [1, 2, 3] }), 3);
verifier("questions : compte les calculs", nbQuestionsBloc({ calculs: [1, 2] }), 2);
verifier("questions : compte les trous", nbQuestionsBloc({ trous: [1, 2, 3, 4] }), 4);
verifier("questions : score_total seul", nbQuestionsBloc({ score_total: 7 }), 7);
verifier("questions : un total nul ne compte pas",
  nbQuestionsBloc({ score_total: 0, questions: [1, 2] }), 2);
verifier("questions : rien à compter", nbQuestionsBloc({}), null);

// Le cas réel qui a révélé le défaut : 115 s sur 24 groupes = 4,8 s par item.
verifier("rythme : analyse de phrase notée sur ses groupes",
  rythme(115, nbQuestionsBloc({ phrases: [1,2,3,4,5], premier_score_total: 24 })), 4.8);
// …mais 100 % au premier essai : rapide et juste n'est pas bâclé.
verifier("bâclage : rapide mais parfait", signalBaclage(115, 24, 100), false);

/* ── 4. Durée ───────────────────────────────────────────────────────────── */

verifier("durée : arrondie", champsTerminaison(42.6).duree_secondes, 43);
verifier("durée : zéro reste zéro", champsTerminaison(0).duree_secondes, 0);
verifier("durée : absente → null", champsTerminaison(undefined).duree_secondes, null);
verifier("durée : négative rejetée", champsTerminaison(-5).duree_secondes, null);
verifier("durée : NaN rejeté", champsTerminaison(NaN).duree_secondes, null);
// Tablette laissée ouverte toute la matinée : on plafonne plutôt que de fausser les moyennes.
verifier("durée : plafonnée", champsTerminaison(99999).duree_secondes, DUREE_MAX_SECONDES);
verifier("durée : termine_le posé", typeof champsTerminaison(10).termine_le, "string");
verifier("reprise : tout remis à null", champsReprise(), { termine_le: null, duree_secondes: null });

verifier("rythme : 60 s pour 10 questions", rythme(60, 10), 6);
verifier("rythme : une décimale", rythme(25, 10), 2.5);
verifier("rythme : sans durée", rythme(null, 10), null);
verifier("rythme : sans questions", rythme(60, 0), null);

/* ── 5. Bâclage : deux signaux, jamais un seul ──────────────────────────── */

verifier("bâclage : vite ET faux", signalBaclage(20, 10, 30), true);
// Un élève rapide et juste n'est pas un élève qui bâcle.
verifier("bâclage : vite mais juste", signalBaclage(20, 10, 95), false);
verifier("bâclage : lent et faux", signalBaclage(600, 10, 30), false);
verifier("bâclage : pas de durée", signalBaclage(null, 10, 10), false);
verifier("bâclage : pas de score", signalBaclage(20, 10, null), false);

/* ── 6. Complétion et retard ────────────────────────────────────────────── */

verifier("complétion : 2 sur 4",
  completion([{ statut: "fait" }, { statut: "fait" }, { statut: "a_faire" }, { statut: "en_cours" }]),
  { faits: 2, total: 4, pct: 50 });
// Aucun travail donné n'est pas 0 % : c'est « rien à dire ».
verifier("complétion : rien assigné → pct null", completion([]), { faits: 0, total: 0, pct: null });

const bloc = (o) => ({ statut: "a_faire", date_assignation: "2026-09-10", date_limite: null, ...o });
verifier("retard : date passée", estEnRetard(bloc({}), "2026-09-15"), true);
verifier("retard : fait n'est jamais en retard", estEnRetard(bloc({ statut: "fait" }), "2026-09-15"), false);
verifier("retard : aujourd'hui n'est pas en retard", estEnRetard(bloc({}), "2026-09-10"), false);
verifier("retard : la date limite prime",
  estEnRetard(bloc({ date_limite: "2026-09-20" }), "2026-09-15"), false);

/* ── 7. Agrégation par matière ──────────────────────────────────────────── */

const blocsAgreges = [
  { type: "calcul_mental", statut: "fait", duree_secondes: 120,
    contenu: { premier_score: 8, premier_score_total: 10, score_eleve: 10, score_total: 10, calculs: [1,2,3,4,5,6,7,8,9,10] } },
  { type: "calcul_mental", statut: "fait", duree_secondes: 60,
    contenu: { premier_score: 2, premier_score_total: 10, score_eleve: 5, score_total: 10, calculs: [1,2,3,4,5,6,7,8,9,10] } },
  // Non fait : ignoré.
  { type: "calcul_mental", statut: "a_faire", duree_secondes: null, contenu: {} },
  // Podcast : hors périmètre, même terminé avec un score.
  { type: "ressource", statut: "fait", duree_secondes: 10,
    contenu: { score_eleve: 0, score_total: 5, questions: [1,2,3,4,5] } },
];
const agr = agregerParMatiere(blocsAgreges);
verifier("agrégat : une seule ligne (le podcast est exclu)", agr.length, 1);
// Pondéré par les questions : 10/20 au 1er essai, 15/20 au final.
verifier("agrégat : 1er essai pondéré", agr[0].pctPremier, 50);
verifier("agrégat : final pondéré", agr[0].pctFinal, 75);
verifier("agrégat : 2 blocs comptés", agr[0].nbBlocs, 2);
verifier("agrégat : rythme 180 s / 20 questions", agr[0].secondesParQuestion, 9);
// Le second bloc : 6 s/question, 20 % au 1er essai → pas assez rapide pour être bâclé.
verifier("agrégat : aucun bâclage ici", agr[0].nbBacles, 0);

/* ── 8. Identité des élèves ─────────────────────────────────────────────── */

verifier("uid : PlanBox", uidDuBloc({ eleve_id: "abc", repetibox_eleve_id: null }), "pb_abc");
verifier("uid : Repetibox", uidDuBloc({ eleve_id: null, repetibox_eleve_id: 7 }), "rb_7");
verifier("uid : id 0 reste valide", uidDuBloc({ eleve_id: null, repetibox_eleve_id: 0 }), "rb_0");
verifier("uid : bloc orphelin", uidDuBloc({ eleve_id: null, repetibox_eleve_id: null }), null);
verifier("uid : découpage RB", decouperUid("rb_12"), { source: "repetibox", id: "12" });
verifier("uid : découpage PB", decouperUid("pb_xy"), { source: "planbox", id: "xy" });
verifier("uid : préfixe inconnu", decouperUid("zz_1"), null);

/* ── 9. Dates — jamais toISOString() sur une date locale ────────────────── */

verifier("lundi : un mercredi", lundiDe("2026-09-16"), "2026-09-14");
verifier("lundi : un lundi reste lui-même", lundiDe("2026-09-14"), "2026-09-14");
// Le piège classique : un dimanche appartient à la semaine qui commence le lundi d'avant.
verifier("lundi : un dimanche", lundiDe("2026-09-20"), "2026-09-14");
verifier("décalage : passage de mois", decalerJours("2026-08-31", 1), "2026-09-01");
verifier("décalage : recul sur l'année", decalerJours("2026-01-01", -1), "2025-12-31");

verifier("bornes jour", bornesPeriode("jour", "2026-09-16").debut, "2026-09-16");
verifier("bornes semaine : lundi → dimanche",
  { d: bornesPeriode("semaine", "2026-09-16").debut, f: bornesPeriode("semaine", "2026-09-16").fin },
  { d: "2026-09-14", f: "2026-09-20" });
verifier("bornes mois : 30 jours", bornesPeriode("mois", "2026-09-16").debut, "2026-08-18");
verifier("période précédente : semaine d'avant",
  bornesPrecedentes(bornesPeriode("semaine", "2026-09-16")),
  { debut: "2026-09-07", fin: "2026-09-13" });
verifier("période précédente : veille",
  bornesPrecedentes(bornesPeriode("jour", "2026-09-16")),
  { debut: "2026-09-15", fin: "2026-09-15" });

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);

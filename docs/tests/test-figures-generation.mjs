#!/usr/bin/env npx tsx
/**
 * Contrat des figures engendrées par l'IA (lib/figures-generation.ts).
 *
 * Une figure abîmée emporte sa question ; une réponse que le dessin contredit
 * aussi. Ce qu'on ne sait pas recalculer passe. Une question sans figure
 * passe toujours.
 *
 *   npx tsx docs/tests/test-figures-generation.mjs
 */
import {
  figuresPossibles, assainirFigure, desaccord, filtrerFigures,
  aire, perimetreQuadrillage, premierNombre, lireHeure, consigneFigures,
  polygoneSimple, mesureDuDessin, remplacerNombre, nbOptionsJustes,
  assainirDroite, valeursEcrites, pointDemande, nbOptionsJustesDroite,
} from "../../lib/figures-generation.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

/* ── Quand proposer des figures ─────────────────────────────────────────── */
verifier("géométrie", figuresPossibles("Mathématiques", "Géométrie"), true);
verifier("grandeurs et mesures", figuresPossibles("Mathématiques", "Grandeurs et mesures"), true);
verifier("numération sans mot-clé", figuresPossibles("Mathématiques", "Numération", "Les grands nombres"), false);
verifier("CE2 replié sur numération, thème d'aire", figuresPossibles("Mathématiques", "Numération", "Mesurer des aires"), true);
verifier("lire l'heure", figuresPossibles("Mathématiques", "", "Lire l'heure sur une horloge"), true);
verifier("français : jamais", figuresPossibles("Français", "Géométrie"), false);
verifier("« figurer » n'est pas une figure", figuresPossibles("Mathématiques", "Calcul", "Les nombres qui doivent figurer"), false);
verifier("consigne : nécessaire d'abord", consigneFigures("exercice").includes("SEULEMENT si la question est impossible sans elle"), true);
verifier("consigne : illustration occasionnelle", consigneFigures("qcm").includes("jamais toutes"), true);

/* ── Outils de calcul ───────────────────────────────────────────────────── */
const rect = [[1, 1], [5, 1], [5, 4], [1, 4]];
verifier("aire d'un rectangle 4×3", aire(rect), 12);
verifier("aire d'une figure en L", aire([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]), 5);
verifier("périmètre 4×3", perimetreQuadrillage(rect), 14);
verifier("périmètre d'un triangle : non calculable", perimetreQuadrillage([[0, 0], [3, 0], [0, 2]]), null);
verifier("nombre français", premierNombre("12,5 cm²"), 12.5);
verifier("espace de milliers", premierNombre("1 200 m"), 1200);
verifier("heure 3 h 25", lireHeure("3 h 25"), { h: 3, m: 25, minutesEcrites: true });
verifier("heure 15h05", lireHeure("15h05"), { h: 15, m: 5, minutesEcrites: true });
verifier("heure 8 h", lireHeure("8 h"), { h: 8, m: 0, minutesEcrites: false });
verifier("heure « 7 heures 30 » (essai du 23/10)", lireHeure("7 heures 30"), { h: 7, m: 30, minutesEcrites: true });
verifier("pas d'heure", lireHeure("25 minutes"), null);

/* ── Assainir ───────────────────────────────────────────────────────────── */
verifier("cadran sain", assainirFigure({ type: "cadran", heures: 3, minutes: 25 }), { type: "cadran", heures: 3, minutes: 25 });
verifier("cadran : minutes par défaut", assainirFigure({ type: "cadran", heures: 12 }), { type: "cadran", heures: 12, minutes: 0 });
verifier("cadran : heure 13 refusée", assainirFigure({ type: "cadran", heures: 13, minutes: 0 }), null);
verifier("cadran : minutes 7.5 refusées", assainirFigure({ type: "cadran", heures: 3, minutes: 7.5 }), null);
verifier("cadran sans chiffres gardé", assainirFigure({ type: "cadran", heures: 8, minutes: 45, chiffres: false }).chiffres, false);
verifier("angle sain", assainirFigure({ type: "angle", degres: 40 }), { type: "angle", degres: 40 });
verifier("angle de 180 refusé", assainirFigure({ type: "angle", degres: 180 }), null);
verifier("type inconnu", assainirFigure({ type: "cube", arete: 3 }), null);
verifier("fraction_aire refusée (générateur calculé)", assainirFigure({ type: "fraction_aire", forme: "cercle", parts: 4, coloriees: 1 }), null);
verifier("rien", assainirFigure(null), null);

const poly = assainirFigure({ type: "polygone", grille: { colonnes: 7, lignes: 5 }, polygones: [{ sommets: rect, nom: "ABCD", angles_droits: [0, 1, 9], couleur: "rouge" }] });
verifier("polygone : champs inconnus et indices hors figure retirés", poly, { type: "polygone", grille: { colonnes: 7, lignes: 5 }, polygones: [{ sommets: rect, nom: "ABCD", angles_droits: [0, 1] }] });
verifier("polygone : nom de mauvaise longueur retiré", assainirFigure({ type: "polygone", grille: { colonnes: 7, lignes: 5 }, polygones: [{ sommets: rect, nom: "ABC" }] }).polygones[0].nom, undefined);
verifier("polygone : sommet hors cadre", assainirFigure({ type: "polygone", polygones: [{ sommets: [[0, 0], [15, 0], [0, 3]] }] }), null);
verifier("polygone : coordonnée décimale", assainirFigure({ type: "polygone", polygones: [{ sommets: [[0, 0], [2.5, 0], [0, 3]] }] }), null);
verifier("polygone : sommet répété (essai du 23/10)", assainirFigure({ type: "polygone", grille: { colonnes: 6, lignes: 5 }, polygones: [{ sommets: [[1, 1], [4, 1], [4, 3], [1, 3], [1, 1], [4, 3]] }] }), null);
verifier("polygone : nœud papillon", assainirFigure({ type: "polygone", polygones: [{ sommets: [[0, 0], [3, 3], [3, 0], [0, 3]] }] }), null);
verifier("simple : figure en L", polygoneSimple([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]), true);
verifier("simple : côté qui revient toucher un autre", polygoneSimple([[0, 0], [4, 0], [4, 2], [2, 0.0001 * 0], [0, 2]]), false);
verifier("polygone : points alignés", assainirFigure({ type: "polygone", polygones: [{ sommets: [[0, 0], [2, 0], [4, 0]] }] }), null);
verifier("polygone : deux sommets", assainirFigure({ type: "polygone", polygones: [{ sommets: [[0, 0], [2, 0]] }] }), null);
verifier("polygone vide", assainirFigure({ type: "polygone", grille: { colonnes: 5, lignes: 5 } }), null);
verifier("un polygone abîmé emporte la figure", assainirFigure({ type: "polygone", polygones: [{ sommets: rect }, { sommets: [[0, 0]] }] }), null);
verifier("axe de symétrie au milieu d'un carreau", assainirFigure({ type: "polygone", grille: { colonnes: 9, lignes: 7 }, segments: [{ de: [2.5, 0], a: [2.5, 6], pointille: true }] }).segments[0].de, [2.5, 0]);
verifier("segment au tiers d'un carreau : refusé", assainirFigure({ type: "polygone", segments: [{ de: [1.3, 0], a: [1.3, 6] }] }), null);
verifier("segment de longueur nulle", assainirFigure({ type: "polygone", segments: [{ de: [1, 1], a: [1, 1] }] }), null);
const uni = assainirFigure({ type: "polygone", polygones: [{ sommets: [[0, 0], [7, 0], [7, 4], [0, 4]], longueurs: [[0, "7 cm"], [1, "4 cm"], [2, ""]] }] });
verifier("papier uni : décalé d'un carreau de marge", uni.polygones[0].sommets, [[1, 1], [8, 1], [8, 5], [1, 5]]);
verifier("papier uni : longueurs vides retirées", uni.polygones[0].longueurs, [[0, "7 cm"], [1, "4 cm"]]);
verifier("quadrillage : jamais décalé", assainirFigure({ type: "polygone", grille: { colonnes: 6, lignes: 6 }, points: [{ at: [0, 0], nom: "O" }] }).points[0].at, [0, 0]);

/* ── Le dessin contre la réponse ────────────────────────────────────────── */
const cadran = { type: "cadran", heures: 3, minutes: 25 };
verifier("heure juste", desaccord("Quelle heure indique cette horloge ?", "3 h 25", cadran), null);
verifier("heure de l'après-midi acceptée", desaccord("Quelle heure est-il ?", "15 h 25", cadran), null);
verifier("heure écrite en entier, juste", desaccord("Quelle heure indique cette horloge ?", "3 heures 25", cadran), null);
verifier("heure fausse", desaccord("Quelle heure indique cette horloge ?", "5 h 15", cadran), "heure");
verifier("heure future : non vérifiée", desaccord("Quelle heure sera-t-il dans 20 minutes ?", "3 h 45", cadran), null);
verifier("midi en lettres : non vérifié", desaccord("Quelle heure est-il ?", "midi", { type: "cadran", heures: 12 }), null);
verifier("angle aigu juste", desaccord("Quelle est la nature de cet angle ?", "aigu", { type: "angle", degres: 40 }), null);
verifier("angle droit juste", desaccord("Cet angle est-il droit, aigu ou obtus ?", "Un angle droit", { type: "angle", degres: 90 }), null);
verifier("angle obtus annoncé aigu", desaccord("Quelle est la nature de cet angle ?", "aigu", { type: "angle", degres: 130 }), "angle");
verifier("angle presque droit : ambigu", desaccord("Quelle est la nature de cet angle ?", "obtus", { type: "angle", degres: 95 }), "angle-ambigu");
const quad = { type: "polygone", grille: { colonnes: 7, lignes: 5 }, polygones: [{ sommets: rect }] };
verifier("aire juste en carreaux", desaccord("Quelle est l'aire de cette figure ?", "12 carreaux", quad), null);
verifier("aire fausse", desaccord("Quelle est l'aire de cette figure ?", "14 carreaux", quad), "aire");
verifier("périmètre juste", desaccord("Quel est le périmètre de cette figure ?", "14", quad), null);
verifier("périmètre fausse", desaccord("Quel est le périmètre de cette figure ?", "12", quad), "perimetre");
verifier("aire ET périmètre demandés : non vérifié", desaccord("Compare l'aire et le périmètre.", "12", quad), null);
const ecrit = { type: "polygone", polygones: [{ sommets: [[1, 1], [8, 1], [8, 5], [1, 5]], longueurs: [[0, "7 cm"], [1, "4 cm"]] }] };
verifier("aire tirée des longueurs", desaccord("Calcule l'aire de ce rectangle.", "28 cm²", ecrit), null);
verifier("périmètre tiré des longueurs", desaccord("Calcule le périmètre de ce rectangle.", "22 cm", ecrit), null);
verifier("périmètre faux (longueurs)", desaccord("Calcule le périmètre de ce rectangle.", "11 cm", ecrit), "perimetre");
verifier("unités mélangées : non vérifié", desaccord("Calcule l'aire.", "280", { type: "polygone", polygones: [{ sommets: [[1, 1], [8, 1], [8, 5], [1, 5]], longueurs: [[0, "7 cm"], [1, "40 mm"]] }] }), null);
const L = { type: "polygone", grille: { colonnes: 7, lignes: 6 }, polygones: [{ sommets: [[1, 1], [3, 1], [3, 3], [4, 3], [4, 5], [1, 5]] }] };
verifier("figure en L : le modèle disait 8 (essai du 23/10)", desaccord("Quelle est l'aire de cette figure, en carreaux ?", "8 carreaux", L), "aire");
verifier("mesure du dessin : 10", mesureDuDessin("Quelle est l'aire de cette figure ?", L), 10);
const biais = { type: "polygone", grille: { colonnes: 7, lignes: 6 }, polygones: [{ sommets: [[1, 1], [5, 1], [3, 4]] }] };
verifier("aire : côté de pente 3/2, incomptable", desaccord("Quelle est l'aire de cette figure ?", "6 carreaux", biais), "incomptable");
const demi = { type: "polygone", grille: { colonnes: 7, lignes: 6 }, polygones: [{ sommets: [[1, 1], [4, 1], [1, 4]] }] };
verifier("aire : diagonale exacte, des demi-carreaux", desaccord("Quelle est l'aire de cette figure ?", "4,5 carreaux", demi), null);
verifier("périmètre : diagonale, incomptable", desaccord("Quel est le périmètre de cette figure ?", "9", demi), "incomptable");
verifier("papier uni sans longueurs : rien à mesurer", mesureDuDessin("Quelle est l'aire ?", { type: "polygone", polygones: [{ sommets: rect }] }), null);
verifier("remplacer le nombre", remplacerNombre("8 carreaux", 10), "10 carreaux");
verifier("remplacer un décimal", remplacerNombre("4 carreaux", 4.5), "4,5 carreaux");
verifier("réponse sans nombre", remplacerNombre("dix", 10), "10");
verifier("reconnaissance : non vérifiée", desaccord("Quel est le nom de cette figure ?", "un carré", quad), null);

/* ── Le filtre ──────────────────────────────────────────────────────────── */
const lire = (q) => ({ enonce: q.enonce, reponse: q.reponse_attendue });
const sans = { id: 1, enonce: "Combien de minutes dans une heure ?", reponse_attendue: "60" };
const juste = { id: 2, enonce: "Quelle heure indique cette horloge ?", reponse_attendue: "3 h 25", figure: cadran };
const fausse = { id: 3, enonce: "Quelle heure indique cette horloge ?", reponse_attendue: "4 h", figure: cadran };
const abimee = { id: 4, enonce: "Quelle est l'aire ?", reponse_attendue: "3", figure: { type: "polygone" } };
const nulle = { id: 5, enonce: "Combien de jours en mars ?", reponse_attendue: "31", figure: null };
const r = filtrerFigures([sans, juste, fausse, abimee, nulle], lire);
verifier("filtre : gardées", r.questions.map((q) => q.id), [1, 2, 5]);
verifier("filtre : raisons", r.ecartees.map((e) => e.raison), ["heure", "figure-illisible"]);
verifier("filtre : figure: null retirée", "figure" in r.questions[2], false);
verifier("filtre : figure assainie", r.questions[1].figure, { type: "cadran", heures: 3, minutes: 25 });
const qcm = filtrerFigures(
  [{ question: "Quelle est l'aire de cette figure ?", options: ["10", "12", "14", "7"], reponse_correcte: 1, figure: quad }],
  (q) => ({ enonce: q.question, reponse: q.options[q.reponse_correcte] }),
);
verifier("filtre QCM : bonne option lue", qcm.questions.length, 1);

/* ── Corriger plutôt qu'écarter ─────────────────────────────────────────── */
const malCompte = { id: 7, enonce: "Quelle est l'aire de cette figure, en carreaux ?", reponse_attendue: "8 carreaux", indice: "Compte 8 carreaux", figure: L };
const corrige = (q, v) => ({ ...q, reponse_attendue: remplacerNombre(q.reponse_attendue, v), indice: undefined });
const rc = filtrerFigures([malCompte, fausse], lire, corrige);
verifier("corriger : l'aire est recalculée", rc.questions.map((q) => q.reponse_attendue), ["10 carreaux"]);
verifier("corriger : l'indice faux est retiré", rc.questions[0].indice, undefined);
verifier("corriger : compte", rc.corrigees, 1);
verifier("corriger : une heure fausse reste écartée", rc.ecartees.map((e) => e.raison), ["heure"]);
verifier("sans corriger : écartée", filtrerFigures([malCompte], lire).ecartees.map((e) => e.raison), ["aire"]);
verifier("corriger qui renonce : écartée", filtrerFigures([malCompte], lire, () => null).ecartees.map((e) => e.raison), ["aire"]);

/* ── QCM : une seule option juste au dessin ─────────────────────────────── */
verifier("QCM horloge : une option juste", nbOptionsJustes("Quelle heure indique cette horloge ?", ["3 h 25", "5 h 15", "3 h 05", "5 h 25"], cadran), 1);
verifier("QCM horloge : 3 h 25 et 15 h 25", nbOptionsJustes("Quelle heure indique cette horloge ?", ["3 h 25", "15 h 25", "3 h 05", "5 h 25"], cadran), 2);
verifier("QCM horloge : aucune", nbOptionsJustes("Quelle heure indique cette horloge ?", ["4 h", "5 h 15", "3 h 05", "5 h 25"], cadran), 0);
verifier("QCM horloge : options en lettres, non vérifiable", nbOptionsJustes("Quelle heure est-il ?", ["midi", "3 h 25", "4 h", "5 h"], cadran), null);
verifier("QCM aire : une option", nbOptionsJustes("Quelle est l'aire de cette figure ?", ["10", "12", "14", "7"], quad), 1);
verifier("QCM aire : deux options de même valeur", nbOptionsJustes("Quelle est l'aire de cette figure ?", ["12", "12 carreaux", "14", "7"], quad), 2);
verifier("QCM nom de figure : non vérifiable", nbOptionsJustes("Quel est le nom de cette figure ?", ["carré", "rectangle", "losange", "triangle"], quad), null);

/* ── Droite graduée ─────────────────────────────────────────────────────── */
verifier("droite : le titre de la séance l'active", figuresPossibles("Mathématiques", "Numération", "Repérer un nombre entier sur une demi-droite graduée"), true);
verifier("droite : graduation", figuresPossibles("Mathématiques", "Numération", "Lire une graduation"), true);
verifier("droite : dans la consigne", consigneFigures("exercice").includes('"type": "droite"'), true);

const dr = { type: "droite", origine: 0, pas: 10, intervalles: 10, etiquettes: "bornes", points: [{ valeur: 70, nom: "A" }] };
verifier("droite saine", assainirDroite(dr), { origine: 0, pas: 10, intervalles: 10, etiquettes: "bornes", points: [{ valeur: 70, nom: "A" }] });
verifier("droite : champ inconnu retiré", assainirDroite({ ...dr, couleur: "rouge", zones: [{ de: 0, a: 10 }] }), assainirDroite(dr));
verifier("droite : point entre deux traits → petits traits ajoutés", assainirDroite({ ...dr, points: [{ valeur: 75, nom: "A" }] })?.divisions, 2);
verifier("droite : 140 de 100 en 100 → traits de 20", assainirDroite({ type: "droite", origine: 100, pas: 100, intervalles: 5, etiquettes: ["100", "200"], points: [{ valeur: 140, nom: "F" }] })?.divisions, 5);
verifier("droite : 75 sur des traits de 10 → 10 traits par intervalle", assainirDroite({ type: "droite", origine: 50, pas: 50, intervalles: 3, divisions: 5, etiquettes: [50, 100], points: [{ valeur: 75, nom: "D" }] })?.divisions, 10);
verifier("droite : réparation interdite si l'énoncé parle des intervalles", assainirDroite({ ...dr, points: [{ valeur: 75, nom: "A" }] }, "Chaque intervalle est découpé en 5 parties. Quel nombre repère A ?"), null);
verifier("droite : étiquette au-delà → droite allongée", assainirDroite({ type: "droite", origine: 100, pas: 100, intervalles: 5, divisions: 2, etiquettes: [100, 300, 500, 700], points: [{ valeur: 350, nom: "E" }] })?.intervalles, 6);
verifier("droite : 3,7 de 1 en 1 → irréparable sans 10e", assainirDroite({ type: "droite", origine: 0, pas: 1, intervalles: 10, etiquettes: "bornes", points: [{ valeur: 3.33, nom: "A" }] }), null);
verifier("droite : étiquettes en texte", assainirDroite({ ...dr, etiquettes: ["0", "100"] })?.etiquettes, [0, 100]);
verifier("droite : point sur un petit repère", assainirDroite({ ...dr, divisions: 2, points: [{ valeur: 75, nom: "A" }] })?.points, [{ valeur: 75, nom: "A" }]);
verifier("droite : point au-delà → allongée", assainirDroite({ ...dr, etiquettes: [0, 50], points: [{ valeur: 110, nom: "A" }] })?.intervalles, 11);
verifier("droite : allongée jusqu'au point, borne écrite = réponse", assainirDroite({ ...dr, points: [{ valeur: 110, nom: "A" }] }), null);
verifier("droite : point avant l'origine", assainirDroite({ ...dr, origine: 20, etiquettes: [20, 100], points: [{ valeur: 10, nom: "A" }] }), null);
verifier("droite : origine négative", assainirDroite({ ...dr, origine: -10 }), null);
verifier("droite : pas nul", assainirDroite({ ...dr, pas: 0 }), null);
verifier("droite : 1 intervalle sans petits traits", assainirDroite({ ...dr, intervalles: 1 }), null);
verifier("droite : 1 intervalle de 0 à 100 en 10 → 10 intervalles de 10", assainirDroite({ type: "droite", origine: 0, pas: 100, intervalles: 1, divisions: 10, etiquettes: ["0", "100"], points: [{ valeur: 40, nom: "A" }] }), { origine: 0, pas: 10, intervalles: 10, etiquettes: [0, 100], points: [{ valeur: 40, nom: "A" }] });
verifier("droite : 1 intervalle, étiquettes par défaut → bornes", assainirDroite({ type: "droite", origine: 0, pas: 80, intervalles: 1, divisions: 4, points: [{ valeur: 60, nom: "D" }] })?.etiquettes, "bornes");
verifier("droite : trop de petits traits", assainirDroite({ ...dr, intervalles: 20, divisions: 5 }), null);
verifier("droite : rien d'écrit", assainirDroite({ ...dr, etiquettes: "aucune" }), null);
verifier("droite : une seule valeur écrite", assainirDroite({ ...dr, etiquettes: [0] }), null);
verifier("droite : le point est écrit = réponse donnée", assainirDroite({ ...dr, etiquettes: "toutes" }), null);
verifier("droite : liste hors repère irréparable", assainirDroite({ ...dr, etiquettes: [0, 33] }), null);
verifier("droite : deux points même nom", assainirDroite({ ...dr, points: [{ valeur: 30, nom: "A" }, { valeur: 70, nom: "A" }] }), null);
verifier("droite : pas décimal", assainirDroite({ type: "droite", origine: 2, pas: 0.1, intervalles: 10, etiquettes: "bornes", points: [{ valeur: 2.3, nom: "B" }] })?.points, [{ valeur: 2.3, nom: "B" }]);
verifier("droite : 13 étiquettes → bornes, comme le dessin", valeursEcrites({ origine: 0, pas: 1, intervalles: 12 }), [0, 12]);

const D = assainirDroite(dr);
const D2 = assainirDroite({ ...dr, points: [{ valeur: 30, nom: "A" }, { valeur: 70, nom: "B" }] });
verifier("lecture : seul point", pointDemande("Quel nombre est repéré par la flèche ?", D)?.valeur, 70);
verifier("lecture : point nommé parmi deux", pointDemande("Quel nombre est repéré par le point B ?", D2)?.valeur, 70);
verifier("lecture : deux points, aucun nommé", pointDemande("Quel nombre est repéré ?", D2), null);
verifier("lecture : calcul à partir du point", pointDemande("Quel nombre est 2 graduations après le point A ?", D), null);
verifier("lecture : quelle est la valeur", pointDemande("Quelle est la valeur du point A ?", D)?.valeur, 70);
verifier("lecture : question de lettre", pointDemande("Quelle lettre est placée sur 70 ?", D), null);

const lireD = (q) => ({ enonce: q.enonce, reponse: q.reponse_attendue });
const qd = (rep, figure = dr) => ({ id: 1, enonce: "Quel nombre est repéré par le point A ?", reponse_attendue: rep, figure });
const fd = filtrerFigures([qd("70")], lireD);
verifier("filtre droite : rangée dans « droite »", [("figure" in fd.questions[0]), fd.questions[0].droite?.points], [false, [{ valeur: 70, nom: "A" }]]);
verifier("filtre droite : réponse fausse corrigée", filtrerFigures([qd("60")], lireD, corrige).questions.map((q) => q.reponse_attendue), ["70"]);
verifier("filtre droite : réponse fausse sans corriger", filtrerFigures([qd("60")], lireD).ecartees.map((e) => e.raison), ["droite"]);
verifier("filtre droite : « 6 dizaines » non réécrite, écartée", filtrerFigures([qd("6 dizaines")], lireD, corrige).ecartees.map((e) => e.raison), ["droite"]);
verifier("filtre droite : abîmée", filtrerFigures([qd("70", { ...dr, pas: -1 })], lireD).ecartees.map((e) => e.raison), ["figure-illisible"]);
verifier("filtre droite : 1 200 lu", filtrerFigures([qd("1 200", { type: "droite", origine: 1000, pas: 100, intervalles: 5, etiquettes: "bornes", points: [{ valeur: 1200, nom: "A" }] })], lireD).questions.length, 1);

verifier("QCM droite : une option", nbOptionsJustesDroite("Quel nombre est repéré par le point A ?", ["60", "70", "80", "7"], D), 1);
verifier("QCM droite : aucune", nbOptionsJustesDroite("Quel nombre est repéré par le point A ?", ["60", "75", "80", "7"], D), 0);
verifier("QCM droite : options en mots, non vérifiable", nbOptionsJustesDroite("Quel nombre est repéré par le point A ?", ["70", "7 dizaines", "80", "60"], D), null);

console.log(echecs ? `\n${echecs} échec(s) sur ${total}` : `✓ ${total} cas`);
process.exit(echecs ? 1 : 0);

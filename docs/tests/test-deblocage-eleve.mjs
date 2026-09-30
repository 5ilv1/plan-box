#!/usr/bin/env npx tsx
/**
 * Contrat du déblocage progressif du tableau de bord élève.
 *
 *  • réglage désactivé ⇒ toujours l'étape 3 (le comportement d'avant) ;
 *  • étape 1 tant que la barre du jour n'est pas pleine ;
 *  • un atelier d'écriture de la semaine bloque tant que l'élève n'y a pas
 *    travaillé AUJOURD'HUI — pas besoin de l'avoir fini ;
 *  • étape 2 tant qu'il reste des retards des 7 derniers jours ; les plus
 *    anciens ne bloquent pas (un élève à 24 retards verrait sinon jamais rien).
 *
 * Lancer après toute modification de lib/deblocage-eleve.ts :
 *   npx tsx docs/tests/test-deblocage-eleve.mjs
 */
import { etapeDeblocage, atelierTravailleAujourdhui, reculerJours, dateEcheance } from "../../lib/deblocage-eleve.ts";

let ok = 0, ko = 0;
const verifier = (cond, nom) => { if (cond) ok++; else { ko++; console.log("✗", nom); } };

const J = "2026-09-30";
const base = { actif: true, faitsJour: 3, totalJour: 3, blocsAujourdhui: [], retards: [], aujourdhui: J, aujourdhuiUtc: J };
const retard = (date, statut = "a_faire") => ({ type: "exercice", statut, date_assignation: date });
const atelier = (historique, extra = {}) => ({ type: "ecriture", statut: "a_faire", date_assignation: "2026-09-28", contenu: { mode: "semaine", historique, ...extra } });

// Réglage
verifier(etapeDeblocage({ ...base, actif: false, faitsJour: 0 }).etape === 3, "désactivé ⇒ étape 3 même sans rien fait");
verifier(etapeDeblocage({ ...base, actif: false, retards: [retard("2026-09-29")] }).etape === 3, "désactivé ⇒ étape 3 malgré les retards");

// Étape 1
verifier(etapeDeblocage({ ...base, faitsJour: 2 }).etape === 1, "barre non pleine ⇒ étape 1");
verifier(etapeDeblocage({ ...base, faitsJour: 2 }).resteJour === 1, "reste 1 tâche du jour");
verifier(etapeDeblocage({ ...base, faitsJour: 0, totalJour: 0 }).etape === 3, "aucune tâche du jour, aucun retard ⇒ étape 3");

// Atelier de la semaine
verifier(etapeDeblocage({ ...base, blocsAujourdhui: [atelier([])] }).etape === 1, "atelier jamais travaillé ⇒ étape 1");
verifier(etapeDeblocage({ ...base, blocsAujourdhui: [atelier([{ date: "2026-09-29", texte: "hier" }])] }).etape === 1, "travaillé hier seulement ⇒ étape 1");
verifier(etapeDeblocage({ ...base, blocsAujourdhui: [atelier([{ date: J, texte: "Il était une fois" }])] }).etape === 3, "travaillé aujourd'hui ⇒ débloqué");
verifier(etapeDeblocage({ ...base, blocsAujourdhui: [atelier([{ date: J, texte: "   " }])] }).etape === 1, "texte vide aujourd'hui ne compte pas");
verifier(etapeDeblocage({ ...base, blocsAujourdhui: [atelier([], { date_envoi: "2026-09-26" })] }).etape === 3, "atelier déjà envoyé ⇒ ne bloque plus");
verifier(atelierTravailleAujourdhui({ ...atelier([]), statut: "fait" }, J), "atelier fait ⇒ travaillé");
verifier(etapeDeblocage({ ...base, blocsAujourdhui: [{ type: "ecriture", statut: "a_faire", date_assignation: J, contenu: { mode: "jour" } }] }).etape === 3,
  "écriture du JOUR : c'est la barre qui la compte, pas la règle de l'atelier");

// Étape 2
verifier(etapeDeblocage({ ...base, retards: [retard("2026-09-29")] }).etape === 2, "retard d'hier ⇒ étape 2");
verifier(etapeDeblocage({ ...base, retards: [retard("2026-09-23")] }).etape === 2, "retard d'il y a 7 jours ⇒ bloque encore");
verifier(etapeDeblocage({ ...base, retards: [retard("2026-09-22")] }).etape === 3, "retard d'il y a 8 jours ⇒ ne bloque plus");
verifier(etapeDeblocage({ ...base, retards: [retard("2026-09-29", "fait")] }).etape === 3, "retard fait ⇒ ne compte pas");
verifier(etapeDeblocage({ ...base, faitsJour: 1, retards: [retard("2026-09-29")] }).etape === 1, "jour non fini ⇒ étape 1 même avec retards");
verifier(etapeDeblocage({ ...base, retards: Array.from({ length: 24 }, (_, i) => retard(reculerJours(J, 8 + i))) }).etape === 3,
  "24 vieux retards ⇒ étape 3 (visibles, pas bloquants)");
verifier(etapeDeblocage({ ...base, retards: [retard("2026-09-29"), retard("2026-09-25"), retard("2026-09-01")] }).resteRetards === 2,
  "compte seulement les retards récents");

// Travaux « de la semaine » (datés de leur lundi, dus le vendredi)
const hebdo = (lundi) => ({ type: "analyse_phrase", statut: "a_faire", date_assignation: lundi, periodicite: "semaine" });
verifier(dateEcheance(hebdo("2026-09-21")) === "2026-09-25", "échéance d'un travail de la semaine = son vendredi");
verifier(etapeDeblocage({ ...base, retards: [hebdo("2026-09-21")] }).etape === 2,
  "analyse de la semaine dernière, non faite, un mercredi ⇒ bloque (vendredi 25 = il y a 5 jours)");
verifier(etapeDeblocage({ ...base, aujourdhui: "2026-10-05", aujourdhuiUtc: "2026-10-05", retards: [hebdo("2026-09-21")] }).etape === 3,
  "celle d'il y a deux semaines ⇒ ne bloque plus (vendredi 25 = il y a 10 jours)");

// Dates
verifier(reculerJours("2026-10-02", 7) === "2026-09-25", "reculer 7 jours");
verifier(reculerJours("2026-03-31", 1) === "2026-03-30", "changement d'heure sans décalage");
verifier(reculerJours("2026-01-03", 7) === "2025-12-27", "changement d'année");

console.log(`${ok} / ${ok + ko} cas${ko ? ` — ${ko} ÉCHEC(S)` : " ✓"}`);
if (ko) process.exit(1);

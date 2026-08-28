#!/usr/bin/env node
/**
 * Longueur des 63 évaluations de ceinture.
 *   node docs/ceintures/test-longueur-evaluations.mjs
 *
 * Aucune évaluation ne doit dépasser 20 questions : au-delà, elle devient trop
 * longue pour un CM1, et le seuil de 90 % la rend d'autant plus fragile.
 *
 * Les plafonds sont LUS dans la page évaluation, comme test-piocher.mjs lit sa
 * stratégie : ce fichier mesure ce qui est déployé, pas ce qu'on croit avoir
 * déployé. Changer une constante dans page.tsx change ce que ce test mesure.
 *
 * Sort un code d'erreur si une évaluation dépasse le plafond.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const BANQUE = join(ICI, "banque");
const PAGE = join(ICI, "..", "..", "app", "eleve", "chapitre", "[id]", "evaluation", "page.tsx");

const MAX_QUESTIONS = 20;

/** Lit une constante numérique dans la page évaluation. */
function constanteDeployee(nom) {
  const src = readFileSync(PAGE, "utf8");
  const m = src.match(new RegExp(`const\\s+${nom}\\s*=\\s*(\\d+)`));
  if (!m) {
    console.error(`Constante ${nom} introuvable dans la page évaluation.`);
    process.exit(2);
  }
  return Number(m[1]);
}

const MAX_CLASSEMENT = constanteDeployee("MAX_CLASSEMENT");
const MAX_GROUPES_ANALYSE = constanteDeployee("MAX_GROUPES_ANALYSE");

/**
 * Ce que `creerMiniExercices()` produit comme nombre de questions, type par
 * type. `lecture` et `ecriture_contrainte` n'y entrent pas : ils ne sont pas
 * corrigeables automatiquement.
 */
function questionsDe(type, contenu) {
  switch (type) {
    // Tous les trous sont conservés — voir CORRECTIF-piocher.md.
    case "texte_a_trous":
      return (contenu.trous ?? []).length;
    case "classement":
      return Math.min(MAX_CLASSEMENT, (contenu.items ?? []).length);
    case "qcm":
      return Math.min(4, (contenu.questions ?? []).length);
    case "exercice":
      return Math.min(3, (contenu.questions ?? []).length);
    case "calcul_mental":
      return Math.min(4, (contenu.calculs ?? []).length);
    case "probleme_maths":
      return Math.min(2, (contenu.problemes ?? []).length);
    case "analyse_phrase": {
      // Phrases entières, dans l'ordre, tant que les groupes tiennent sous le
      // plafond — et au moins une.
      const phrases = contenu.phrases ?? [];
      let total = 0;
      let prises = 0;
      for (const p of phrases) {
        const cout = (p.groupes ?? []).length;
        if (prises > 0 && total + cout > MAX_GROUPES_ANALYSE) break;
        total += cout;
        prises++;
      }
      return total;
    }
    default:
      return 0;
  }
}

const PREFIXE = { "": "PHRA", "mots-": "MOTS", "textes-": "TEXT",
  "nombres-": "NOMB", "calcul-": "CALC", "grandeurs-": "GRME", "geometrie-": "ESGE" };

const NOMS = { PHRA: "Phrases", MOTS: "Mots", TEXT: "Textes", NOMB: "Nombres",
  CALC: "Calcul", GRME: "Grandeurs", ESGE: "Géométrie" };

const COULEURS = ["vert clair", "vert foncé", "bleu clair", "bleu foncé", "marron clair",
  "marron foncé", "violet clair", "violet foncé", "noire"];

// ── Mesure ──────────────────────────────────────────────────────────────────

const evaluations = new Map();

for (const fichier of readdirSync(BANQUE).filter((f) => f.endsWith(".json"))) {
  const m = fichier.match(/^(mots-|textes-|nombres-|calcul-|grandeurs-|geometrie-)?ceinture-(\d)-/);
  if (!m) continue;
  const domaine = PREFIXE[m[1] ?? ""];
  const idx = Number(m[2]);
  const cle = `${domaine} ${idx}`;

  for (const item of JSON.parse(readFileSync(join(BANQUE, fichier), "utf8"))) {
    // La variante 1 est celle installée dans la ligne `exercice`.
    const n = questionsDe(item.type, item.entrainement[0] ?? {});
    const e = evaluations.get(cle) ?? { domaine, idx, total: 0, detail: [] };
    e.total += n;
    if (n > 0) e.detail.push(`${item.item_code} ${item.type} ${n}`);
    else e.detail.push(`${item.item_code} ${item.type} — non évaluable`);
    evaluations.set(cle, e);
  }
}

const lignes = [...evaluations.values()].sort((a, b) => b.total - a.total);
const totaux = lignes.map((l) => l.total).sort((a, b) => a - b);
const mediane = totaux[Math.floor(totaux.length / 2)];

console.log(`Longueur des évaluations de ceinture`);
console.log(`Plafonds déployés : classement ${MAX_CLASSEMENT} items, analyse ${MAX_GROUPES_ANALYSE} groupes\n`);

const trop = lignes.filter((l) => l.total > MAX_QUESTIONS);
const courtes = lignes.filter((l) => l.total < 5);

console.log(`  ${lignes.length} évaluations — médiane ${mediane}, maximum ${lignes[0].total}, minimum ${totaux[0]}\n`);

console.log("  Les cinq plus longues :");
for (const l of lignes.slice(0, 5)) {
  console.log(`    ${String(l.total).padStart(2)}  ${NOMS[l.domaine]} · ${COULEURS[l.idx]}`);
}

if (courtes.length) {
  console.log("\n  Les évaluations très courtes (moins de 5 questions) :");
  for (const l of courtes) {
    console.log(`    ${String(l.total).padStart(2)}  ${NOMS[l.domaine]} · ${COULEURS[l.idx]}`);
    for (const d of l.detail) console.log(`         ${d}`);
  }
}

if (trop.length) {
  console.log(`\n  ✗ ${trop.length} évaluation(s) au-dessus de ${MAX_QUESTIONS} questions :`);
  for (const l of trop) {
    console.log(`    ${l.total}  ${NOMS[l.domaine]} · ${COULEURS[l.idx]}`);
    for (const d of l.detail) console.log(`         ${d}`);
  }
  process.exit(1);
}

console.log(`\n  ✓ aucune évaluation au-dessus de ${MAX_QUESTIONS} questions.`);

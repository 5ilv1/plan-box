#!/usr/bin/env node
/**
 * Test de non-régression : l'échantillonnage de l'évaluation ne doit pas
 * déplacer les trous d'un texte à trous.
 *
 *   node docs/ceintures/test-piocher.mjs
 *
 * L'évaluation prélève 4 trous sur 5 (app/eleve/chapitre/[id]/evaluation/page.tsx,
 * appel à piocher() ligne 67), puis la page exercice les pose « au premier
 * emplacement libre », ponctuation ET accents ignorés. Si l'échantillon n'est
 * plus dans l'ordre du texte, un trou sur « à » se pose sur un « a » antérieur.
 *
 * Ce script lit la stratégie réellement employée par la page évaluation, la
 * rejoue sur toute la banque, et échoue si elle déplace un trou. Les deux
 * autres stratégies restent affichées à titre de comparaison.
 *
 * Sort en code 1 si au moins un exercice est affecté.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const BANQUE = join(ICI, "banque");
const PAGE = join(ICI, "..", "..", "app", "eleve", "chapitre", "[id]", "evaluation", "page.tsx");
const TIRAGES = 2000;

/** Copie de melanger() de la page évaluation. */
function melanger(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Comportement ACTUEL : mélange puis coupe. */
const piocher = (arr, n) => melanger(arr).slice(0, n);

/** Tire au hasard en conservant l'ordre d'origine — insuffisant, voir plus bas. */
function piocherOrdonne(arr, n) {
  const gardes = new Set(melanger(arr.map((_, i) => i)).slice(0, n));
  return arr.filter((_, i) => gardes.has(i));
}

/** Ne prélève pas : garde tous les trous. */
const toutGarder = (arr) => arr;

/** Nettoyage de la page exercice : ponctuation et accents retirés. */
const nettoyer = (s) =>
  String(s).replace(/[.,;:!?"'()«»]/g, "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const sansPonctuation = (s) => String(s).replace(/[.,;:!?"'()«»]/g, "");

/** Copie de la boucle de placement de la page exercice. */
function poser(texte, trous) {
  const mots = texte.split(/\s+/);
  const pris = new Set();
  return trous.map((t) => {
    const cible = nettoyer(t.mot);
    for (let i = 0; i < mots.length; i++) {
      if (pris.has(i)) continue;
      if (nettoyer(mots[i]) === cible) { pris.add(i); return mots[i]; }
    }
    return null;
  });
}

function tauxDeCasse(exo, echantillonner) {
  let casse = 0;
  const n = Math.min(4, exo.trous.length);
  for (let k = 0; k < TIRAGES; k++) {
    const sous = echantillonner(exo.trous, n);
    const poses = poser(exo.texte_complet, sous);
    for (let i = 0; i < sous.length; i++) {
      if (poses[i] === null || sansPonctuation(poses[i]) !== sansPonctuation(sous[i].mot)) {
        casse++; break;
      }
    }
  }
  return (100 * casse) / TIRAGES;
}

/**
 * Lit `const trousChoisis = ...` dans la page évaluation pour savoir quelle
 * stratégie est réellement déployée. C'est elle, et elle seule, qui décide de
 * l'échec du test.
 */
function strategieDeployee() {
  let src;
  try {
    src = readFileSync(PAGE, "utf8");
  } catch {
    console.error(`Page évaluation introuvable : ${PAGE}`);
    process.exit(2);
  }
  const m = src.match(/const\s+trousChoisis\s*=\s*([^;]+);/);
  if (!m) {
    console.error("Affectation de `trousChoisis` introuvable dans la page évaluation.");
    process.exit(2);
  }
  const expr = m[1].trim();
  if (/^piocherOrdonne\s*\(/.test(expr)) return "ordonne";
  if (/^piocher\s*\(/.test(expr)) return "actuel";
  if (/^trous$/.test(expr)) return "complet";
  console.error(`Stratégie de tirage des trous non reconnue : ${expr}`);
  process.exit(2);
}

const LIBELLES = {
  actuel: "mélange + coupe",
  ordonne: "tirage ordonné",
  complet: "tous les trous conservés",
};

let fichiers;
try {
  fichiers = readdirSync(BANQUE).filter((f) => f.endsWith(".json"));
} catch {
  console.error(`Dossier introuvable : ${BANQUE}`);
  process.exit(2);
}

const deployee = strategieDeployee();

let affectes = 0;
console.log(`Échantillonnage de l'évaluation — ${TIRAGES} tirages par exercice`);
console.log(`Stratégie déployée : ${LIBELLES[deployee]}\n`);

for (const f of fichiers.sort()) {
  const data = JSON.parse(readFileSync(join(BANQUE, f), "utf8"));
  for (const item of data) {
    if (item.type !== "texte_a_trous") continue;
    const variantes = Array.isArray(item.entrainement) ? item.entrainement : [item.entrainement];
    variantes.forEach((e, vi) => {
      const taux = {
        actuel: tauxDeCasse(e, piocher),
        ordonne: tauxDeCasse(e, piocherOrdonne),
        complet: tauxDeCasse(e, toutGarder),
      };
      if (taux[deployee] > 0) {
        affectes++;
        console.log(`  ✗ ${item.item_code} v${vi + 1}`);
        console.log(`      mélange + coupe            : ${taux.actuel.toFixed(1)} % cassées`);
        console.log(`      tirage ordonné             : ${taux.ordonne.toFixed(1)} % cassées`);
        console.log(`      tous les trous conservés   : ${taux.complet.toFixed(1)} % cassées`);
      }
    });
  }
}

if (affectes === 0) {
  console.log("  0 exercice affecté.");
  process.exit(0);
}
console.log(`\n${affectes} exercice(s) affecté(s).`);
console.log("Correctif : ne pas prélever dans les trous — `const trousChoisis = trous;`");
console.log("dans app/eleve/chapitre/[id]/evaluation/page.tsx.");
console.log("Voir docs/ceintures/CORRECTIF-piocher.md.");
process.exit(1);

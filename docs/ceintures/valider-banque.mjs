#!/usr/bin/env node
/**
 * Valide un fichier de banque d'exercices « ceintures » avant import.
 *
 *   node docs/ceintures/valider-banque.mjs docs/ceintures/banque/*.json
 *
 * Le contrôle central est celui des textes à trous : il rejoue EXACTEMENT
 * l'algorithme de app/eleve/chapitre/[id]/exercice/[exerciceId]/page.tsx, qui
 * ignore les positions stockées et recherche chaque mot dans le texte en
 * supprimant la ponctuation ET LES ACCENTS. Un trou sur « à » peut donc se
 * caler sur un « a » qui le précède — c'est le piège nº 1 de ce module.
 *
 * Sort en code 1 si au moins une erreur est trouvée.
 */

import { readFileSync } from "node:fs";

const FONCTIONS = new Set([
  "Sujet", "Verbe", "COD", "COI",
  "CC Lieu", "CC Temps", "CC Manière", "Attribut",
]);

// Mots dont le masquage détourne le widget en menu à deux choix : interdits
// hors des items qui portent explicitement sur ces homophones.
// Liste EXACTE de components/TexteATrousEleve.tsx (genererOptionsHomophone) :
// ces/ses, la/là, du/dû, sur/sûr n'y sont pas.
const HOMOPHONES = new Set(["a","à","et","est","on","ont","son","sont","ce","se","ou","où"]);
const ITEMS_HOMOPHONES = new Set(["P47","P48","P49"]);

const TYPES = new Set([
  "exercice", "qcm", "texte_a_trous", "classement",
  "analyse_phrase", "calcul_mental", "ecriture_contrainte", "lecture", "mots",
]);

/** Nettoyage identique à celui de la page exercice (accents supprimés). */
const nettoyer = (s) =>
  s.replace(/[.,;:!?"'()«»]/g, "")
   .toLowerCase()
   .normalize("NFD")
   .replace(/[̀-ͯ]/g, "");

let erreurs = 0;
let avertissements = 0;

const err = (ctx, msg) => { console.error(`  ✗ ${ctx} — ${msg}`); erreurs++; };
const warn = (ctx, msg) => { console.warn(`  ⚠ ${ctx} — ${msg}`); avertissements++; };

function validerDiagnostic(code, diag) {
  if (!Array.isArray(diag) || diag.length !== 2) {
    return err(code, `diagnostic : 2 questions attendues, ${diag?.length ?? 0} trouvée(s)`);
  }
  diag.forEach((q, i) => {
    const ctx = `${code} diag#${i + 1}`;
    if (!q.question?.trim()) err(ctx, "question vide");
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return err(ctx, `4 options attendues, ${q.options?.length ?? 0} trouvée(s)`);
    }
    // Comparaison brute : le QCM est corrigé par index, deux options qui ne
    // diffèrent que par la ponctuation sont légitimes (types de phrases).
    if (new Set(q.options.map((o) => String(o).trim())).size !== 4) {
      err(ctx, "deux options rigoureusement identiques");
    }
    if (!Number.isInteger(q.reponse_correcte) || q.reponse_correcte < 0 || q.reponse_correcte > 3) {
      err(ctx, `reponse_correcte hors bornes : ${q.reponse_correcte}`);
    }
    if (!q.explication?.trim()) warn(ctx, "pas d'explication");
  });
}

function validerTexteATrous(code, e, itemCode) {
  if (!e.texte_complet?.trim()) return err(code, "texte_complet vide");
  const trous = e.trous ?? [];
  if (!trous.length) return err(code, "aucun trou");
  if (trous.length > 6) warn(code, `${trous.length} trous — validation en tout ou rien, viser 5`);

  const mots = e.texte_complet.split(/\s+/);
  const pris = new Set();
  const positions = [];

  for (const t of trous) {
    const cible = nettoyer(String(t.mot));
    let trouve = -1;
    for (let i = 0; i < mots.length; i++) {
      if (pris.has(i)) continue;
      if (nettoyer(mots[i]) === cible) { trouve = i; break; }
    }
    if (trouve === -1) {
      err(code, `le mot « ${t.mot} » est introuvable dans texte_complet`);
      continue;
    }
    pris.add(trouve);
    positions.push({ mot: t.mot, position: trouve, reel: mots[trouve] });
    if (nettoyer(mots[trouve]) === cible && mots[trouve].replace(/[.,;:!?"'()«»]/g, "") !== String(t.mot).replace(/[.,;:!?"'()«»]/g, "")) {
      err(code, `« ${t.mot} » s'est calé sur « ${mots[trouve]} » (position ${trouve}) : sosie sans accent. Masquer toutes les occurrences ambiguës, dans l'ordre.`);
    }
    if (!t.indice?.trim()) warn(code, `« ${t.mot} » sans indice`);

    // Un trou en début de phrase porte une majuscule que la comparaison
    // ignore : la compétence visée n'est pas évaluable.
    if (trouve === 0 || (trouve > 0 && /[.!?…]$/.test(mots[trouve - 1]))) {
      err(code, `« ${t.mot} » est en début de phrase : la majuscule n'est pas vérifiable et le mot n'est pas contraint par ce qui précède`);
    }
    // Masquer un homophone hors item dédié transforme le champ en menu
    // à deux choix et déplace la compétence évaluée.
    const nu = String(t.mot).replace(/[.,;:!?"'()«»]/g, "").toLowerCase();
    if (HOMOPHONES.has(nu) && !ITEMS_HOMOPHONES.has(itemCode)) {
      err(code, `« ${t.mot} » est un homophone : le champ deviendra un menu à deux choix et testera l'homophone, pas l'item`);
    }
    // genererOptionsVerbe : tout mot masqué finissant par « é » et faisant au
    // moins 4 lettres devient un menu déroulant « chanter / chanté ».
    else if (/é$/i.test(nu) && nu.length >= 4) {
      err(code, `« ${t.mot} » finit par -é : le champ deviendra un menu à deux choix -er/-é. Masquer une forme accordée (-ée, -és, -ées) ou passer l'item en « exercice »`);
    }
    // genererOptionsPluriel : -oux, -aux, -als deviennent aussi un menu.
    else if (/(oux|aux|als)$/i.test(nu) && nu.length >= 4) {
      err(code, `« ${t.mot} » finit par -${nu.slice(-3)} : le champ deviendra un menu à deux choix sur le pluriel. Utiliser « exercice » pour une vraie production`);
    }
  }

  const ordonne = positions.every((p, i) => i === 0 || p.position > positions[i - 1].position);
  if (!ordonne) {
    err(code, "les trous ne sont pas dans l'ordre d'apparition dans le texte : " +
      positions.map((p) => `${p.mot}@${p.position}`).join(", "));
  }
}

function validerClassement(code, e) {
  const cats = e.categories ?? [];
  const items = e.items ?? [];
  if (cats.length < 2) err(code, "au moins 2 catégories attendues");
  if (items.length < 6) warn(code, `${items.length} items seulement`);
  const set = new Set(cats);
  for (const it of items) {
    if (!set.has(it.categorie)) {
      err(code, `« ${it.texte} » : catégorie « ${it.categorie} » absente de categories`);
    }
  }
  const compte = new Map(cats.map((c) => [c, 0]));
  for (const it of items) compte.set(it.categorie, (compte.get(it.categorie) ?? 0) + 1);
  for (const [c, n] of compte) if (n === 0) warn(code, `catégorie « ${c} » vide`);
}

function validerExercice(code, e) {
  const qs = e.questions ?? [];
  if (!qs.length) return err(code, "aucune question");
  qs.forEach((q, i) => {
    const ctx = `${code} q#${i + 1}`;
    if (!q.enonce?.trim()) err(ctx, "énoncé vide");
    const rep = String(q.reponse_attendue ?? "").trim();
    if (!rep) return err(ctx, "reponse_attendue vide");
    // La comparaison élève se fait sur une normalisation qui GARDE les accents.
    if (rep.split(/\s+/).length > 3) {
      warn(ctx, `réponse longue (« ${rep} ») — comparaison stricte, viser 1 à 2 mots`);
    }
  });
}

function validerQcm(code, e) {
  const qs = e.questions ?? [];
  if (!qs.length) return err(code, "aucune question");
  qs.forEach((q, i) => {
    const ctx = `${code} qcm#${i + 1}`;
    if (!Array.isArray(q.options) || q.options.length < 2) err(ctx, "options insuffisantes");
    if (!Number.isInteger(q.reponse_correcte) ||
        q.reponse_correcte < 0 || q.reponse_correcte >= (q.options?.length ?? 0)) {
      err(ctx, `reponse_correcte hors bornes : ${q.reponse_correcte}`);
    }
  });
}

function validerAnalysePhrase(code, e) {
  const phrases = e.phrases ?? [];
  if (!phrases.length) return err(code, "aucune phrase");
  for (const p of phrases) {
    const mots = String(p.texte ?? "").split(/\s+/);
    for (const g of p.groupes ?? []) {
      const ctx = `${code} « ${g.mots} »`;
      if (!FONCTIONS.has(g.fonction)) {
        err(ctx, `fonction inconnue « ${g.fonction} » — voir FONCTIONS_COULEURS dans types/index.ts`);
      }
      if (!String(p.texte).includes(g.mots)) {
        err(ctx, "le groupe n'apparaît pas tel quel dans la phrase");
      }
      if (g.debut != null && (g.debut < 0 || g.fin >= mots.length || g.debut > g.fin)) {
        err(ctx, `indices debut/fin incohérents (${g.debut}–${g.fin} pour ${mots.length} mots)`);
      }
    }
  }
}

const fichiers = process.argv.slice(2);
if (!fichiers.length) {
  console.error("usage : node valider-banque.mjs <fichier.json> [...]");
  process.exit(2);
}

for (const f of fichiers) {
  console.log(`\n▸ ${f}`);
  let data;
  try {
    data = JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    err(f, `JSON illisible : ${e.message}`);
    continue;
  }
  if (!Array.isArray(data)) { err(f, "un tableau d'items est attendu"); continue; }

  const vus = new Set();
  for (const item of data) {
    const code = item.item_code ?? "?";
    if (vus.has(code)) err(code, "code en double dans le fichier");
    vus.add(code);
    if (!TYPES.has(item.type)) err(code, `type inconnu « ${item.type} »`);

    validerDiagnostic(code, item.diagnostic);

    const variantes = item.entrainement;
    if (!Array.isArray(variantes)) {
      err(code, "entrainement doit être un TABLEAU de variantes (au moins une)");
      continue;
    }
    if (!variantes.length) { err(code, "aucune variante d'entraînement"); continue; }
    if (variantes.length < 2) {
      warn(code, "une seule variante — la remédiation resservira le même exercice");
    }
    const signatures = new Set();
    variantes.forEach((e, vi) => {
      const ctx = variantes.length > 1 ? `${code} v${vi + 1}` : code;
      switch (item.type) {
        case "texte_a_trous":  validerTexteATrous(ctx, e, code); break;
        case "classement":     validerClassement(ctx, e); break;
        case "exercice":       validerExercice(ctx, e); break;
        case "qcm":            validerQcm(ctx, e); break;
        case "analyse_phrase": validerAnalysePhrase(ctx, e); break;
        default:               warn(ctx, `type « ${item.type} » non contrôlé par ce validateur`);
      }
      // Deux variantes doivent différer réellement, sinon la remédiation
      // ressert le même contenu à un élève qui vient d'échouer.
      const sig = JSON.stringify(e.texte_complet ?? e.questions ?? e.items ?? e.phrases ?? e);
      if (signatures.has(sig)) err(ctx, "variante identique à une précédente");
      signatures.add(sig);
    });
  }
  console.log(`  ${vus.size} item(s) contrôlé(s)`);
}

console.log(`\n${erreurs} erreur(s), ${avertissements} avertissement(s)`);
process.exit(erreurs > 0 ? 1 : 0);

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
  "probleme_maths",
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

/** calcul_mental : { titre, consigne, calculs:[{id, enonce, reponse}] } */
function validerCalculMental(ctx, e) {
  const cs = e.calculs;
  if (!Array.isArray(cs) || cs.length === 0) return err(ctx, "aucun calcul");
  if (cs.length < 6 || cs.length > 12) warn(ctx, `${cs.length} calculs (6 à 12 attendus)`);
  const vus = new Set();
  for (const c of cs) {
    if (!c.enonce || !String(c.enonce).trim()) err(ctx, "énoncé de calcul vide");
    const r = String(c.reponse ?? "").trim();
    if (!r) err(ctx, `« ${c.enonce} » : réponse vide`);
    // Le comparateur partagé gère la virgule et l'espace des milliers, mais une
    // réponse de plusieurs mots reste une réponse à saisir en entier.
    if (r.split(/\s+/).length > 2 && !/^\d[\d\s]*$/.test(r))
      warn(ctx, `« ${c.enonce} » : réponse de plus de deux mots (« ${r} »)`);
    const cle = String(c.enonce).replace(/\s+/g, "");
    if (vus.has(cle)) warn(ctx, `calcul en double : « ${c.enonce} »`);
    vus.add(cle);
  }
}

/** probleme_maths : { titre, consigne, problemes:[{id, enonce, resultat_attendu,
 *  phrase_reponse_attendue, mots_cles[], indice}] } */
function validerProblemeMaths(ctx, e) {
  const ps = e.problemes;
  if (!Array.isArray(ps) || ps.length === 0) return err(ctx, "aucun problème");
  for (const p of ps) {
    if (!p.enonce || !String(p.enonce).trim()) err(ctx, "énoncé de problème vide");
    if (!String(p.resultat_attendu ?? "").trim()) err(ctx, `« ${(p.enonce||"").slice(0,40)}… » : resultat_attendu vide`);
    const phrase = String(p.phrase_reponse_attendue ?? "");
    if (!phrase.trim()) err(ctx, `« ${(p.enonce||"").slice(0,40)}… » : phrase_reponse_attendue vide`);
    const cles = p.mots_cles;
    if (!Array.isArray(cles) || cles.length === 0)
      err(ctx, `« ${(p.enonce||"").slice(0,40)}… » : mots_cles manquants`);
    else {
      const sansAccent = (x) => String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (const c of cles) {
        // Un mot-clé absent de la phrase attendue rend la correction impossible.
        if (!sansAccent(phrase).includes(sansAccent(c)))
          err(ctx, `mot-clé « ${c} » absent de la phrase réponse « ${phrase} »`);
        // Les accents ne sont PAS un risque : ProblemeMathsEleve.normaliser()
        // les retire des deux côtés avant de comparer.
      }
    }
  }
}

/**
 * Contrôle une figure (clé optionnelle `figure` sur une question).
 * Contrat : docs/ceintures/SPEC-FIGURES.md.
 * Une coordonnée fausse ne se voit pas à la relecture du JSON : elle se voit
 * au dessin, c'est-à-dire trop tard.
 */
function validerFigure(ctx, f) {
  if (!f || typeof f !== "object") return err(ctx, "figure : objet attendu");
  if (!["cadran", "angle", "polygone"].includes(f.type)) {
    return err(ctx, `figure : type « ${f.type} » inconnu (cadran, angle ou polygone)`);
  }
  if (f.type === "cadran") {
    const h = f.heures, m = f.minutes;
    if (!Number.isInteger(h) || h < 0 || h > 23) err(ctx, "cadran : heures entières entre 0 et 23");
    if (!Number.isInteger(m) || m < 0 || m > 59) err(ctx, "cadran : minutes entières entre 0 et 59");
    return;
  }
  if (f.type === "angle") {
    const d = Number(f.degres);
    if (!(d > 0 && d < 180)) err(ctx, "angle : degrés strictement entre 0 et 180");
    // 89° ou 91° se lisent « droit » à l'œil : l'item devient un piège visuel.
    if (d !== 90 && Math.abs(d - 90) < 12) {
      err(ctx, `angle : ${d}° est indiscernable d'un angle droit — s'en écarter d'au moins 12°`);
    }
    return;
  }
  // polygone
  const G = f.grille;
  if (G && (!Number.isInteger(G.colonnes) || !Number.isInteger(G.lignes) || G.colonnes < 2 || G.lignes < 2)) {
    err(ctx, "polygone : grille = { colonnes, lignes } entiers ≥ 2");
  }
  const entier = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isInteger(v) && v >= 0);
  const dedans = (p) => !G || (p[0] <= G.colonnes && p[1] <= G.lignes);
  const verifPt = (p, quoi) => {
    if (!entier(p)) return err(ctx, `${quoi} : coordonnées entières positives attendues, reçu ${JSON.stringify(p)}`);
    if (!dedans(p)) err(ctx, `${quoi} : le point ${JSON.stringify(p)} sort de la grille`);
  };
  const rien = !(f.polygones || []).length && !(f.segments || []).length
    && !(f.points || []).length && !(f.cercles || []).length;
  if (rien) err(ctx, "polygone : figure vide (ni polygones, ni segments, ni points, ni cercles)");

  (f.polygones || []).forEach((pol, i) => {
    const S = pol.sommets;
    if (!Array.isArray(S) || S.length < 3) return err(ctx, `polygone#${i + 1} : au moins 3 sommets`);
    S.forEach((p) => verifPt(p, `polygone#${i + 1}`));
    const vus = new Set();
    S.forEach((p) => {
      const k = JSON.stringify(p);
      if (vus.has(k)) err(ctx, `polygone#${i + 1} : sommet ${k} répété`);
      vus.add(k);
    });
    if (pol.nom && pol.nom.length !== S.length) {
      err(ctx, `polygone#${i + 1} : « ${pol.nom} » a ${pol.nom.length} lettre(s) pour ${S.length} sommet(s)`);
    }
    (pol.angles_droits || []).forEach((k) => {
      if (!Number.isInteger(k) || k < 0 || k >= S.length) {
        return err(ctx, `polygone#${i + 1} : angle droit sur le sommet ${k}, qui n'existe pas`);
      }
      // Le codage doit dire la vérité : un angle marqué droit doit l'être.
      const n = S.length, [ax, ay] = S[k], [px, py] = S[(k - 1 + n) % n], [nx, ny] = S[(k + 1) % n];
      const scal = (px - ax) * (nx - ax) + (py - ay) * (ny - ay);
      if (scal !== 0) err(ctx, `polygone#${i + 1} : le sommet ${k} est codé droit mais ne l'est pas`);
    });
    (pol.cotes_egaux || []).forEach((c) => {
      if (!Array.isArray(c) || !Number.isInteger(c[0]) || c[0] < 0 || c[0] >= S.length) {
        err(ctx, `polygone#${i + 1} : côté ${JSON.stringify(c)} hors de la figure`);
      }
    });
    // Les côtés marqués du même nombre de traits doivent avoir la même longueur.
    const parNb = {};
    (pol.cotes_egaux || []).forEach(([k, nb]) => {
      if (!Number.isInteger(k) || k < 0 || k >= S.length) return;
      const n = S.length, [ax, ay] = S[k], [bx, by] = S[(k + 1) % n];
      (parNb[nb || 1] ??= []).push([(bx - ax) ** 2 + (by - ay) ** 2, k]);
    });
    Object.entries(parNb).forEach(([nb, L]) => {
      if (L.length < 2) return warn(ctx, `polygone#${i + 1} : un seul côté porte ${nb} trait(s) — la marque d'égalité n'égale rien`);
      if (new Set(L.map((x) => x[0])).size > 1) {
        err(ctx, `polygone#${i + 1} : les côtés ${L.map((x) => x[1]).join(", ")} portent ${nb} trait(s) mais n'ont pas la même longueur`);
      }
    });
  });
  (f.segments || []).forEach((sg, i) => {
    verifPt(sg.de, `segment#${i + 1}`); verifPt(sg.a, `segment#${i + 1}`);
    if (JSON.stringify(sg.de) === JSON.stringify(sg.a)) err(ctx, `segment#${i + 1} : longueur nulle`);
  });
  (f.points || []).forEach((pt, i) => verifPt(pt.at, `point#${i + 1}`));
  (f.cercles || []).forEach((c, i) => {
    verifPt(c.centre, `cercle#${i + 1}`);
    if (!(Number(c.rayon) > 0)) err(ctx, `cercle#${i + 1} : rayon strictement positif attendu`);
  });
}

/** Parcourt une variante et contrôle toutes les figures qu'elle porte. */
function validerFigures(ctx, e) {
  (e.questions || []).forEach((q, i) => { if (q.figure) validerFigure(`${ctx} q${i + 1}`, q.figure); });
  (e.problemes || []).forEach((q, i) => { if (q.figure) validerFigure(`${ctx} pb${i + 1}`, q.figure); });
  if (e.figure) validerFigure(ctx, e.figure);
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
        case "calcul_mental":  validerCalculMental(ctx, e); break;
        case "probleme_maths": validerProblemeMaths(ctx, e); break;
        default:               warn(ctx, `type « ${item.type} » non contrôlé par ce validateur`);
      }
      validerFigures(ctx, e);
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

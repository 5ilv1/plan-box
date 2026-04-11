#!/usr/bin/env npx tsx
/**
 * 🧑‍🎓 Joseph — Agent de test + correction automatique pour Ma P'tite Règle
 *
 * Joseph est un élève virtuel qui fait tous les exercices, vérifie les réponses,
 * et corrige automatiquement les erreurs qu'il trouve.
 *
 * Usage :
 *   npm run joseph                    # Joseph vérifie toutes les règles
 *   npm run joseph "er"               # Joseph vérifie la règle -er/-é
 *   npm run joseph -- --fix           # Joseph vérifie ET corrige toutes les règles
 *   npm run joseph -- --fix "er"      # Joseph vérifie ET corrige la règle -er/-é
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// ── Types ──────────────────────────────────────────────────────────────────

interface Probleme {
  chapitre: string;
  exerciceId: string;
  exercice: string;
  type: string;
  probleme: string;
  details?: string;
  fixable: boolean;
}

const erreurs: Probleme[] = [];
const warnings: Probleme[] = [];
const corrections: { exerciceId: string; exercice: string; type: string; chapitre: string; changements: string[] }[] = [];

function erreur(chapitre: string, exerciceId: string, exercice: string, type: string, probleme: string, details?: string, fixable = true) {
  erreurs.push({ chapitre, exerciceId, exercice, type, probleme, details, fixable });
}

function warning(chapitre: string, exerciceId: string, exercice: string, type: string, probleme: string, details?: string) {
  warnings.push({ chapitre, exerciceId, exercice, type, probleme, details, fixable: false });
}

// ── Vérifications structurelles ────────────────────────────────────────────

function verifierStructureExercice(chap: string, ex: any) {
  const contenu = ex.contenu;
  if (!contenu) {
    erreur(chap, ex.id, ex.titre, ex.type, "Contenu vide (null)", undefined, false);
    return;
  }

  switch (ex.type) {
    case "revision":
      if (!contenu.points_cles?.length && !contenu.contenu_html) {
        erreur(chap, ex.id, ex.titre, ex.type, "Leçon sans contenu (pas de points_cles ni contenu_html)", undefined, false);
      }
      break;

    case "exercice":
      if (!contenu.questions?.length) {
        erreur(chap, ex.id, ex.titre, ex.type, "Aucune question", undefined, false);
        break;
      }
      for (let i = 0; i < contenu.questions.length; i++) {
        const q = contenu.questions[i];
        if (!q.enonce?.trim()) erreur(chap, ex.id, ex.titre, ex.type, `Question ${i + 1} : énoncé vide`);
        if (!q.reponse_attendue?.trim()) erreur(chap, ex.id, ex.titre, ex.type, `Question ${i + 1} : réponse attendue vide`);
        if (!q.enonce?.includes("___")) warning(chap, ex.id, ex.titre, ex.type, `Question ${i + 1} : pas de trou "___" dans l'énoncé`, q.enonce);
      }
      break;

    case "texte_a_trous":
      if (!contenu.texte_complet?.trim()) {
        erreur(chap, ex.id, ex.titre, ex.type, "Texte complet vide", undefined, false);
        break;
      }
      if (!contenu.trous?.length) {
        erreur(chap, ex.id, ex.titre, ex.type, "Aucun trou défini", undefined, false);
        break;
      }
      const mots = contenu.texte_complet.split(/\s+/);

      // Détecter si la règle concerne les verbes -er/-é
      const estRegleVerbe = /infinitif|participe|-er|-é/i.test(chap);
      const patternVerbeRegex = /^(.*er|.*é|.*ée|.*és|.*ées)$/i;

      for (let i = 0; i < contenu.trous.length; i++) {
        const t = contenu.trous[i];
        if (!t.mot?.trim()) erreur(chap, ex.id, ex.titre, ex.type, `Trou ${i + 1} : mot vide`);
        if (t.position == null) erreur(chap, ex.id, ex.titre, ex.type, `Trou ${i + 1} : position manquante`);
        else if (t.position >= mots.length) {
          erreur(chap, ex.id, ex.titre, ex.type, `Trou ${i + 1} : position ${t.position} hors du texte (${mots.length} mots)`, `Mot attendu : "${t.mot}"`);
        } else {
          const motTexte = mots[t.position]?.replace(/[.,;:!?'"()«»\-]/g, "").toLowerCase();
          const motTrou = t.mot.replace(/[.,;:!?'"()«»\-]/g, "").toLowerCase();
          if (motTexte !== motTrou) {
            erreur(chap, ex.id, ex.titre, ex.type,
              `Trou ${i + 1} : position ${t.position} = "${mots[t.position]}" mais mot attendu = "${t.mot}"`,
              `Le texte contient "${motTexte}" à cette position, pas "${motTrou}"`
            );
          }
        }

        // Vérifier que le mot du trou matche le pattern de la règle
        if (estRegleVerbe && t.mot) {
          const motNet = t.mot.replace(/[.,;:!?'"()«»\-]/g, "");
          if (!patternVerbeRegex.test(motNet)) {
            erreur(chap, ex.id, ex.titre, ex.type,
              `Trou ${i + 1} : "${t.mot}" ne finit pas en -er/-é — ne correspond pas à la règle`,
              `Mot hors sujet pour une règle infinitif/participe passé`
            );
          }
        }
      }
      const positions = contenu.trous.map((t: any) => t.position);
      const posSet = new Set(positions);
      if (posSet.size !== positions.length) {
        erreur(chap, ex.id, ex.titre, ex.type, "Positions en doublon dans les trous");
      }
      break;

    case "qcm":
      if (!contenu.questions?.length) {
        erreur(chap, ex.id, ex.titre, ex.type, "Aucune question QCM", undefined, false);
        break;
      }
      for (let i = 0; i < contenu.questions.length; i++) {
        const q = contenu.questions[i];
        if (!q.options?.length) {
          erreur(chap, ex.id, ex.titre, ex.type, `QCM ${i + 1} : pas d'options`, undefined, false);
          continue;
        }
        if (q.reponse_correcte == null) {
          erreur(chap, ex.id, ex.titre, ex.type, `QCM ${i + 1} : reponse_correcte manquante`);
        } else if (q.reponse_correcte < 0 || q.reponse_correcte >= q.options.length) {
          erreur(chap, ex.id, ex.titre, ex.type, `QCM ${i + 1} : reponse_correcte ${q.reponse_correcte} hors range (${q.options.length} options)`);
        }
        const optSet = new Set(q.options.map((o: string) => o.trim().toLowerCase()));
        if (optSet.size !== q.options.length) {
          erreur(chap, ex.id, ex.titre, ex.type, `QCM ${i + 1} : options en doublon`, q.options.join(" | "));
        }

        // Pour les homophones : vérifier qu'il y a exactement 2 options
        const estHomophone = / \/ |est.*et|sont.*son|ou.*où|a.*à|ce.*se|on.*ont/i.test(chap);
        if (estHomophone && q.options.length > 2) {
          erreur(chap, ex.id, ex.titre, ex.type,
            `QCM ${i + 1} : ${q.options.length} options au lieu de 2 pour un homophone`,
            `Les QCM homophones doivent avoir 2 options (1 correcte + 1 confusion) pour éviter les phrases absurdes`
          );
        }

        // Vérifier que les options incorrectes ne diffèrent que par 1-2 mots de la bonne réponse
        if (q.reponse_correcte != null && q.reponse_correcte < q.options.length) {
          const bonneReponse = q.options[q.reponse_correcte].trim().toLowerCase().split(/\s+/);
          for (let j = 0; j < q.options.length; j++) {
            if (j === q.reponse_correcte) continue;
            const optMots = q.options[j].trim().toLowerCase().split(/\s+/);
            // Compter les mots différents
            const maxLen = Math.max(bonneReponse.length, optMots.length);
            let nbDiffs = Math.abs(bonneReponse.length - optMots.length);
            for (let k = 0; k < Math.min(bonneReponse.length, optMots.length); k++) {
              if (bonneReponse[k] !== optMots[k]) nbDiffs++;
            }
            if (nbDiffs > 3) {
              warning(chap, ex.id, ex.titre, ex.type,
                `QCM ${i + 1} option ${j + 1} : ${nbDiffs} mots différents de la bonne réponse — risque de phrase absurde`,
                `"${q.options[j]}"`
              );
            }
          }
        }
      }
      break;

    case "ecriture_contrainte":
      if (!contenu.consigne?.trim()) erreur(chap, ex.id, ex.titre, ex.type, "Consigne vide");
      if (!contenu.contraintes?.length) warning(chap, ex.id, ex.titre, ex.type, "Pas de contraintes définies");
      if (!contenu.nb_phrases || contenu.nb_phrases < 1) warning(chap, ex.id, ex.titre, ex.type, "nb_phrases non défini ou < 1");
      break;

    default:
      warning(chap, ex.id, ex.titre, ex.type, `Type d'exercice inconnu : "${ex.type}"`);
  }
}

// ── Vérification IA ────────────────────────────────────────────────────────

async function verifierAvecIA(chap: string, ex: any): Promise<void> {
  const contenu = ex.contenu;
  if (!contenu) return;

  let prompt = "";

  if (ex.type === "exercice" && contenu.questions?.length) {
    prompt = `Tu es un vérificateur d'exercices scolaires (CE2-CM2). Analyse cet exercice et signale UNIQUEMENT les ERREURS factuelles.

Titre : ${contenu.titre || ex.titre}
Consigne : ${contenu.consigne || ""}

Questions :
${contenu.questions.map((q: any, i: number) => `${i + 1}. Énoncé : "${q.enonce}" → Réponse attendue : "${q.reponse_attendue}"`).join("\n")}

Vérifie :
- Chaque réponse attendue est-elle CORRECTE grammaticalement ?
- L'énoncé est-il clair et non ambigu ?
- Y a-t-il des erreurs d'orthographe dans les énoncés ?

Réponds en JSON : { "erreurs": [{ "question": 1, "probleme": "..." }], "ok": true/false }
Si tout est correct, réponds : { "erreurs": [], "ok": true }`;
  } else if (ex.type === "qcm" && contenu.questions?.length) {
    prompt = `Tu es un vérificateur d'exercices scolaires (CE2-CM2). Analyse ce QCM et signale UNIQUEMENT les ERREURS.

Titre : ${contenu.titre || ex.titre}

Questions :
${contenu.questions.map((q: any, i: number) => {
  const opts = q.options.map((o: string, j: number) => `  ${j === q.reponse_correcte ? "✓" : " "} ${j}) ${o}`).join("\n");
  return `${i + 1}. ${q.question}\n${opts}`;
}).join("\n\n")}

Vérifie :
- La réponse marquée ✓ est-elle vraiment la bonne ?
- Les phrases incorrectes contiennent-elles bien une erreur ?
- Y a-t-il des options identiques ou ambiguës ?

Réponds en JSON : { "erreurs": [{ "question": 1, "probleme": "..." }], "ok": true/false }
Si tout est correct, réponds : { "erreurs": [], "ok": true }`;
  } else if (ex.type === "texte_a_trous" && contenu.trous?.length) {
    const mots = contenu.texte_complet?.split(/\s+/) ?? [];
    const trousDetail = contenu.trous.map((t: any, i: number) => {
      const motContexte = mots[t.position] ?? "?";
      return `Trou ${i + 1} : position ${t.position}, réponse = "${t.mot}" (dans le texte : "${motContexte}")`;
    }).join("\n");

    prompt = `Tu es un vérificateur d'exercices scolaires (CE2-CM2). Analyse ce texte à trous.

Titre : ${contenu.titre || ex.titre}
Texte complet : "${contenu.texte_complet}"

Trous :
${trousDetail}

Vérifie :
- Chaque mot attendu est-il grammaticalement correct dans le contexte ?
- Le texte est-il cohérent et adapté à des élèves de CE2-CM2 ?
- Y a-t-il des mots hors sujet par rapport à la règle travaillée ?

Réponds en JSON : { "erreurs": [{ "trou": 1, "probleme": "..." }], "ok": true/false }
Si tout est correct, réponds : { "erreurs": [], "ok": true }`;
  } else {
    return;
  }

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]);
    if (!result.ok && result.erreurs?.length) {
      for (const e of result.erreurs) {
        const label = e.question ? `Question ${e.question}` : e.trou ? `Trou ${e.trou}` : "?";
        erreur(chap, ex.id, ex.titre, ex.type, `[IA] ${label} : ${e.probleme}`);
      }
    }
  } catch (err) {
    warning(chap, ex.id, ex.titre, ex.type, `Erreur lors de la vérification IA : ${err}`);
  }
}

// ── Corrections programmatiques (déterministes, pas d'IA) ─────────────────

function corrigerPositionsTrous(contenu: any): { corrige: boolean; supprimés: string[] } {
  if (!contenu.texte_complet || !Array.isArray(contenu.trous)) return { corrige: false, supprimés: [] };

  const mots = (contenu.texte_complet as string).split(/\s+/);
  const trousFixed: any[] = [];
  const supprimés: string[] = [];

  for (const trou of contenu.trous) {
    const motSansPonctuation = trou.mot?.replace(/[.,;:!?'"()«»\-]/g, "");
    if (!motSansPonctuation) { supprimés.push(trou.mot ?? "?"); continue; }

    // Chercher le mot dans le texte
    const positionsPrises = new Set<number>(trousFixed.map((t) => t.position));
    let found = false;
    for (let i = 0; i < mots.length; i++) {
      if (positionsPrises.has(i)) continue;
      const motTexte = mots[i].replace(/[.,;:!?'"()«»\-]/g, "");
      if (motTexte.toLowerCase() === motSansPonctuation.toLowerCase()) {
        trousFixed.push({ ...trou, position: i, mot: mots[i] });
        found = true;
        break;
      }
    }
    if (!found) supprimés.push(trou.mot);
  }

  const changed = JSON.stringify(contenu.trous) !== JSON.stringify(trousFixed);
  contenu.trous = trousFixed;
  return { corrige: changed, supprimés };
}

function corrigerDoublonsQCM(contenu: any): boolean {
  if (!Array.isArray(contenu.questions)) return false;
  let changed = false;
  for (const q of contenu.questions) {
    if (!Array.isArray(q.options)) continue;
    const seen = new Map<string, number>();
    for (let i = 0; i < q.options.length; i++) {
      const norm = q.options[i].trim().toLowerCase();
      if (seen.has(norm)) {
        // Doublon — supprimer l'option en doublon
        q.options.splice(i, 1);
        if (q.reponse_correcte >= i) q.reponse_correcte = Math.max(0, q.reponse_correcte - 1);
        i--;
        changed = true;
      } else {
        seen.set(norm, i);
      }
    }
  }
  return changed;
}

// ── Correction IA (pour les erreurs de contenu) ───────────────────────────

async function corrigerExercice(ex: any): Promise<any | null> {
  const contenu = JSON.parse(JSON.stringify(ex.contenu)); // deep clone
  if (!contenu) return null;

  const exErreurs = erreurs.filter((e) => e.exerciceId === ex.id && e.fixable);
  if (exErreurs.length === 0) return null;

  let fixedProgrammatically = false;

  // 1. Corrections programmatiques d'abord
  if (ex.type === "texte_a_trous") {
    const { corrige, supprimés } = corrigerPositionsTrous(contenu);
    if (corrige) {
      fixedProgrammatically = true;
      console.log(`  🔧 Positions des trous recalculées`);
      if (supprimés.length > 0) {
        console.log(`  🔧 Trous supprimés (mot introuvable dans le texte) : ${supprimés.join(", ")}`);
      }
    }
  }

  if (ex.type === "qcm") {
    if (corrigerDoublonsQCM(contenu)) {
      fixedProgrammatically = true;
      console.log(`  🔧 Doublons QCM supprimés`);
    }

    // Pour les homophones : réduire à 2 options (bonne réponse + 1 confusion)
    const chapTitre = ex.chapTitre ?? "";
    const estHomophone = / \/ |est.*et|sont.*son|ou.*où|a.*à|ce.*se|on.*ont/i.test(chapTitre);
    if (estHomophone && Array.isArray(contenu.questions)) {
      for (const q of contenu.questions) {
        if (Array.isArray(q.options) && q.options.length > 2 && q.reponse_correcte != null) {
          const bonneReponse = q.options[q.reponse_correcte];
          // Trouver la meilleure mauvaise option (celle qui diffère le moins de la bonne)
          const bonneMots = bonneReponse.trim().toLowerCase().split(/\s+/);
          let meilleurIdx = -1;
          let minDiffs = Infinity;
          for (let j = 0; j < q.options.length; j++) {
            if (j === q.reponse_correcte) continue;
            const optMots = q.options[j].trim().toLowerCase().split(/\s+/);
            let diffs = Math.abs(bonneMots.length - optMots.length);
            for (let k = 0; k < Math.min(bonneMots.length, optMots.length); k++) {
              if (bonneMots[k] !== optMots[k]) diffs++;
            }
            if (diffs < minDiffs) { minDiffs = diffs; meilleurIdx = j; }
          }
          if (meilleurIdx >= 0) {
            const mauvaiseOption = q.options[meilleurIdx];
            q.options = [bonneReponse, mauvaiseOption];
            q.reponse_correcte = 0;
            fixedProgrammatically = true;
          }
        }
      }
      if (fixedProgrammatically) console.log(`  🔧 QCM homophones réduits à 2 options`);
    }
  }

  // 2. Filtrer les erreurs restantes (exclure celles corrigées programmatiquement)
  const erreursRestantes = exErreurs.filter((e) => {
    if (e.probleme.includes("position") && fixedProgrammatically) return false;
    if (e.probleme.includes("doublon") && fixedProgrammatically) return false;
    if (e.probleme.includes("options au lieu de 2") && fixedProgrammatically) return false;
    return true;
  });

  // Si tout est corrigé programmatiquement, pas besoin d'IA
  if (erreursRestantes.length === 0) return contenu;

  // 3. Correction IA pour les erreurs de contenu
  const problemesListe = erreursRestantes.map((e) => `- ${e.probleme}${e.details ? ` (${e.details})` : ""}`).join("\n");

  const regleTexte = ex.regleTexte ?? ex.chapDescription ?? "";
  const regleContext = regleTexte
    ? `RÈGLE DE RÉFÉRENCE (à respecter impérativement) :\n${regleTexte}\n\n`
    : "";

  const prompt = `Tu es un correcteur d'exercices scolaires (CE2-CM2). L'exercice ci-dessous contient des erreurs que tu dois corriger.

${regleContext}Type d'exercice : ${ex.type}
Titre : ${ex.titre}

Contenu actuel (JSON) :
${JSON.stringify(contenu, null, 2)}

Erreurs détectées :
${problemesListe}

INSTRUCTIONS :
- Corrige UNIQUEMENT les erreurs listées ci-dessus
- Ne change PAS la structure du JSON
- Ne change PAS les champs qui fonctionnent correctement
- Pour les QCM : assure-toi que chaque option est UNIQUE, que les différences portent sur la règle étudiée, et que reponse_correcte pointe vers la bonne réponse
- Pour les texte_a_trous : assure-toi que chaque mot de trou existe EXACTEMENT dans le texte_complet
- Pour les exercices : assure-toi que les réponses attendues sont grammaticalement correctes

Réponds UNIQUEMENT avec le JSON corrigé, sans explication. Le JSON doit être valide et complet.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`  ⚠️  Impossible de parser la correction IA pour "${ex.titre}"`);
      // Retourner quand même les corrections programmatiques
      return fixedProgrammatically ? contenu : null;
    }

    const corrected = JSON.parse(jsonMatch[0]);

    // Réappliquer les corrections programmatiques sur le résultat IA (sécurité)
    if (corrected.texte_complet && Array.isArray(corrected.trous)) {
      corrigerPositionsTrous(corrected);
    }
    if (Array.isArray(corrected.questions)) {
      corrigerDoublonsQCM(corrected);
    }

    return corrected;
  } catch (err) {
    console.log(`  ⚠️  Erreur de correction IA pour "${ex.titre}" : ${err}`);
    return fixedProgrammatically ? contenu : null;
  }
}

function diffContenu(avant: any, apres: any, prefix = ""): string[] {
  const diffs: string[] = [];
  if (Array.isArray(avant) && Array.isArray(apres)) {
    const maxLen = Math.max(avant.length, apres.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= avant.length) {
        diffs.push(`${prefix}[${i}] ➕ ajouté`);
      } else if (i >= apres.length) {
        diffs.push(`${prefix}[${i}] ➖ supprimé`);
      } else {
        diffs.push(...diffContenu(avant[i], apres[i], `${prefix}[${i}].`));
      }
    }
  } else if (typeof avant === "object" && avant && typeof apres === "object" && apres) {
    const keys = new Set([...Object.keys(avant), ...Object.keys(apres)]);
    for (const key of keys) {
      if (JSON.stringify(avant[key]) !== JSON.stringify(apres[key])) {
        const av = typeof avant[key] === "string" ? avant[key] : JSON.stringify(avant[key]);
        const ap = typeof apres[key] === "string" ? apres[key] : JSON.stringify(apres[key]);
        if (av && ap && av !== ap) {
          const avShort = String(av).length > 80 ? String(av).slice(0, 80) + "…" : String(av);
          const apShort = String(ap).length > 80 ? String(ap).slice(0, 80) + "…" : String(ap);
          diffs.push(`${prefix}${key} : "${avShort}" → "${apShort}"`);
        } else if (!av && ap) {
          diffs.push(`${prefix}${key} ➕ "${ap}"`);
        } else if (av && !ap) {
          diffs.push(`${prefix}${key} ➖ "${av}"`);
        }
      }
    }
  } else if (avant !== apres) {
    const avShort = String(avant).length > 80 ? String(avant).slice(0, 80) + "…" : String(avant);
    const apShort = String(apres).length > 80 ? String(apres).slice(0, 80) + "…" : String(apres);
    diffs.push(`${prefix}: "${avShort}" → "${apShort}"`);
  }
  return diffs;
}

async function appliquerCorrection(ex: any, contenuCorrige: any): Promise<boolean> {
  // Calculer les changements concrets
  const changements = diffContenu(ex.contenu, contenuCorrige);

  // Recalculer nb_questions
  let nbQ = 0;
  if (Array.isArray(contenuCorrige.questions)) nbQ = contenuCorrige.questions.length;
  else if (Array.isArray(contenuCorrige.trous)) nbQ = contenuCorrige.trous.length;
  else if (contenuCorrige.nb_phrases) nbQ = contenuCorrige.nb_phrases;

  const { error } = await supabase
    .from("exercice")
    .update({ contenu: contenuCorrige, ...(nbQ > 0 ? { nb_questions: nbQ } : {}) })
    .eq("id", ex.id);

  if (error) {
    console.log(`  ❌ Erreur BDD pour "${ex.titre}" : ${error.message}`);
    return false;
  }

  if (changements.length > 0) {
    console.log(`  📝 Changements :`);
    for (const c of changements.slice(0, 15)) {
      console.log(`     ${c}`);
    }
    if (changements.length > 15) {
      console.log(`     … et ${changements.length - 15} autre(s)`);
    }
  }

  corrections.push({
    exerciceId: ex.id,
    exercice: ex.titre,
    type: ex.type,
    chapitre: ex.chapTitre,
    changements,
  });
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// MODULE DICTÉES
// ══════════════════════════════════════════════════════════════════════════

async function verifierDictees(filtre: string) {
  console.log("\n📝 Vérification des dictées");
  console.log("=".repeat(60));

  const { data: allDictees } = await supabase
    .from("dictees")
    .select("id, titre, created_at")
    .order("created_at", { ascending: false });

  const dictees = filtre
    ? (allDictees ?? []).filter((d: any) => d.titre.toLowerCase().includes(filtre.toLowerCase()))
    : allDictees;

  if (!dictees?.length) {
    console.log("⚠️  Aucune dictée trouvée.");
    return;
  }

  console.log(`📚 ${dictees.length} dictée(s) trouvée(s)\n`);

  for (const dict of dictees) {
    console.log(`\n📝 ${dict.titre}`);
    console.log("-".repeat(50));

    // Récupérer les blocs plan_travail de type dictee liés
    const { data: blocs } = await supabase
      .from("plan_travail")
      .select("id, contenu, type")
      .eq("type", "dictee")
      .not("contenu", "is", null)
      .limit(50);

    // Filtrer ceux qui contiennent le titre de la dictée
    const blocsDict = (blocs ?? []).filter((b: any) => {
      const c = b.contenu as any;
      return c?.titre_dictee === dict.titre || c?.dictee_id === dict.id;
    });

    if (blocsDict.length === 0) {
      // Vérifier directement la dictée
      const { data: dictDetail } = await supabase
        .from("dictees")
        .select("*")
        .eq("id", dict.id)
        .single();

      if (!dictDetail) continue;
      const d = dictDetail as any;

      // Vérifier la structure
      if (!d.texte && !d.contenu) {
        warning(dict.titre, dict.id, "dictée", "dictee", "Pas de texte ni de contenu");
        continue;
      }

      console.log(`  ✓ Structure OK`);
      continue;
    }

    for (const bloc of blocsDict) {
      const c = bloc.contenu as any;

      // Vérifier la structure du contenu dictée
      if (!c.texte?.trim()) {
        erreur(dict.titre, bloc.id, "Bloc dictée", "dictee", "Texte de dictée vide");
      }

      if (c.phrases && Array.isArray(c.phrases)) {
        for (let i = 0; i < c.phrases.length; i++) {
          const p = c.phrases[i];
          if (!p.texte?.trim()) {
            erreur(dict.titre, bloc.id, "Bloc dictée", "dictee", `Phrase ${i + 1} : texte vide`);
          }
        }

        // Vérifier que la concaténation des phrases = texte complet
        const textePhrases = c.phrases.map((p: any) => p.texte?.trim()).join(" ");
        const texteComplet = c.texte?.trim();
        if (texteComplet && textePhrases && !texteComplet.includes(textePhrases.slice(0, 30))) {
          warning(dict.titre, bloc.id, "Bloc dictée", "dictee",
            "Les phrases ne semblent pas correspondre au texte complet");
        }

        console.log(`  ✓ ${c.phrases.length} phrase(s), niveau ${c.niveau_etoiles ?? "?"}⭐`);
      } else {
        warning(dict.titre, bloc.id, "Bloc dictée", "dictee", "Pas de découpage en phrases");
      }

      if (c.mots && Array.isArray(c.mots)) {
        for (let i = 0; i < c.mots.length; i++) {
          if (!c.mots[i]?.trim()) {
            erreur(dict.titre, bloc.id, "Bloc dictée", "dictee", `Mot ${i + 1} : vide dans la liste de mots`);
          }
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MODULE PARCOURS ÉLÈVE
// ══════════════════════════════════════════════════════════════════════════

async function verifierParcours(filtre: string) {
  console.log("\n🎒 Vérification du parcours élève");
  console.log("=".repeat(60));

  // Récupérer les chapitres assignés à au moins un groupe
  const { data: assignations } = await supabase
    .from("chapitre_assignation")
    .select("chapitre_id")
    .eq("actif", true);

  const chapIds = [...new Set((assignations ?? []).map((a: any) => a.chapitre_id))];

  if (chapIds.length === 0) {
    console.log("⚠️  Aucun chapitre assigné trouvé.");
    return;
  }

  const { data: allChapitres } = await supabase
    .from("chapitres")
    .select("id, titre, matiere, sous_matiere, nb_cartes_eval, seuil_reussite")
    .in("id", chapIds)
    .order("matiere");

  const chapitres = filtre
    ? (allChapitres ?? []).filter((c: any) => c.titre.toLowerCase().includes(filtre.toLowerCase()))
    : allChapitres;

  if (!chapitres?.length) {
    console.log("⚠️  Aucun chapitre trouvé.");
    return;
  }

  console.log(`📚 ${chapitres.length} chapitre(s) assigné(s)\n`);

  for (const chap of chapitres as any[]) {
    console.log(`\n📖 ${chap.titre} (${chap.matiere})`);
    console.log("-".repeat(50));

    // Récupérer les exercices
    const { data: exercices } = await supabase
      .from("exercice")
      .select("id, titre, type, nb_questions, contenu, ordre")
      .eq("chapitre_id", chap.id)
      .order("ordre");

    if (!exercices?.length) {
      erreur(chap.titre, chap.id, "Parcours", "parcours", "Chapitre assigné sans exercice — l'élève verra un chapitre vide", undefined, false);
      continue;
    }

    console.log(`  ${exercices.length} exercice(s)`);

    // Simuler le parcours élève exercice par exercice
    let nbOk = 0;
    for (const ex of exercices) {
      const contenu = ex.contenu as any;
      const problems: string[] = [];

      if (!contenu) {
        problems.push("contenu null — exercice inaccessible");
      } else {
        switch (ex.type) {
          case "exercice":
            if (!contenu.questions?.length) problems.push("pas de questions");
            else {
              for (let i = 0; i < contenu.questions.length; i++) {
                const q = contenu.questions[i];
                if (!q.enonce) problems.push(`Q${i + 1}: pas d'énoncé`);
                if (!q.reponse_attendue) problems.push(`Q${i + 1}: pas de réponse attendue`);
              }
            }
            break;

          case "texte_a_trous":
            if (!contenu.texte_complet) problems.push("pas de texte_complet");
            if (!contenu.trous?.length) problems.push("pas de trous");
            else {
              // Vérifier pattern des mots si c'est une règle verbe
              const estVerbe = /infinitif|participe|-er|-é/i.test(chap.titre);
              if (estVerbe) {
                const motsInvalides = contenu.trous.filter((t: any) => {
                  const m = t.mot?.replace(/[.,;:!?'"()«»\-]/g, "") ?? "";
                  return m && !/^(.*er|.*é|.*ée|.*és|.*ées)$/i.test(m);
                });
                if (motsInvalides.length > 0) {
                  problems.push(`${motsInvalides.length} trou(s) hors pattern -er/-é : ${motsInvalides.map((t: any) => `"${t.mot}"`).join(", ")}`);
                }
              }
            }
            break;

          case "qcm":
            if (!contenu.questions?.length) problems.push("pas de questions");
            else {
              for (let i = 0; i < contenu.questions.length; i++) {
                const q = contenu.questions[i];
                if (!q.options?.length) problems.push(`Q${i + 1}: pas d'options`);
                if (q.reponse_correcte == null) problems.push(`Q${i + 1}: pas de réponse correcte`);
              }
            }
            break;

          case "ecriture_contrainte":
            if (!contenu.consigne) problems.push("pas de consigne");
            break;

          case "revision":
            if (!contenu.points_cles?.length && !contenu.contenu_html) {
              problems.push("leçon vide");
            }
            break;

          case "calcul_mental":
            if (!contenu.questions?.length) problems.push("pas de questions");
            break;

          case "analyse_phrase":
            if (!contenu.phrases?.length) problems.push("pas de phrases");
            break;
        }
      }

      if (problems.length > 0) {
        const icon = "❌";
        console.log(`  ${icon} ${ex.titre} (${ex.type})`);
        for (const p of problems) {
          erreur(chap.titre, ex.id, ex.titre, "parcours", `Bloquant pour l'élève : ${p}`, undefined, false);
          console.log(`     → ${p}`);
        }
      } else {
        nbOk++;
        console.log(`  ✅ ${ex.titre} (${ex.type})`);
      }
    }

    // Vérifier le seuil d'évaluation
    if (chap.nb_cartes_eval && chap.nb_cartes_eval > exercices.length) {
      warning(chap.titre, chap.id, "Évaluation", "parcours",
        `nb_cartes_eval (${chap.nb_cartes_eval}) > nombre d'exercices (${exercices.length})`);
    }

    // Vérifier que le parcours est complet
    const types = exercices.map((e: any) => e.type);
    if (!types.includes("revision") && chap.sous_matiere === "rituel-orthographe") {
      warning(chap.titre, chap.id, "Parcours", "parcours", "Rituel sans leçon (type revision)");
    }

    // Vérification IA du parcours : cohérence pédagogique
    if (exercices.length >= 3) {
      try {
        const resume = exercices.map((e: any) => `- ${e.titre} (${e.type})`).join("\n");
        const res = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Tu es un expert en pédagogie primaire (CE2-CM2). Vérifie la cohérence de ce parcours d'exercices pour le chapitre "${chap.titre}" :

${resume}

Vérifie :
- L'ordre est-il pédagogiquement logique (découverte → entraînement → production) ?
- Y a-t-il un exercice manquant ou incohérent ?

Réponds en JSON : { "ok": true/false, "problemes": ["..."] }
Si tout est cohérent, réponds : { "ok": true, "problemes": [] }`,
          }],
        });

        const text = res.content[0].type === "text" ? res.content[0].text : "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (!result.ok && result.problemes?.length) {
            for (const p of result.problemes) {
              warning(chap.titre, chap.id, "Parcours", "parcours", `[IA] ${p}`);
            }
          }
        }
      } catch {}
    }

    console.log(`  → ${nbOk}/${exercices.length} exercice(s) jouable(s)`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes("--fix");
  const dicteesMode = args.includes("--dictees");
  const parcoursMode = args.includes("--parcours");
  const allMode = !dicteesMode && !parcoursMode; // par défaut = ptite règle
  const filtre = args.filter((a) => !a.startsWith("--")).join(" ").trim();

  console.log("🧑‍🎓 Joseph — Agent de test Plan Box");
  if (fixMode) console.log("🔧 Mode correction activé (--fix)");
  if (dicteesMode) console.log("📝 Mode dictées");
  if (parcoursMode) console.log("🎒 Mode parcours élève");
  if (!dicteesMode && !parcoursMode) console.log("✏️  Mode Ma P'tite Règle");
  if (filtre) console.log(`🎯 Filtre : "${filtre}"`);
  console.log("=".repeat(60));

  // ── Ma P'tite Règle ────────────────────────────────────────────────────
  if (allMode) {
    const { data: allChapitres } = await supabase
      .from("chapitres")
      .select("id, titre, description")
      .eq("sous_matiere", "rituel-orthographe")
      .order("created_at");

    const chapitres = filtre
      ? (allChapitres ?? []).filter((c) => c.titre.toLowerCase().includes(filtre.toLowerCase()))
      : allChapitres;

    if (!chapitres?.length) {
      console.log("⚠️  Aucun chapitre rituel trouvé.");
    } else {
      console.log(`📚 ${chapitres.length} chapitre(s) rituel(s) trouvé(s)\n`);

      const tousExercices: any[] = [];

      for (const chap of chapitres) {
        console.log(`\n📖 ${chap.titre}`);
        console.log("-".repeat(50));

        const { data: exercices } = await supabase
          .from("exercice")
          .select("id, titre, type, nb_questions, contenu, ordre")
          .eq("chapitre_id", chap.id)
          .order("ordre");

        if (!exercices?.length) {
          erreur(chap.titre, "", "-", "-", "Chapitre sans exercice", undefined, false);
          continue;
        }

        console.log(`  ${exercices.length} exercice(s)`);

        // Extraire la règle depuis la leçon (type revision) si elle existe
        const lecon = exercices.find((e: any) => e.type === "revision");
        const regleContenu = lecon?.contenu as any;
        const regleTexte = regleContenu?.points_cles?.join("\n") ?? chap.description ?? "";

        for (const ex of exercices) {
          console.log(`  → ${ex.titre} (${ex.type})`);
          tousExercices.push({ ...ex, chapTitre: chap.titre, chapDescription: chap.description, regleTexte });
          verifierStructureExercice(chap.titre, ex);
          await verifierAvecIA(chap.titre, ex);
        }
      }

      // Phase de correction (max 3 passes)
      const MAX_PASSES = 3;
      for (let passe = 1; passe <= MAX_PASSES; passe++) {
        if (!fixMode || !erreurs.some((e) => e.fixable)) break;

        console.log("\n" + "=".repeat(60));
        console.log(`🔧 PHASE DE CORRECTION — Passe ${passe}/${MAX_PASSES}`);
        console.log("=".repeat(60));

        const exIdsACorreger = [...new Set(erreurs.filter((e) => e.fixable).map((e) => e.exerciceId))];

        for (const exId of exIdsACorreger) {
          const ex = tousExercices.find((e) => e.id === exId);
          if (!ex) continue;

          console.log(`\n  🔧 Correction de "${ex.titre}"…`);
          const contenuCorrige = await corrigerExercice(ex);

          if (contenuCorrige) {
            const ok = await appliquerCorrection(ex, contenuCorrige);
            if (ok) {
              console.log(`  ✅ Corrigé et sauvegardé en BDD`);
              console.log(`  🔄 Re-vérification…`);
              ex.contenu = contenuCorrige;
              // Retirer les anciennes erreurs
              let idx = erreurs.findIndex((e) => e.exerciceId === exId);
              while (idx >= 0) {
                erreurs.splice(idx, 1);
                idx = erreurs.findIndex((e) => e.exerciceId === exId);
              }
              verifierStructureExercice(ex.chapTitre, ex);
              await verifierAvecIA(ex.chapTitre, ex);
              const restantes = erreurs.filter((e) => e.exerciceId === exId);
              console.log(restantes.length === 0 ? `  ✅ Aucune erreur restante` : `  ⚠️  ${restantes.length} erreur(s) restante(s)`);
            }
          } else {
            console.log(`  ⚠️  Pas de correction générée`);
          }
        }

        if (!erreurs.some((e) => e.fixable)) {
          console.log(`\n  ✅ Toutes les erreurs corrigées en ${passe} passe(s)`);
          break;
        } else if (passe < MAX_PASSES) {
          console.log(`\n  🔄 ${erreurs.filter((e) => e.fixable).length} erreur(s) restante(s), relance…`);
        }
      }

      // Phase de regénération : si des erreurs persistent après 3 passes
      const erreursRestantes = erreurs.filter((e) => e.fixable);
      if (fixMode && erreursRestantes.length > 0) {
        console.log("\n" + "=".repeat(60));
        console.log("🔄 REGÉNÉRATION — Exercices incorrigibles");
        console.log("=".repeat(60));

        const exIdsARegenerer = [...new Set(erreursRestantes.map((e) => e.exerciceId))];

        for (const exId of exIdsARegenerer) {
          const ex = tousExercices.find((e) => e.id === exId);
          if (!ex) continue;

          // Trouver le chapitre parent
          const chapData = chapitres!.find((c) => tousExercices.some((e) => e.id === exId && e.chapTitre === c.titre));
          if (!chapData) continue;

          console.log(`\n  🔄 Regénération de "${ex.titre}" (${ex.type})…`);

          try {
            // Récupérer la leçon pour avoir la règle
            const leconEx = tousExercices.find((e) => e.chapTitre === ex.chapTitre && e.type === "revision");
            const leconContenu = leconEx?.contenu as any;
            const regle = leconContenu?.points_cles?.join(". ") ?? chapData.description ?? "";
            const astuce = leconContenu?.astuce ?? "";

            // Appeler l'API de regénération
            const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/ma-ptite-regle/regenerer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ exercice_id: exId }),
            });

            if (res.ok) {
              const json = await res.json();
              console.log(`  ✅ Regénéré avec succès`);

              // Mettre à jour l'exercice local et re-vérifier
              ex.contenu = json.contenu;
              let idx = erreurs.findIndex((e) => e.exerciceId === exId);
              while (idx >= 0) { erreurs.splice(idx, 1); idx = erreurs.findIndex((e) => e.exerciceId === exId); }
              verifierStructureExercice(ex.chapTitre, ex);
              await verifierAvecIA(ex.chapTitre, ex);
              const restantes = erreurs.filter((e) => e.exerciceId === exId);
              console.log(restantes.length === 0 ? `  ✅ Aucune erreur` : `  ⚠️  ${restantes.length} erreur(s) restante(s)`);
            } else {
              // Pas d'API de regénération — regénérer via IA directement
              console.log(`  ⚠️  API de regénération non disponible, regénération IA directe…`);

              const regleRef = ex.regleTexte ?? ex.chapDescription ?? "";
              const prompt = `Tu es un générateur d'exercices scolaires (CE2-CM2).
${regleRef ? `RÈGLE :\n${regleRef}\n` : ""}
Regénère ENTIÈREMENT cet exercice (type: ${ex.type}) pour la règle "${ex.chapTitre}".
Le contenu précédent avait des erreurs incorrigibles. Crée un contenu NOUVEAU et CORRECT.

${ex.type === "texte_a_trous" ? `Génère une petite histoire cohérente (5-8 phrases) adaptée à des élèves de CE2-CM2.
Les trous portent UNIQUEMENT sur les mots concernés par la règle.
Chaque trou doit avoir un mot qui EXISTE dans le texte_complet, à la bonne position.
Format JSON attendu : { "titre": "...", "consigne": "...", "texte_complet": "...", "trous": [{ "position": N, "mot": "...", "indice": "..." }] }` : ""}

${ex.type === "qcm" ? `Génère 5 questions "trouve la bonne phrase" avec 2 options chacune.
Chaque question a 1 phrase correcte et 1 phrase avec UNE erreur sur la règle.
Format JSON : { "titre": "...", "consigne": "...", "questions": [{ "question": "...", "options": ["...", "..."], "reponse_correcte": 0, "explication": "..." }] }` : ""}

Réponds UNIQUEMENT avec le JSON, sans explication.`;

              const aiRes = await anthropic.messages.create({
                model: "claude-opus-4-20250514",
                max_tokens: 4000,
                messages: [{ role: "user", content: prompt }],
              });

              const text = aiRes.content[0].type === "text" ? aiRes.content[0].text : "";
              const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
              const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

              if (jsonMatch) {
                let newContenu = JSON.parse(jsonMatch[0]);

                // Appliquer les corrections programmatiques
                if (ex.type === "texte_a_trous" && newContenu.texte_complet && Array.isArray(newContenu.trous)) {
                  const mots = newContenu.texte_complet.split(/\s+/);
                  const trousFixed: any[] = [];
                  for (const trou of newContenu.trous) {
                    const motNet = trou.mot?.replace(/[.,;:!?'"()]/g, "");
                    if (!motNet) continue;
                    const posPrises = new Set(trousFixed.map((t: any) => t.position));
                    for (let i = 0; i < mots.length; i++) {
                      if (posPrises.has(i)) continue;
                      if (mots[i].replace(/[.,;:!?'"()]/g, "").toLowerCase() === motNet.toLowerCase()) {
                        trousFixed.push({ ...trou, position: i, mot: mots[i] });
                        break;
                      }
                    }
                  }
                  newContenu.trous = trousFixed;
                }

                // Sauvegarder en BDD
                let nbQ = 0;
                if (Array.isArray(newContenu.questions)) nbQ = newContenu.questions.length;
                else if (Array.isArray(newContenu.trous)) nbQ = newContenu.trous.length;

                const { error: dbErr } = await supabase
                  .from("exercice")
                  .update({ contenu: newContenu, ...(nbQ > 0 ? { nb_questions: nbQ } : {}) })
                  .eq("id", exId);

                if (!dbErr) {
                  console.log(`  ✅ Regénéré et sauvegardé en BDD`);
                  ex.contenu = newContenu;
                  corrections.push({ exerciceId: exId, exercice: ex.titre, type: ex.type, chapitre: ex.chapTitre, changements: ["Regénération complète"] });
                  let idx = erreurs.findIndex((e) => e.exerciceId === exId);
                  while (idx >= 0) { erreurs.splice(idx, 1); idx = erreurs.findIndex((e) => e.exerciceId === exId); }
                  verifierStructureExercice(ex.chapTitre, ex);
                  await verifierAvecIA(ex.chapTitre, ex);
                  const rest = erreurs.filter((e) => e.exerciceId === exId);
                  console.log(rest.length === 0 ? `  ✅ Aucune erreur` : `  ⚠️  ${rest.length} erreur(s) restante(s)`);
                } else {
                  console.log(`  ❌ Erreur BDD : ${dbErr.message}`);
                }
              } else {
                console.log(`  ❌ Impossible de parser la regénération`);
              }
            }
          } catch (err) {
            console.log(`  ❌ Erreur de regénération : ${err}`);
          }
        }
      }
    }
  }

  // ── Dictées ────────────────────────────────────────────────────────────
  if (dicteesMode) {
    await verifierDictees(filtre);
  }

  // ── Parcours élève ─────────────────────────────────────────────────────
  if (parcoursMode) {
    await verifierParcours(filtre);
  }

  // ── Rapport final ──────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("📋 RAPPORT FINAL DE JOSEPH");
  console.log("=".repeat(60));

  if (corrections.length > 0) {
    console.log(`\n🔧 ${corrections.length} CORRECTION(S) APPLIQUÉE(S) :`);
    for (const c of corrections) {
      console.log(`\n  ✅ ${c.exercice} (${c.type})`);
      if (c.changements.length > 0) {
        for (const ch of c.changements.slice(0, 10)) {
          console.log(`     ${ch}`);
        }
        if (c.changements.length > 10) {
          console.log(`     … et ${c.changements.length - 10} autre(s)`);
        }
      } else {
        console.log(`     (restructuration complète)`);
      }
    }
  }

  if (erreurs.length === 0 && warnings.length === 0) {
    console.log("\n✅ Aucune erreur détectée ! Tout est valide.");
  }

  if (erreurs.length > 0) {
    console.log(`\n❌ ${erreurs.length} ERREUR(S) :`);
    for (const e of erreurs) {
      console.log(`\n  📕 [${e.type}] ${e.chapitre} → ${e.exercice}`);
      console.log(`     ${e.probleme}`);
      if (e.details) console.log(`     ℹ️  ${e.details}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} AVERTISSEMENT(S) :`);
    for (const w of warnings) {
      console.log(`\n  📙 [${w.type}] ${w.chapitre} → ${w.exercice}`);
      console.log(`     ${w.probleme}`);
      if (w.details) console.log(`     ℹ️  ${w.details}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  const status = erreurs.length > 0 ? "❌ ÉCHEC" : "✅ OK";
  console.log(`Résultat : ${status} (${erreurs.length} erreur(s), ${warnings.length} avertissement(s), ${corrections.length} correction(s))`);

  process.exit(erreurs.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("💥 Erreur fatale :", err);
  process.exit(2);
});

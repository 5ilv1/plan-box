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
const corrections: { exerciceId: string; exercice: string; avant: string; apres: string }[] = [];

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

// ── Correction IA ──────────────────────────────────────────────────────────

async function corrigerExercice(ex: any): Promise<any | null> {
  const contenu = ex.contenu;
  if (!contenu) return null;

  // Rassembler les erreurs de cet exercice
  const exErreurs = erreurs.filter((e) => e.exerciceId === ex.id && e.fixable);
  if (exErreurs.length === 0) return null;

  const problemesListe = exErreurs.map((e) => `- ${e.probleme}${e.details ? ` (${e.details})` : ""}`).join("\n");

  const prompt = `Tu es un correcteur d'exercices scolaires (CE2-CM2). L'exercice ci-dessous contient des erreurs que tu dois corriger.

Type d'exercice : ${ex.type}
Titre : ${ex.titre}

Contenu actuel (JSON) :
${JSON.stringify(contenu, null, 2)}

Erreurs détectées :
${problemesListe}

INSTRUCTIONS :
- Corrige UNIQUEMENT les erreurs listées ci-dessus
- Ne change PAS la structure du JSON
- Ne change PAS les champs qui fonctionnent correctement
- Pour les QCM : assure-toi que chaque option est unique et que reponse_correcte pointe vers la bonne
- Pour les texte_a_trous : assure-toi que les positions sont correctes et les mots correspondent au texte
- Pour les exercices : assure-toi que les réponses attendues sont grammaticalement correctes

Réponds UNIQUEMENT avec le JSON corrigé, sans explication. Le JSON doit être valide et complet.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    // Extraire le JSON (peut être dans un bloc code ou brut)
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`  ⚠️  Impossible de parser la correction pour "${ex.titre}"`);
      return null;
    }

    const corrected = JSON.parse(jsonMatch[0]);
    return corrected;
  } catch (err) {
    console.log(`  ⚠️  Erreur de correction IA pour "${ex.titre}" : ${err}`);
    return null;
  }
}

async function appliquerCorrection(ex: any, contenuCorrige: any): Promise<boolean> {
  const avant = JSON.stringify(ex.contenu, null, 2).slice(0, 200);
  const apres = JSON.stringify(contenuCorrige, null, 2).slice(0, 200);

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

  corrections.push({ exerciceId: ex.id, exercice: ex.titre, avant, apres });
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes("--fix");
  const filtre = args.filter((a) => a !== "--fix").join(" ").trim();

  console.log("🧑‍🎓 Joseph — Agent de test Ma P'tite Règle");
  if (fixMode) console.log("🔧 Mode correction activé (--fix)");
  if (filtre) console.log(`🎯 Filtre : "${filtre}"`);
  console.log("=".repeat(60));

  // Récupérer les chapitres rituels
  const { data: allChapitres } = await supabase
    .from("chapitres")
    .select("id, titre")
    .eq("sous_matiere", "rituel-orthographe")
    .order("created_at");

  const chapitres = filtre
    ? (allChapitres ?? []).filter((c) => c.titre.toLowerCase().includes(filtre.toLowerCase()))
    : allChapitres;

  if (!chapitres?.length) {
    console.log("⚠️  Aucun chapitre rituel trouvé.");
    return;
  }

  console.log(`📚 ${chapitres.length} chapitre(s) rituel(s) trouvé(s)\n`);

  // Stocker les exercices pour la phase de correction
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

    for (const ex of exercices) {
      console.log(`  → ${ex.titre} (${ex.type})`);
      tousExercices.push({ ...ex, chapTitre: chap.titre });

      // 1. Vérifications structurelles
      verifierStructureExercice(chap.titre, ex);

      // 2. Vérification IA
      await verifierAvecIA(chap.titre, ex);
    }
  }

  // ── Phase de correction ────────────────────────────────────────────────
  if (fixMode && erreurs.some((e) => e.fixable)) {
    console.log("\n" + "=".repeat(60));
    console.log("🔧 PHASE DE CORRECTION");
    console.log("=".repeat(60));

    // Grouper les erreurs par exercice
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

          // Re-vérifier après correction
          console.log(`  🔄 Re-vérification…`);
          const anciennesErreurs = erreurs.length;
          ex.contenu = contenuCorrige;
          // Retirer les anciennes erreurs de cet exercice
          const idx = erreurs.findIndex((e) => e.exerciceId === exId);
          while (idx >= 0) {
            erreurs.splice(idx, 1);
            const next = erreurs.findIndex((e) => e.exerciceId === exId);
            if (next < 0) break;
          }
          // Re-vérifier
          verifierStructureExercice(ex.chapTitre, ex);
          await verifierAvecIA(ex.chapTitre, ex);
          const nouvellesErreurs = erreurs.filter((e) => e.exerciceId === exId);
          if (nouvellesErreurs.length === 0) {
            console.log(`  ✅ Aucune erreur restante`);
          } else {
            console.log(`  ⚠️  ${nouvellesErreurs.length} erreur(s) restante(s)`);
          }
        }
      } else {
        console.log(`  ⚠️  Pas de correction générée`);
      }
    }
  }

  // ── Rapport ────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("📋 RAPPORT DE TEST");
  console.log("=".repeat(60));

  if (corrections.length > 0) {
    console.log(`\n🔧 ${corrections.length} CORRECTION(S) APPLIQUÉE(S) :`);
    for (const c of corrections) {
      console.log(`\n  ✅ ${c.exercice}`);
    }
  }

  if (erreurs.length === 0 && warnings.length === 0) {
    console.log("\n✅ Aucune erreur détectée ! Tous les exercices sont valides.");
  }

  if (erreurs.length > 0) {
    console.log(`\n❌ ${erreurs.length} ERREUR(S) RESTANTE(S) :`);
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

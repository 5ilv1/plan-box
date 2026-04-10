#!/usr/bin/env npx tsx
/**
 * Agent de test automatique pour Ma P'tite Règle
 * Simule un élève qui fait les exercices et remonte les erreurs
 *
 * Usage : npx tsx scripts/test-ptite-regle.ts
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// ── Types ──────────────────────────────────────────────────────────────────

interface Erreur {
  chapitre: string;
  exercice: string;
  type: string;
  probleme: string;
  details?: string;
}

const erreurs: Erreur[] = [];
const warnings: Erreur[] = [];

function erreur(chapitre: string, exercice: string, type: string, probleme: string, details?: string) {
  erreurs.push({ chapitre, exercice, type, probleme, details });
}

function warning(chapitre: string, exercice: string, type: string, probleme: string, details?: string) {
  warnings.push({ chapitre, exercice, type, probleme, details });
}

// ── Vérifications structurelles ────────────────────────────────────────────

function verifierStructureExercice(chap: string, ex: any) {
  const contenu = ex.contenu;
  if (!contenu) {
    erreur(chap, ex.titre, ex.type, "Contenu vide (null)");
    return;
  }

  switch (ex.type) {
    case "revision": // Leçon
      if (!contenu.points_cles?.length && !contenu.contenu_html) {
        erreur(chap, ex.titre, ex.type, "Leçon sans contenu (pas de points_cles ni contenu_html)");
      }
      break;

    case "exercice": // Questions ouvertes
      if (!contenu.questions?.length) {
        erreur(chap, ex.titre, ex.type, "Aucune question");
        break;
      }
      for (let i = 0; i < contenu.questions.length; i++) {
        const q = contenu.questions[i];
        if (!q.enonce?.trim()) erreur(chap, ex.titre, ex.type, `Question ${i + 1} : énoncé vide`);
        if (!q.reponse_attendue?.trim()) erreur(chap, ex.titre, ex.type, `Question ${i + 1} : réponse attendue vide`);
        if (!q.enonce?.includes("___")) warning(chap, ex.titre, ex.type, `Question ${i + 1} : pas de trou "___" dans l'énoncé`, q.enonce);
      }
      break;

    case "texte_a_trous":
      if (!contenu.texte_complet?.trim()) {
        erreur(chap, ex.titre, ex.type, "Texte complet vide");
        break;
      }
      if (!contenu.trous?.length) {
        erreur(chap, ex.titre, ex.type, "Aucun trou défini");
        break;
      }
      // Vérifier que chaque trou a un mot et que la position est valide
      const mots = contenu.texte_complet.split(/\s+/);
      for (let i = 0; i < contenu.trous.length; i++) {
        const t = contenu.trous[i];
        if (!t.mot?.trim()) erreur(chap, ex.titre, ex.type, `Trou ${i + 1} : mot vide`);
        if (t.position == null) erreur(chap, ex.titre, ex.type, `Trou ${i + 1} : position manquante`);
        else if (t.position >= mots.length) {
          erreur(chap, ex.titre, ex.type, `Trou ${i + 1} : position ${t.position} hors du texte (${mots.length} mots)`, `Mot attendu : "${t.mot}"`);
        } else {
          // Vérifier que le mot à la position correspond (nettoyé de la ponctuation)
          const motTexte = mots[t.position]?.replace(/[.,;:!?'"()«»\-]/g, "").toLowerCase();
          const motTrou = t.mot.replace(/[.,;:!?'"()«»\-]/g, "").toLowerCase();
          if (motTexte !== motTrou) {
            erreur(chap, ex.titre, ex.type,
              `Trou ${i + 1} : position ${t.position} = "${mots[t.position]}" mais mot attendu = "${t.mot}"`,
              `Le texte contient "${motTexte}" à cette position, pas "${motTrou}"`
            );
          }
        }
      }
      // Vérifier les doublons de position
      const positions = contenu.trous.map((t: any) => t.position);
      const posSet = new Set(positions);
      if (posSet.size !== positions.length) {
        erreur(chap, ex.titre, ex.type, "Positions en doublon dans les trous");
      }
      break;

    case "qcm":
      if (!contenu.questions?.length) {
        erreur(chap, ex.titre, ex.type, "Aucune question QCM");
        break;
      }
      for (let i = 0; i < contenu.questions.length; i++) {
        const q = contenu.questions[i];
        if (!q.options?.length) {
          erreur(chap, ex.titre, ex.type, `QCM ${i + 1} : pas d'options`);
          continue;
        }
        if (q.reponse_correcte == null) {
          erreur(chap, ex.titre, ex.type, `QCM ${i + 1} : reponse_correcte manquante`);
        } else if (q.reponse_correcte < 0 || q.reponse_correcte >= q.options.length) {
          erreur(chap, ex.titre, ex.type, `QCM ${i + 1} : reponse_correcte ${q.reponse_correcte} hors range (${q.options.length} options)`);
        }
        // Vérifier qu'il n'y a pas de doublons d'options
        const optSet = new Set(q.options.map((o: string) => o.trim().toLowerCase()));
        if (optSet.size !== q.options.length) {
          warning(chap, ex.titre, ex.type, `QCM ${i + 1} : options en doublon`, q.options.join(" | "));
        }
      }
      break;

    case "ecriture_contrainte":
      if (!contenu.consigne?.trim()) erreur(chap, ex.titre, ex.type, "Consigne vide");
      if (!contenu.contraintes?.length) warning(chap, ex.titre, ex.type, "Pas de contraintes définies");
      if (!contenu.nb_phrases || contenu.nb_phrases < 1) warning(chap, ex.titre, ex.type, "nb_phrases non défini ou < 1");
      break;

    default:
      warning(chap, ex.titre, ex.type, `Type d'exercice inconnu : "${ex.type}"`);
  }
}

// ── Vérification IA : l'exercice est-il faisable et correct ? ──────────────

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
    return; // pas de vérification IA pour leçon / écriture
  }

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    // Extraire le JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]);
    if (!result.ok && result.erreurs?.length) {
      for (const e of result.erreurs) {
        const label = e.question ? `Question ${e.question}` : e.trou ? `Trou ${e.trou}` : "?";
        erreur(chap, ex.titre, ex.type, `[IA] ${label} : ${e.probleme}`);
      }
    }
  } catch (err) {
    warning(chap, ex.titre, ex.type, `Erreur lors de la vérification IA : ${err}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const filtre = process.argv.slice(2).join(" ").trim();

  console.log("🔍 Agent de test Ma P'tite Règle");
  if (filtre) console.log(`🎯 Filtre : "${filtre}"`);
  console.log("=".repeat(60));

  // Récupérer tous les chapitres rituels + leurs exercices
  let query = supabase
    .from("chapitres")
    .select("id, titre")
    .eq("sous_matiere", "rituel-orthographe")
    .order("created_at");

  const { data: allChapitres } = await query;

  // Filtrer si un argument est passé
  const chapitres = filtre
    ? (allChapitres ?? []).filter((c) => c.titre.toLowerCase().includes(filtre.toLowerCase()))
    : allChapitres;

  if (!chapitres?.length) {
    console.log("⚠️  Aucun chapitre rituel trouvé.");
    return;
  }

  console.log(`📚 ${chapitres.length} chapitre(s) rituel(s) trouvé(s)\n`);

  for (const chap of chapitres) {
    console.log(`\n📖 ${chap.titre}`);
    console.log("-".repeat(50));

    const { data: exercices } = await supabase
      .from("exercice")
      .select("id, titre, type, nb_questions, contenu, ordre")
      .eq("chapitre_id", chap.id)
      .order("ordre");

    if (!exercices?.length) {
      erreur(chap.titre, "-", "-", "Chapitre sans exercice");
      continue;
    }

    console.log(`  ${exercices.length} exercice(s)`);

    for (const ex of exercices) {
      console.log(`  → ${ex.titre} (${ex.type})`);

      // 1. Vérifications structurelles
      verifierStructureExercice(chap.titre, ex);

      // 2. Vérification IA
      await verifierAvecIA(chap.titre, ex);
    }
  }

  // ── Rapport ────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("📋 RAPPORT DE TEST");
  console.log("=".repeat(60));

  if (erreurs.length === 0 && warnings.length === 0) {
    console.log("\n✅ Aucune erreur détectée ! Tous les exercices sont valides.");
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
  console.log(`Résultat : ${status} (${erreurs.length} erreur(s), ${warnings.length} avertissement(s))`);

  process.exit(erreurs.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("💥 Erreur fatale :", err);
  process.exit(2);
});

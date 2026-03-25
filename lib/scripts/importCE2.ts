/**
 * Script d'import des problèmes CE2 depuis le fichier texte extrait du PDF.
 *
 * Usage : npm run import-ce2
 *
 * Le script :
 * 1. Lit le texte brut extrait du PDF (ce2_raw.txt)
 * 2. Découpe par période/semaine
 * 3. Envoie chaque section à Claude pour extraire les problèmes structurés
 * 4. Insère dans math_problems avec niveau='CE2'
 * 5. Appelle Claude pour calculer la réponse de chaque problème
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface RawProblem {
  periode: string;   // "P1"
  semaine: string;   // "S1"
  categorie: string; // "EF+", "Tr-", "MA", etc.
  difficulte: string; // "semaine" | "semaine_plus" | "intercale"
  enonce: string;
}

// ── Découpage du texte par sections Période/Semaine ──────────────────────────

function splitBySection(text: string): { header: string; body: string }[] {
  const sections: { header: string; body: string }[] = [];
  // Match "CE2 - PERIODE X" and "Semaine N :"
  const lines = text.split("\n");
  let currentPeriode = "";
  let currentSemaine = "";
  let currentHeader = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const periodeMatch = line.match(/CE2\s*-\s*PERIODE\s*(\d+)/i);
    if (periodeMatch) {
      currentPeriode = `P${periodeMatch[1]}`;
      continue;
    }

    const semaineMatch = line.match(/Semaine\s+(\d+)\s*:/i);
    if (semaineMatch && currentPeriode) {
      // Save previous section
      if (currentHeader && currentBody.length > 0) {
        sections.push({ header: currentHeader, body: currentBody.join("\n") });
      }
      currentSemaine = `S${semaineMatch[1]}`;
      currentHeader = `${currentPeriode}-${currentSemaine}`;
      currentBody = [line];
      continue;
    }

    // Skip noise lines
    if (line.includes("DSDEN38") || line.includes("ALLER AU SOMMAIRE") || line.includes("Page ") || line.trim() === "") continue;
    if (line.includes("SOMMAIRE") && !currentSemaine) continue;

    if (currentHeader) {
      currentBody.push(line);
    }
  }

  // Last section
  if (currentHeader && currentBody.length > 0) {
    sections.push({ header: currentHeader, body: currentBody.join("\n") });
  }

  return sections;
}

// ── Extraction des problèmes via Claude ──────────────────────────────────────

async function extractProblems(section: { header: string; body: string }): Promise<RawProblem[]> {
  const [periode, semaine] = section.header.split("-");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: `Tu es un assistant qui extrait des problèmes de maths d'un document pédagogique CE2.
Le document est organisé par semaine. Chaque semaine contient :
- 10 problèmes de base (difficulté "semaine")
- Des "Problèmes +" qui sont plus difficiles (difficulté "semaine_plus")
- Des problèmes d'autres types "à intercaler" (difficulté "intercale")
- Des "Problèmes +" des intercalés (difficulté "intercale_plus")

Les catégories sont indiquées par des abréviations :
EF+ (état final, transformation positive), EF- (état final, transformation négative),
Tr+ (transformation positive), Tr- (transformation négative),
EI+ (état initial, transformation positive), EI- (état initial, transformation négative),
P (partie), T (tout), C (comparaison), CE (comparaison état), CE* (comparaison inversée),
MA (multiplication réitérée), MR (multiplication rectangulaire),
DV (division valeur), DN (division nombre), CEx (comparaison multiplicative)

La catégorie de la semaine est indiquée dans le titre (ex: "Semaine 1 : EF+/EF-").
Pour les "révisions", chaque problème a sa propre catégorie indiquée avant l'énoncé.

Retourne un JSON array. Chaque élément : { "categorie": "...", "difficulte": "semaine"|"semaine_plus"|"intercale"|"intercale_plus", "enonce": "..." }

IMPORTANT :
- Ne retourne QUE le JSON, pas de texte autour
- Chaque énoncé doit être une phrase complète avec sa question
- Les exemples de référence (encadrés) ne sont PAS des problèmes à extraire
- Les problèmes "+" ont les mêmes catégories que les problèmes de base mais sont plus complexes
- Pour les semaines de révisions, la catégorie est indiquée devant chaque problème (ex: "Tr+ Il y avait...")`,
    messages: [{
      role: "user",
      content: `Extrais tous les problèmes de cette section.\nPériode: ${periode}, Semaine: ${semaine}\n\n${section.body}`
    }],
  });

  const text = (response.content[0] as any).text;
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`  ⚠ Pas de JSON trouvé pour ${section.header}`);
      return [];
    }
    const problems: { categorie: string; difficulte: string; enonce: string }[] = JSON.parse(jsonMatch[0]);
    return problems.map(p => ({
      periode,
      semaine,
      categorie: p.categorie,
      difficulte: p.difficulte,
      enonce: p.enonce,
    }));
  } catch (e) {
    console.error(`  ⚠ Erreur parsing JSON pour ${section.header}:`, e);
    return [];
  }
}

// ── Calcul de la réponse via Claude ──────────────────────────────────────────

async function computeAnswer(enonce: string, categorie: string): Promise<number | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: `Tu es un assistant qui résout des problèmes de mathématiques de niveau CE2 (élèves de 7-9 ans).
Lis l'énoncé et calcule la réponse correcte.
Réponds UNIQUEMENT avec le nombre résultat, rien d'autre.
Règles :
- Pas d'unité, pas de texte, pas d'explication
- Séparateur décimal : le point (ex: 12.5 et non 12,5)
- Si l'énoncé demande plusieurs valeurs, donne uniquement le nombre répondant à la question finale`,
      messages: [{ role: "user", content: `Énoncé : ${enonce}\nType de problème : ${categorie}` }],
    });
    const text = (response.content[0] as any).text.trim();
    const num = parseFloat(text.replace(",", "."));
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📚 Import des problèmes CE2 depuis le PDF...\n");

  const rawText = readFileSync(resolve(__dirname, "ce2_raw.txt"), "utf-8");
  const sections = splitBySection(rawText);
  console.log(`📄 ${sections.length} sections trouvées\n`);

  let totalInserted = 0;
  let totalErrors = 0;

  for (const section of sections) {
    console.log(`── ${section.header} ──`);

    // Extract problems
    const problems = await extractProblems(section);
    console.log(`  ${problems.length} problèmes extraits`);

    if (problems.length === 0) continue;

    // Compute answers in batches of 5
    const withAnswers: { enonce: string; categorie: string; difficulte: string; periode: string; semaine: string; reponse: number | null }[] = [];

    for (let i = 0; i < problems.length; i += 5) {
      const batch = problems.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(p => computeAnswer(p.enonce, p.categorie).then(r => ({ ...p, reponse: r })))
      );
      withAnswers.push(...results);

      if (i + 5 < problems.length) {
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      }
    }

    // Insert into database
    const rows = withAnswers.map(p => ({
      periode: p.periode,
      semaine: p.semaine,
      categorie: p.categorie,
      niveau: "CE2",
      difficulte: p.difficulte,
      enonce: p.enonce,
      reponse: p.reponse,
    }));

    const { error } = await supabase.from("math_problems").insert(rows);
    if (error) {
      console.error(`  ⚠ Erreur insertion:`, error.message);
      totalErrors += rows.length;
    } else {
      console.log(`  ✅ ${rows.length} problèmes insérés (${withAnswers.filter(p => p.reponse !== null).length} avec réponse)`);
      totalInserted += rows.length;
    }

    // Pause between sections
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n══════════════════════════════════`);
  console.log(`✅ Total insérés : ${totalInserted}`);
  console.log(`⚠  Total erreurs : ${totalErrors}`);
  console.log(`══════════════════════════════════`);
}

main().catch(console.error);

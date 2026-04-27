#!/usr/bin/env npx tsx
/**
 * Recalcule les réponses des problèmes mis en quarantaine (reponse = NULL).
 *
 * Pour chaque énoncé, Claude :
 *  1. Décide si la question attend UNE seule réponse numérique
 *  2. Si oui, calcule le résultat
 *  3. Sinon, renvoie INVALID (le problème reste hors-jeu)
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/fix-math-answers.ts
 *   ... -- --dry-run   pour ne rien écrire en BDD
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);
const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

const DRY_RUN = process.argv.includes("--dry-run");

const SYSTEM = `Tu es un correcteur de problèmes de mathématiques pour des élèves de primaire (CE2-CM2).

On te donne un énoncé. Tu dois :
1. Déterminer si la question attend UNE SEULE réponse numérique (un nombre, en unité demandée).
2. Si oui, calculer la réponse exacte.
3. Sinon (énoncé incohérent, plusieurs valeurs demandées, question ouverte), renvoyer INVALID.

Réponds STRICTEMENT au format JSON :
{"valid": true, "answer": <nombre>}        // une seule réponse numérique
{"valid": false, "reason": "<raison>"}     // sinon

Règles :
- "answer" est un nombre (pas une chaîne), avec . comme séparateur décimal.
- N'inclus jamais d'unité dans answer.
- Si plusieurs valeurs sont attendues (ex : "combien de jonquilles, tulipes et jacinthes ?"), c'est INVALID.
- Si l'énoncé est contradictoire ou impossible, c'est INVALID.
- Pour un résultat négatif sur une question "combien de plus / combien de moins", c'est INVALID (l'énoncé est mal posé).`;

interface Result {
  id: string;
  enonce: string;
  niveau: string;
  status: "fixed" | "invalid" | "error";
  newAnswer?: number;
  reason?: string;
}

async function askClaude(enonce: string): Promise<{ valid: boolean; answer?: number; reason?: string }> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content: `Énoncé :\n${enonce}` }],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Pas de JSON dans la réponse: ${text}`);
  return JSON.parse(match[0]);
}

async function main() {
  const { data: problems, error } = await supabase
    .from("math_problems")
    .select("id, niveau, periode, semaine, enonce")
    .is("reponse", null);

  if (error) throw error;
  if (!problems?.length) {
    console.log("Aucun problème en quarantaine.");
    return;
  }

  console.log(`${problems.length} problèmes à recalculer${DRY_RUN ? " (dry-run)" : ""}.\n`);

  const results: Result[] = [];

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const tag = `[${i + 1}/${problems.length}] ${p.niveau} ${p.periode}/${p.semaine}`;
    try {
      const r = await askClaude(p.enonce);
      if (r.valid && typeof r.answer === "number" && Number.isFinite(r.answer)) {
        if (!DRY_RUN) {
          const { error: upErr } = await supabase
            .from("math_problems")
            .update({ reponse: r.answer })
            .eq("id", p.id);
          if (upErr) throw upErr;
        }
        console.log(`${tag} ✓ ${r.answer}  — ${p.enonce.slice(0, 70)}…`);
        results.push({ id: p.id, enonce: p.enonce, niveau: p.niveau, status: "fixed", newAnswer: r.answer });
      } else {
        console.log(`${tag} ✗ INVALID (${r.reason ?? "?"}) — ${p.enonce.slice(0, 70)}…`);
        results.push({ id: p.id, enonce: p.enonce, niveau: p.niveau, status: "invalid", reason: r.reason });
      }
    } catch (e: any) {
      console.log(`${tag} ! erreur: ${e.message}`);
      results.push({ id: p.id, enonce: p.enonce, niveau: p.niveau, status: "error", reason: e.message });
    }
  }

  const fixed = results.filter((r) => r.status === "fixed").length;
  const invalid = results.filter((r) => r.status === "invalid").length;
  const errored = results.filter((r) => r.status === "error").length;
  console.log(`\nRésumé : ${fixed} corrigés · ${invalid} invalides · ${errored} erreurs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

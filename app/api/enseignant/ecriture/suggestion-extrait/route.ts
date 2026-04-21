import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnseignant } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { REFERENCE_CYCLE3 } from "@/lib/ecriture-reference-cycle3";
import { niveauEleveDepuisBloc } from "@/lib/ecriture-niveau-eleve";

/**
 * POST /api/enseignant/ecriture/suggestion-extrait
 *
 * Renvoie UNE suggestion de correction (+ commentaire pédagogique) pour un
 * passage précisément sélectionné par l'enseignant dans le texte d'un élève.
 *
 * Body : { blocId?, extrait, contexte?, sujet? }
 * → { suggestion: string, commentaire: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { blocId, extrait, contexte, sujet } = (await req.json()) as {
    blocId?: string;
    extrait?: string;
    contexte?: string;
    sujet?: string;
  };

  if (!extrait?.trim()) {
    return NextResponse.json({ erreur: "extrait requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  let niveau: "CE2" | "CM1" | "CM2" = "CM1";
  if (blocId) {
    try {
      niveau = await niveauEleveDepuisBloc(admin, blocId);
    } catch {}
  }

  // Corrections déjà posées par l'enseignant
  let correctionsEnseignant = "";
  try {
    const { data: rows } = await admin
      .from("ecriture_corrections_enseignant")
      .select("extrait, suggestion, commentaire")
      .order("created_at", { ascending: false })
      .limit(200);
    if (rows && rows.length > 0) {
      const vues = new Set<string>();
      const lignes: string[] = [];
      for (const r of rows) {
        const key = `${r.extrait}→${r.suggestion}`;
        if (vues.has(key)) continue;
        vues.add(key);
        lignes.push(
          `- « ${r.extrait} » → « ${r.suggestion} »${r.commentaire ? ` (${r.commentaire})` : ""}`
        );
      }
      if (lignes.length > 0) {
        correctionsEnseignant = `\n\n## Corrections déjà posées par l'enseignant\n\nInspire-toi de ces corrections pour rester cohérent avec les habitudes pédagogiques de l'enseignant.\n\n${lignes.join("\n")}`;
      }
    }
  } catch {}

  const systemDynamique = `Tu es un professeur des écoles qui corrige le texte d'un élève de ${niveau} (${niveau === "CE2" ? "8-9" : niveau === "CM1" ? "9-10" : "10-11"} ans).

L'enseignant a sélectionné UN passage précis qu'il juge à corriger. Ton rôle : lui proposer UNE correction pour ce passage + UN commentaire pédagogique bienveillant adapté au niveau ${niveau}.

Retourne UNIQUEMENT un objet JSON :
{
  "suggestion": "la correction proposée (aussi courte que possible, uniquement le passage corrigé)",
  "commentaire": "UNE phrase pédagogique courte et bienveillante adaptée au niveau ${niveau}"
}

RÈGLES :
- "suggestion" ne contient QUE la version corrigée du passage, sans guillemets, sans préambule
- "commentaire" est encourageant, jamais négatif
- Tiens compte du contexte (phrase complète) pour proposer une correction cohérente
- Si le passage est déjà correct, propose la même chose avec un commentaire confirmant
- Retourne UNIQUEMENT le JSON, rien d'autre`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: [
        {
          type: "text",
          text: REFERENCE_CYCLE3,
          cache_control: { type: "ephemeral" },
        },
        ...(correctionsEnseignant
          ? [
              {
                type: "text" as const,
                text: correctionsEnseignant,
                cache_control: { type: "ephemeral" as const },
              },
            ]
          : []),
        {
          type: "text",
          text: systemDynamique,
        },
      ],
      messages: [
        {
          role: "user",
          content: `${sujet ? `Sujet imposé : « ${sujet} »\n\n` : ""}Niveau : ${niveau}\n\n${contexte ? `Contexte (texte complet de l'élève) :\n\n${contexte}\n\n` : ""}Passage sélectionné à corriger : « ${extrait} »`,
        },
      ],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ suggestion: "", commentaire: "" });
    }
    const parsed = JSON.parse(jsonMatch[0]) as { suggestion?: string; commentaire?: string };
    return NextResponse.json({
      suggestion: (parsed.suggestion ?? "").trim(),
      commentaire: (parsed.commentaire ?? "").trim(),
    });
  } catch (err) {
    console.error("[ecriture/suggestion-extrait]", err);
    return NextResponse.json({ erreur: "Erreur IA", suggestion: "", commentaire: "" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { REFERENCE_CYCLE3 } from "@/lib/ecriture-reference-cycle3";
import { niveauEleveDepuisBloc } from "@/lib/ecriture-niveau-eleve";
import { getServerUser } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/ecriture/analyser
 *
 * Analyse le texte de l'élève et retourne la liste des erreurs détectées.
 *
 * Body : {
 *   texte: string,
 *   sujet?: string,
 *   blocId?: string,                // pour récupérer le niveau de l'élève
 *   erreurs_precedentes?: Erreur[], // rétro-compat
 *   jour?: number                   // rétro-compat (ignoré dans le nouveau flux)
 * }
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });
  }
  const limited = rateLimit(req, { key: "ecriture-analyser", max: 30, windowSec: 60, identifier: user.id });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  const texte = body.texte as string;
  const sujet = body.sujet as string | undefined;
  const blocId = body.blocId as string | undefined;
  const erreurs_precedentes = body.erreurs_precedentes as Array<{ mot: string; type: string; indice?: string; correction?: string }> | undefined;

  if (!texte?.trim()) {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  // Récupérer le niveau de l'élève (CE2 / CM1 / CM2) si on a le bloc
  let niveau: "CE2" | "CM1" | "CM2" = "CM1";
  if (blocId) {
    try {
      niveau = await niveauEleveDepuisBloc(createAdminClient(), blocId);
    } catch {}
  }

  let contextePrecedent = "";
  if (erreurs_precedentes && erreurs_precedentes.length > 0) {
    contextePrecedent =
      "\n\nERREURS DÉJÀ SIGNALÉES PRÉCÉDEMMENT (si encore présentes, mets la correction dans le champ 'correction') :\n" +
      erreurs_precedentes
        .map(
          (e, i) =>
            `${i + 1}. [${e.type}] "${e.mot}"${e.indice ? ` — Indice : "${e.indice}"` : ""}${e.correction ? ` — Correction : "${e.correction}"` : ""}`
        )
        .join("\n");
  }

  const systemDynamique = `Tu es un correcteur de français expert et bienveillant pour un élève de ${niveau} (${niveau === "CE2" ? "8-9" : niveau === "CM1" ? "9-10" : "10-11"} ans).

Analyse le texte et identifie TOUTES les erreurs du niveau ${niveau} en t'appuyant sur le référentiel fourni en amont. Adapte ton exigence au niveau : ne signale pas des notions qui dépassent le programme de ${niveau}.

Catégories :
- "orthographe" : mots mal orthographiés OU qui n'existent pas en français (anglicismes, fautes lexicales)
- "grammaire" : accords, conjugaisons, accords en genre/nombre dans le groupe nominal
- "syntaxe" : ponctuation manquante, majuscules oubliées, phrases mal construites

RÈGLE CRITIQUE — POSITIONS EXACTES :
- Signale CHAQUE occurrence séparément si un mot erroné apparaît plusieurs fois
- "position" = index EXACT du premier caractère du mot dans le texte (commence à 0)
- texte.substring(position, position + mot.length).toLowerCase() doit être égal au mot signalé (en minuscule)

Pour CHAQUE erreur, retourne un objet JSON :
- "mot" : le mot erroné tel qu'il apparaît dans le texte
- "type" : "orthographe" | "grammaire" | "syntaxe"
- "position" : index exact du premier caractère du mot
- "indice" : indice pédagogique adapté au niveau ${niveau}, SANS donner la réponse la 1re fois
- "correction" : forme correcte (UNIQUEMENT si erreur déjà signalée auparavant et toujours présente)
${contextePrecedent}

Maximum 20 erreurs, priorise les plus pédagogiques.
Retourne UNIQUEMENT un JSON array, rien d'autre.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: REFERENCE_CYCLE3,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: systemDynamique,
        },
      ],
      messages: [
        {
          role: "user",
          content: `${sujet ? `Sujet : "${sujet}"\n\n` : ""}Niveau : ${niveau}\n\nTexte à corriger :\n\n${texte}`,
        },
      ],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text;
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ erreurs: [] });
    }

    const erreurs = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ erreurs, niveau });
  } catch (err) {
    console.error("[ecriture/analyser]", err);
    return NextResponse.json({ erreurs: [] });
  }
}

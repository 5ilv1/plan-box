import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * POST /api/enseignant/suivi/ia
 *
 * Génère 3 forces + 3 faiblesses à partir d'une liste {libelle, pourcentage}.
 * Endpoint séparé pour ne pas bloquer l'affichage des % côté UI : la page
 * affiche les chiffres dès que /suivi répond, l'IA arrive ensuite.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = (await req.json()) as {
    domaines?: Array<{ libelle: string; pourcentage: number | null }>;
    contexte?: string;
  };
  const filtres = (body.domaines ?? []).filter((d) => d.pourcentage !== null);
  if (filtres.length < 3) return NextResponse.json({ forces: [], faiblesses: [] });

  try {
    const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const rep = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `Tu analyses les résultats ${body.contexte ?? "d'un élève"}. Voici les pourcentages de réussite par sous-domaine :
${filtres.map((d) => `- ${d.libelle} : ${d.pourcentage}%`).join("\n")}

Donne 3 FORCES et 3 FAIBLESSES, formulées comme des phrases courtes destinées au maître pour piloter sa pédagogie. Reste factuel.

Retourne UNIQUEMENT un JSON :
{ "forces": ["...", "...", "..."], "faiblesses": ["...", "...", "..."] }`,
        },
      ],
    });
    const raw = (rep.content[0] as { type: string; text: string }).text;
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ forces: [], faiblesses: [] });
    const parsed = JSON.parse(m[0]) as { forces?: string[]; faiblesses?: string[] };
    return NextResponse.json({
      forces: (parsed.forces ?? []).slice(0, 3),
      faiblesses: (parsed.faiblesses ?? []).slice(0, 3),
    });
  } catch (err) {
    console.error("[suivi/ia]", err);
    return NextResponse.json({ forces: [], faiblesses: [] });
  }
}

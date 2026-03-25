import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY! });

export async function POST(req: NextRequest) {
  const { enonce, wrong_answer, categorie, attempt } = await req.json();
  if (!enonce || wrong_answer === undefined) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const systemPrompt = (attempt ?? 0) >= 3
    ? `Tu es un assistant pédagogique pour des élèves de cycle 3 (CM1/CM2).
L'élève n'a pas trouvé après 3 essais. Explique la démarche de résolution en 3-4 phrases simples. Donne la réponse finale clairement à la dernière phrase.`
    : `Tu es un assistant pédagogique pour des élèves de cycle 3 (CM1/CM2), âgés de 8 à 11 ans. Un élève a mal répondu à un problème de maths.
Donne un indice en 2-3 phrases maximum.
Règles absolues :
- Ne jamais donner la réponse ni un calcul qui y mène directement
- Identifier l'erreur probable de raisonnement
- Vocabulaire simple adapté à un enfant de 8-11 ans
- Terminer par une question courte qui relance la réflexion`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: systemPrompt,
    messages: [{ role: "user", content: `Problème : ${enonce}\nRéponse donnée par l'élève : ${wrong_answer}\nType de problème : ${categorie}` }],
  });

  const hint = (message.content[0] as any).text;
  return NextResponse.json({ hint });
}

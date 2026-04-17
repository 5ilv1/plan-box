import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pdfBase64 } = body;

    if (!pdfBase64) {
      return NextResponse.json({ erreur: "PDF manquant." }, { status: 400 });
    }

    const systemPrompt = `Tu es un expert en analyse de livres jeunesse.

À partir du PDF fourni, identifie TOUS les chapitres du livre et extrais leur texte intégral.

RÈGLES STRICTES :
- Identifie chaque chapitre comme une unité narrative (numéro + titre quand il y a).
- Ignore : pages de garde, table des matières, remerciements, dédicaces, 4e de couverture.
- Inclure : prologue, épilogue (en tant que chapitres à part entière).
- Pour chaque chapitre, extrais le texte COMPLET tel qu'écrit dans le livre, proprement formaté en paragraphes.
- Préserve la ponctuation, les dialogues, les sauts de paragraphes.
- NE PAS résumer, NE PAS paraphraser, NE PAS abréger — texte intégral.
- Si un chapitre n'a pas de titre, utilise "Chapitre N" (ou "Prologue"/"Épilogue" selon le cas).

Réponds UNIQUEMENT en JSON valide, sans backticks, avec cette structure :
{
  "titre_livre": "Titre du livre (si détecté)",
  "auteur": "Auteur (si détecté, sinon null)",
  "chapitres": [
    {
      "ordre": 1,
      "titre": "Chapitre 1 — Le départ",
      "texte": "Texte complet du chapitre..."
    }
  ]
}`;

    // Streaming obligatoire pour max_tokens élevé (SDK bloque sinon)
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 64000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: "Extrais tous les chapitres de ce livre avec leur texte intégral." },
          ],
        },
      ],
    });

    const finalMessage = await stream.finalMessage();
    const text = (finalMessage.content[0] as { type: "text"; text: string }).text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const resultat = JSON.parse(cleaned);

    if (!Array.isArray(resultat.chapitres) || resultat.chapitres.length === 0) {
      return NextResponse.json({ erreur: "Aucun chapitre détecté dans le PDF." }, { status: 500 });
    }

    // Ajoute un nbMots par chapitre pour affichage
    for (const c of resultat.chapitres) {
      c.nb_mots = (c.texte ?? "").split(/\s+/).filter(Boolean).length;
    }

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[extraire-chapitres-livre]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

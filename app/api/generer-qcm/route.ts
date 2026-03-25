import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: NextRequest) {
  const { transcript, titre, nbQuestions = 10 } = await req.json();

  if (!transcript || typeof transcript !== "string" || transcript.trim().length < 50) {
    return NextResponse.json(
      { erreur: "Transcription trop courte ou manquante (minimum 50 caractères)." },
      { status: 400 }
    );
  }

  const prompt = `Tu es un enseignant de primaire français expert en création d'évaluations.
À partir de la transcription suivante${titre ? ` du podcast "${titre}"` : ""}, crée exactement ${nbQuestions} questions à choix multiple pour vérifier la compréhension des élèves de CM1/CM2.

TRANSCRIPTION :
${transcript.trim()}

RÈGLES STRICTES :
- Chaque question porte sur un fait ou une idée explicitement mentionné dans la transcription
- Chaque question a exactement 4 propositions (A, B, C, D)
- Une seule bonne réponse par question
- Les mauvaises réponses doivent être plausibles mais clairement incorrectes
- Langage simple, adapté à des élèves de 8-11 ans
- Inclure une courte explication de la bonne réponse (1-2 phrases max)

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans texte avant ou après) :
{
  "questions": [
    {
      "question": "Question ici ?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "reponse_correcte": 0,
      "explication": "Explication courte."
    }
  ]
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text
      .trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");

    const parsed = JSON.parse(raw);

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error("Format inattendu : pas de tableau 'questions'");
    }

    const qcm_id = crypto.randomUUID();
    return NextResponse.json({ questions: parsed.questions, qcm_id });
  } catch (err) {
    console.error("[generer-qcm] Erreur :", err);
    return NextResponse.json(
      { erreur: "Erreur lors de la génération du QCM : " + String(err) },
      { status: 500 }
    );
  }
}

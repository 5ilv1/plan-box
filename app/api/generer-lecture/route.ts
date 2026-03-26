import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { niveau, nbQuestions, texte, titre, description, pdfBase64 } = body;

    if (!texte && !pdfBase64) {
      return NextResponse.json({ erreur: "Il faut un texte ou un PDF." }, { status: 400 });
    }

    const nbQ = nbQuestions || 10;

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) expert en compréhension de lecture.

À partir du texte fourni, génère exactement ${nbQ} questions de compréhension au format QCM (4 choix chacune).

Niveau : ${niveau}
${titre ? `Titre du texte : ${titre}` : ""}
${description ? `Consignes de l'enseignant : ${description}` : ""}

RÈGLES STRICTES :
- Exactement ${nbQ} questions
- 4 choix par question, une seule bonne réponse
- Les questions doivent couvrir :
  * Compréhension littérale (qui, quoi, où, quand)
  * Inférences (pourquoi, comment, que pense le personnage)
  * Vocabulaire (sens d'un mot dans le contexte)
  * Chronologie (dans quel ordre les événements se produisent)
- Les mauvaises réponses doivent être plausibles mais clairement fausses
- Vocabulaire adapté au niveau ${niveau} (8-11 ans)
- Les questions doivent suivre l'ordre du texte autant que possible
- NE PAS donner la réponse dans la formulation de la question
- Varier les types de questions (pas que du "qui a fait quoi")

${!texte && pdfBase64 ? "Le texte est dans le PDF ci-joint. Extrais-le et génère les questions." : ""}

Réponds UNIQUEMENT en JSON valide, sans backticks :
{
  "titre": "Titre de la lecture",
  "texte": "Le texte complet tel qu'il sera affiché à l'élève (reformaté proprement, avec paragraphes)",
  "questions": [
    {
      "id": 1,
      "question": "Question claire et précise ?",
      "choix": ["Réponse A", "Réponse B", "Réponse C", "Réponse D"],
      "reponse": 0
    }
  ]
}

IMPORTANT :
- "reponse" est l'INDEX (0-3) de la bonne réponse dans le tableau "choix"
- Le champ "texte" doit contenir le texte complet et bien formaté
- Si un titre est fourni, utilise-le ; sinon invente un titre pertinent
- VÉRIFIE que chaque "reponse" correspond bien à la bonne réponse`;

    const messages: Anthropic.MessageParam[] = [];

    if (pdfBase64) {
      messages.push({
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: `Génère ${nbQ} questions QCM de compréhension pour ce texte de lecture, niveau ${niveau}.${description ? ` ${description}` : ""}` },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Voici le texte de lecture :\n\n${texte}\n\nGénère ${nbQ} questions QCM de compréhension, niveau ${niveau}.${description ? ` ${description}` : ""}`,
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: systemPrompt,
      messages,
    });

    const text = (response.content[0] as { type: "text"; text: string }).text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const resultat = JSON.parse(cleaned);

    if (!Array.isArray(resultat.questions) || resultat.questions.length === 0) {
      return NextResponse.json({ erreur: "Aucune question générée." }, { status: 500 });
    }

    // Si le texte est fourni par l'utilisateur et pas de PDF, le garder tel quel
    if (texte && !pdfBase64) {
      resultat.texte = texte;
    }

    // Valider les réponses
    for (const q of resultat.questions) {
      if (typeof q.reponse !== "number" || q.reponse < 0 || q.reponse >= q.choix.length) {
        q.reponse = 0; // Fallback sécurité
      }
    }

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-lecture]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

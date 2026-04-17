import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      niveau = "CM1",
      matiere = "",
      sous_matiere = "",
      theme = "",
      consigne = "",
      titre = "",
      nbQuestions = 10,
    } = body;

    if (!theme.trim() && !sous_matiere.trim() && !consigne.trim()) {
      return NextResponse.json(
        { erreur: "Donne un thème, une sous-matière ou une consigne pour générer le QCM." },
        { status: 400 }
      );
    }

    const nbQ = Math.min(Math.max(parseInt(String(nbQuestions), 10) || 10, 3), 20);

    const systemPrompt = `Tu es un enseignant de primaire (CE2/CM1/CM2) expert en création de QCM pédagogiques.

Génère exactement ${nbQ} questions à choix multiple adaptées au niveau ${niveau}.

${matiere ? `Matière : ${matiere}` : ""}
${sous_matiere ? `Sous-matière / notion : ${sous_matiere}` : ""}
${theme ? `Thème : ${theme}` : ""}
${consigne ? `Consignes spécifiques de l'enseignant : ${consigne}` : ""}

RÈGLES STRICTES :
- Exactement ${nbQ} questions
- Chaque question a exactement 4 options
- Une seule bonne réponse par question
- La position de la bonne réponse doit varier aléatoirement entre 0, 1, 2 et 3
- Les mauvaises réponses doivent être plausibles mais clairement fausses
- Vocabulaire adapté à des élèves de 8-11 ans
- Courte explication (1-2 phrases) pour chaque bonne réponse
- NE PAS donner la réponse dans la formulation de la question

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans texte autour) :
{
  "titre": "Titre du QCM",
  "questions": [
    {
      "question": "Question ?",
      "options": ["A", "B", "C", "D"],
      "reponse_correcte": 0,
      "explication": "Courte explication."
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Génère le QCM demandé.${titre ? ` Titre suggéré : ${titre}.` : ""}`,
        },
      ],
    });

    const raw = (response.content[0] as { type: "text"; text: string }).text
      .trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json({ erreur: "Aucune question générée." }, { status: 500 });
    }

    // Validation + mélange des positions
    const questions = parsed.questions.map((q: any) => {
      const options: string[] = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      while (options.length < 4) options.push("—");
      let idx = typeof q.reponse_correcte === "number" ? q.reponse_correcte : 0;
      if (idx < 0 || idx >= 4) idx = 0;
      const bonne = options[idx];
      const perm = [0, 1, 2, 3];
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      const newOptions = perm.map((p) => options[p]);
      return {
        question: String(q.question ?? ""),
        options: newOptions,
        reponse_correcte: newOptions.indexOf(bonne),
        explication: q.explication ? String(q.explication) : undefined,
      };
    });

    const resultat = {
      titre: parsed.titre || titre || "QCM",
      questions,
    };

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-qcm-theme]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

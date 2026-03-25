import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// POST { type: "exercice" | "calcul_mental", titre, consigne?, nbElements, matiere?, niveau? }
export async function POST(req: NextRequest) {
  const { type, titre, consigne, nbElements = 10, matiere = "", niveau = "CM" } = await req.json();

  let prompt = "";

  if (type === "exercice") {
    prompt = `Tu es un assistant pédagogique pour une école primaire française (niveau ${niveau}${matiere ? ", " + matiere : ""}).
Génère un exercice intitulé "${titre}"${consigne ? ` avec la consigne : "${consigne}"` : ""}.
Nombre de questions : ${nbElements}.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format :
{
  "titre": "${titre}",
  "consigne": "La consigne générale",
  "questions": [
    { "id": 1, "enonce": "Texte de la question", "reponse_attendue": "Réponse courte", "indice": "" }
  ]
}

Règles :
- Langage simple, adapté à des enfants de 8-11 ans
- Questions progressives
- Réponses courtes et vérifiables`;
  } else {
    prompt = `Tu génères une série de calculs mentaux pour des élèves de ${niveau} en école primaire française.
Thème / titre : "${titre}".
Nombre de calculs : ${nbElements}.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format :
{
  "calculs": [
    { "id": 1, "enonce": "7 × 8 =", "reponse": "56" }
  ]
}

Règles :
- Calculs cohérents avec le titre (ex : "table du 4" → multiplications par 4)
- Résultats entiers uniquement
- Varier les structures (ex. "3 × ? = 21" parfois)`;
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const texte = message.content[0].type === "text" ? message.content[0].text : "";
    const json = texte.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return NextResponse.json({ resultat: JSON.parse(json) });
  } catch (err) {
    console.error("[regenerer-exercice]", err);
    return NextResponse.json({ erreur: "Échec de la génération." }, { status: 500 });
  }
}

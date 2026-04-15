import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { validerReponsesExercice } from "@/lib/valider-reponses-exercice";

const client = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export const maxDuration = 60;

// POST { type, titre, consigne?, nbElements, matiere?, niveau? }
// ou   { type, titre, contenu, prompt }  → regénération avec instructions personnalisées
export async function POST(req: NextRequest) {
  const body = await req.json();

  // ── Mode regénération avec prompt personnalisé ──
  if (body.prompt && body.contenu) {
    const { type, titre, contenu, prompt: userPrompt } = body;

    const systemPrompt = `Tu es un assistant pédagogique pour une école primaire française (CE2-CM2).
L'enseignant te demande de REGÉNÉRER un exercice existant en suivant ses instructions.

Type d'exercice : ${type}
Titre : ${titre}

Contenu actuel (JSON) :
${JSON.stringify(contenu, null, 2)}

Instructions de l'enseignant :
${userPrompt}

INSTRUCTIONS :
- Regénère le contenu en respectant les instructions de l'enseignant
- Garde le même format JSON que le contenu actuel
- Garde la même structure (mêmes champs)
- Adapte le contenu aux élèves de CE2-CM2

Réponds UNIQUEMENT avec le JSON regénéré, sans explication.`;

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: systemPrompt }],
      });

      const texte = message.content[0].type === "text" ? message.content[0].text : "";
      const json = texte.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      const contenuRegen = JSON.parse(json);
      return NextResponse.json({ contenu: contenuRegen });
    } catch (err) {
      console.error("[regenerer-exercice] regen:", err);
      return NextResponse.json({ erreur: "Échec de la regénération." }, { status: 500 });
    }
  }

  // ── Mode génération classique (from scratch) ──
  const { type, titre, consigne, nbElements = 10, matiere = "", niveau = "CM" } = body;

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
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const texte = message.content[0].type === "text" ? message.content[0].text : "";
    const json = texte.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    let resultat = JSON.parse(json);
    resultat = await validerReponsesExercice(resultat, type, client);
    return NextResponse.json({ resultat });
  } catch (err) {
    console.error("[regenerer-exercice]", err);
    return NextResponse.json({ erreur: "Échec de la génération." }, { status: 500 });
  }
}

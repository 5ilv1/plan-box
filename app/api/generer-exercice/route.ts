import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ParamsGeneration } from "@/types";

const client = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

function promptExercice(p: Extract<ParamsGeneration, { type: "exercice" }>): string {
  return `Tu es un assistant pédagogique pour une école primaire française.
Tu génères des exercices adaptés au niveau ${p.niveauNom} (${p.matiere}).
Chapitre : ${p.chapitreTitre}.
Difficulté : ${p.difficulte}.
Nombre de questions : ${p.nbQuestions}.
${p.contexte ? `Thème souhaité : ${p.contexte}` : ""}
${(p as any).consigneDetaillee ? `\nConsigne de l'enseignant (à suivre impérativement) :\n${(p as any).consigneDetaillee}` : ""}
${p.modele ? `Génère dans le style de cet exercice modèle :\n${p.modele}` : ""}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "titre": "Titre court de l'exercice",
  "consigne": "La consigne générale",
  "questions": [
    {
      "id": 1,
      "enonce": "Texte de la question",
      "reponse_attendue": "La réponse correcte",
      "indice": "Un indice optionnel si besoin"
    }
  ]
}

Règles :
- Langage simple, adapté à des enfants de 8-11 ans
- Pas de violence, pas de sujets sensibles
- Questions progressives en difficulté
- Réponses courtes et vérifiables`;
}

function promptCalcMental(p: Extract<ParamsGeneration, { type: "calcul_mental" }>): string {
  return `Tu génères une série de calculs mentaux pour des élèves de ${p.niveauNom} en école primaire française.
Opérations : ${p.operations.join(", ")}.
${p.table ? `Table ciblée : ${p.table}` : ""}
Nombre de calculs : ${p.nbCalculs}.
Difficulté : ${p.difficulte}.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "calculs": [
    { "id": 1, "enonce": "7 × 8 =", "reponse": "56" },
    { "id": 2, "enonce": "45 + 37 =", "reponse": "82" }
  ]
}

Règles :
- Calculs réalistes pour le niveau
- Pas de nombres négatifs pour CE2
- Résultats entiers uniquement
- Varier les structures (ex. "3 × ? = 21" parfois)`;
}

export async function POST(req: NextRequest) {
  try {
    const params: ParamsGeneration = await req.json();

    if (params.type === "ressource" || params.type === "dictee") {
      return NextResponse.json({ erreur: "Ce type ne passe pas par cette route." }, { status: 400 });
    }

    const prompt =
      params.type === "exercice"
        ? promptExercice(params)
        : promptCalcMental(params);

    // Construire le contenu du message (texte + PDF optionnel)
    const contentParts: any[] = [];

    // Si un PDF modèle est fourni, l'envoyer à Claude
    if (params.type === "exercice" && (params as any).pdfModeleBase64) {
      contentParts.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: (params as any).pdfModeleBase64,
        },
      });
      contentParts.push({
        type: "text",
        text: "Voici un PDF d'exercice modèle. Inspire-toi du style, du format et du niveau de difficulté de ce document pour générer l'exercice demandé.\n\n" + prompt,
      });
    } else {
      contentParts.push({ type: "text", text: prompt });
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: contentParts }],
    });

    const texte =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Nettoyage éventuel de balises markdown
    const json = texte
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const resultat = JSON.parse(json);
    return NextResponse.json({ resultat });
  } catch (err) {
    console.error("Erreur génération exercice:", err);
    return NextResponse.json(
      { erreur: "Échec de la génération. Réessaie." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

/**
 * POST /api/chapitres/exercices/corriger-ecriture
 * Analyse le texte de l'élève par rapport aux contraintes de l'exercice.
 * Body: { texte, consigne, contraintes, nb_phrases, tentative }
 * tentative: 1 = première soumission (indices), 2 = deuxième soumission (validation finale)
 */
export async function POST(req: NextRequest) {
  try {
    const { texte, consigne, contraintes, nb_phrases, tentative } = await req.json();

    if (!texte || !consigne || !contraintes) {
      return NextResponse.json({ error: "texte, consigne et contraintes requis" }, { status: 400 });
    }

    const estDeuxiemeTentative = tentative === 2;

    const prompt = `Tu es un enseignant bienveillant de français en école primaire.

Un élève devait écrire ${nb_phrases || 3} phrases en respectant cette consigne :
"${consigne}"

Les contraintes à vérifier :
${(contraintes as string[]).map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

Voici le texte de l'élève :
"""
${texte}
"""

${estDeuxiemeTentative
  ? `C'est la DEUXIÈME tentative de l'élève (il a déjà corrigé une première fois).
Sois plus strict : si des erreurs persistent, indique-les clairement.`
  : `C'est la PREMIÈRE tentative de l'élève.
Donne des indices pédagogiques pour l'aider à se corriger, sans donner la réponse directement.`}

Analyse le texte et réponds en JSON valide :
{
  "nb_phrases_ecrites": <nombre de phrases détectées>,
  "valide": <true si le texte respecte TOUTES les contraintes et contient le bon nombre de phrases, false sinon>,
  "erreurs": [
    {
      "phrase": "la phrase complète de l'élève contenant l'erreur",
      "type": "conjugaison|orthographe|grammaire|contrainte_non_respectee|nombre_phrases",
      "mot_concerne": "le mot ou groupe de mots EXACT tel qu'écrit par l'élève (OBLIGATOIRE)",
      "indice": "${estDeuxiemeTentative ? "La correction : mot_concerne → mot corrigé" : "un indice pédagogique COURT pour aider l'élève à corriger ce mot précis"}"
    }
  ],
  "commentaire": "un bref commentaire encourageant pour l'élève (1-2 phrases)",
  "score": <nombre de contraintes respectées sur le total>
}

Règles d'analyse :
- Vérifie le nombre de phrases (doit être exactement ${nb_phrases || 3})
- Vérifie chaque contrainte une par une
- Vérifie l'orthographe et la conjugaison
- IMPORTANT : chaque erreur DOIT contenir "mot_concerne" avec le mot exact de l'élève qui pose problème
- L'indice doit être court (max 15 mots) et cibler le mot concerné
${estDeuxiemeTentative ? "- Donne la correction directe dans l'indice : « mot_erroné → mot_correct »" : "- Ne donne PAS la réponse, donne un indice pour que l'élève trouve lui-même"}
- Sois bienveillant dans les commentaires
- Si tout est correct, "valide" = true et "erreurs" = []
- Réponds UNIQUEMENT en JSON valide, sans markdown`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const json = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const analyse = JSON.parse(json);

    return NextResponse.json(analyse);
  } catch (err) {
    console.error("[corriger-ecriture]", err);
    return NextResponse.json({ error: "Erreur lors de l'analyse" }, { status: 500 });
  }
}

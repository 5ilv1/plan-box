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

    const prompt = `Tu es un enseignant bienveillant et encourageant de français en école primaire (CE2-CM2).

Un élève de 8-10 ans devait écrire ${nb_phrases || 3} phrases en respectant cette consigne :
"${consigne}"

Les contraintes à vérifier :
${(contraintes as string[]).map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

Voici le texte de l'élève :
"""
${texte}
"""

${estDeuxiemeTentative
  ? `C'est la DEUXIÈME tentative. Donne les corrections directes (mot_erroné → mot_correct).
Si les seules erreurs restantes sont mineures (contexte un peu libre, vocabulaire créatif), VALIDE le texte.`
  : `C'est la PREMIÈRE tentative.
Donne des indices courts et bienveillants pour aider l'élève à se corriger lui-même.`}

Analyse le texte et réponds en JSON valide :
{
  "nb_phrases_ecrites": <nombre de phrases détectées>,
  "valide": <true/false>,
  "erreurs": [
    {
      "phrase": "la phrase de l'élève contenant l'erreur",
      "type": "conjugaison|orthographe|grammaire|contrainte_non_respectee|nombre_phrases",
      "mot_concerne": "le mot EXACT de l'élève (OBLIGATOIRE)",
      "indice": "${estDeuxiemeTentative ? "mot_erroné → mot_correct" : "indice court pour corriger ce mot"}"
    }
  ],
  "commentaire": "commentaire encourageant (1-2 phrases)",
  "score": <contraintes respectées / total>
}

Règles :
- Ne signale QUE les vraies erreurs de langue : orthographe, conjugaison, grammaire
- Pour les contraintes de CONTEXTE/THÈME : sois TOLÉRANT. Si l'élève parle de nager pendant une excursion en bateau, c'est acceptable. Ne sanctionne le contexte que s'il est complètement hors sujet.
- Vérifie le nombre de phrases (doit être ${nb_phrases || 3})
- Chaque erreur DOIT avoir "mot_concerne" avec le mot exact
- L'indice doit être court (max 15 mots)
- Sois encourageant et bienveillant — c'est un enfant !
- Si tout est correct ou si les erreurs restantes sont mineures, "valide" = true et "erreurs" = []
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

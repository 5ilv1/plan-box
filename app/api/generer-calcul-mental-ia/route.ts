import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// POST /api/generer-calcul-mental-ia
// Génère des calculs mentaux via l'IA à partir d'une consigne libre (contrainte structurelle)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { consignes, nbCalculs = 10, niveauNom = "CM1" } = body ?? {};

  if (!consignes?.trim()) {
    return NextResponse.json({ erreur: "Le champ consignes est requis." }, { status: 400 });
  }

  const prompt = `Tu es un générateur de calculs mentaux pour des élèves de ${niveauNom}.

Génère exactement ${nbCalculs} calculs mentaux en respectant strictement la contrainte suivante :
${consignes}

Règles de génération :
- Chaque calcul doit être différent des autres
- Les nombres doivent être adaptés au niveau ${niveauNom} (pas trop grands, pas trop petits)
- La réponse doit être un nombre entier positif
- L'énoncé doit être court et clair, avec "= ?" à la fin (ex: "55 + 38 + 45 = ?")
- Vérifie que chaque réponse est correcte avant de la retourner

Réponds UNIQUEMENT avec un objet JSON valide, sans explication, sans markdown :
{
  "calculs": [
    { "enonce": "55 + 38 + 45 = ?", "reponse": "138" },
    { "enonce": "...", "reponse": "..." }
  ]
}`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text ?? "";

    // Extraire le JSON de la réponse
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ erreur: "La réponse de l'IA ne contient pas de JSON valide." }, { status: 500 });
    }

    const json = JSON.parse(match[0]);

    if (!Array.isArray(json.calculs) || json.calculs.length === 0) {
      return NextResponse.json({ erreur: "L'IA n'a pas retourné de calculs." }, { status: 500 });
    }

    // Numéroter les calculs
    const calculs = json.calculs.map((c: { enonce: string; reponse: string }, i: number) => ({
      id: i + 1,
      enonce: c.enonce,
      reponse: c.reponse,
    }));

    return NextResponse.json({ calculs });
  } catch (err: unknown) {
    console.error("[generer-calcul-mental-ia]", err);
    return NextResponse.json(
      { erreur: "Erreur lors de la génération par l'IA." },
      { status: 500 }
    );
  }
}

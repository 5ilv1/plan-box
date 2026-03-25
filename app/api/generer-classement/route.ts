import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { niveau, categories, nbItems, description, pdfBase64 } = body;

    if (!categories || categories.length < 2) {
      return NextResponse.json({ erreur: "Il faut au moins 2 catégories." }, { status: 400 });
    }

    const catsStr = (categories as string[]).join(", ");
    const nbParCat = Math.max(2, Math.ceil((nbItems || 12) / categories.length));

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) expert en français qui crée des exercices de classement.

Génère un exercice où l'élève doit trier des éléments dans les bonnes catégories.

Niveau : ${niveau}
Catégories : ${catsStr}
Nombre d'éléments : ${nbItems || 12} au total (environ ${nbParCat} par catégorie)
${description ? `Consigne de l'enseignant : ${description}` : ""}

RÈGLES STRICTES :
- Génère EXACTEMENT ${nbItems || 12} éléments au total, répartis équitablement entre les catégories
- Chaque élément doit appartenir CLAIREMENT et SANS AMBIGUÏTÉ à une seule catégorie
- VARIE les éléments : pas de répétitions, pas de mots trop similaires
- Vocabulaire adapté au niveau ${niveau} (8-11 ans)
- Les éléments doivent être intéressants et variés (pas toujours les mêmes exemples banals)
- Pour le genre/nombre : utilise des groupes nominaux complets (déterminant + nom + adjectif si possible)
- Pour la nature des mots : utilise des mots dans des contextes clairs
- Pour les temps : utilise des verbes conjugués avec leur sujet
- VÉRIFIE que chaque élément est dans la bonne catégorie — aucune erreur tolérée
- Le titre doit être court et accrocheur
- La consigne doit être claire et adaptée à un enfant

Réponds UNIQUEMENT en JSON valide, sans backticks :
{
  "titre": "Titre court",
  "consigne": "Consigne claire pour l'élève",
  "categories": ${JSON.stringify(categories)},
  "items": [
    { "texte": "un chat noir", "categorie": "Masculin Singulier" },
    { "texte": "des fleurs rouges", "categorie": "Féminin Pluriel" }
  ]
}

VÉRIFIE une dernière fois que :
1. Il y a exactement ${nbItems || 12} éléments
2. Chaque élément est dans la BONNE catégorie (pas d'erreur de classement)
3. Les catégories utilisées dans les items correspondent EXACTEMENT aux noms de catégories fournis (${catsStr})
4. Les éléments sont variés et adaptés au niveau ${niveau}`;

    const messages: Anthropic.MessageParam[] = [];

    if (pdfBase64) {
      messages.push({
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: `Voici un document PDF comme modèle. Génère un exercice de classement adapté au niveau ${niveau}. Catégories : ${catsStr}.${description ? ` ${description}` : ""}` },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Génère un exercice de classement pour le niveau ${niveau}. Catégories : ${catsStr}. ${nbItems || 12} éléments au total.${description ? ` ${description}` : ""}`,
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const text = (response.content[0] as { type: "text"; text: string }).text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const resultat = JSON.parse(cleaned);

    if (!Array.isArray(resultat.items) || resultat.items.length === 0) {
      return NextResponse.json({ erreur: "Format de réponse invalide." }, { status: 500 });
    }

    // Vérifier que chaque item a une catégorie valide
    const catsSet = new Set(categories as string[]);
    resultat.items = resultat.items.filter((item: any) => catsSet.has(item.categorie));

    if (resultat.items.length === 0) {
      return NextResponse.json({ erreur: "Aucun élément avec une catégorie valide." }, { status: 500 });
    }

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-classement]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

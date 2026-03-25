import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { niveau, nbPhrases, description, fonctionsActives, pdfBase64 } = body;

    const fonctionsStr = (fonctionsActives as string[]).join(", ");

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) spécialisé en grammaire française.
Génère ${nbPhrases || 5} phrases pour un exercice d'analyse grammaticale au niveau ${niveau}.

FONCTIONS À IDENTIFIER dans chaque phrase : ${fonctionsStr}

RÈGLES :
- Phrases adaptées au niveau ${niveau} (vocabulaire simple, structures claires)
- Chaque phrase doit contenir au moins 2 des fonctions demandées
- Varier les structures de phrases
- Varier les thèmes (animaux, école, nature, sport, famille...)
- Les groupes ne doivent pas se chevaucher
- "debut" et "fin" sont les index des mots (0-indexed) dans la phrase splittée par espaces
- Vérifier que les index correspondent exactement aux mots
${description ? `- Consigne supplémentaire : ${description}` : ""}

RÈGLES GRAMMATICALES STRICTES :
- COD (complément d'objet direct) : se construit SANS préposition. On le trouve avec "verbe + qui/quoi ?". Ex : "Il mange une pomme" → "une pomme" = COD.
- COI (complément d'objet indirect) : se construit AVEC une préposition (à, de, en, sur...). On le trouve avec "verbe + à qui/à quoi/de qui/de quoi ?". Ex : "Il joue au football" → "au football" = COI. "Elle parle à son ami" → "à son ami" = COI.
- Ne JAMAIS confondre COD et COI. Si le complément est introduit par une préposition (à, de, au, aux, du, des...), c'est un COI, PAS un COD.
- CC Lieu : répond à "où ?". Ex : "dans le jardin", "à l'école"
- CC Temps : répond à "quand ?". Ex : "chaque matin", "hier soir", "pendant les vacances"
- CC Manière : répond à "comment ?". Ex : "rapidement", "avec soin"
- Attribut du sujet : après un verbe d'état (être, sembler, devenir, paraître, rester). Ex : "Le chat est noir" → "noir" = Attribut

Pour le niveau CE2, utiliser des phrases simples avec sujet + verbe + 1 complément.
Pour CM1/CM2, utiliser des phrases plus complexes.

Réponds UNIQUEMENT en JSON valide, sans backticks :
{
  "titre": "Analyse grammaticale",
  "consigne": "Identifie les fonctions des groupes de mots dans chaque phrase.",
  "phrases": [
    {
      "texte": "Le petit chat mange une souris dans le jardin.",
      "groupes": [
        { "mots": "Le petit chat", "fonction": "Sujet", "debut": 0, "fin": 2 },
        { "mots": "mange", "fonction": "Verbe", "debut": 3, "fin": 3 },
        { "mots": "une souris", "fonction": "COD", "debut": 4, "fin": 5 },
        { "mots": "dans le jardin", "fonction": "CC Lieu", "debut": 6, "fin": 8 }
      ]
    }
  ]
}

Vérifie ABSOLUMENT que :
1. Chaque "debut" et "fin" correspond au bon mot quand on fait texte.split(" ")[index]
2. Chaque groupe utilise uniquement des fonctions parmi : ${fonctionsStr}
3. Le dernier index "fin" ne dépasse pas le nombre de mots - 1
4. Les index ne se chevauchent pas entre groupes`;

    const messages: Anthropic.MessageParam[] = [];

    if (pdfBase64) {
      messages.push({
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: `Voici un document PDF comme modèle. Génère ${nbPhrases || 5} phrases d'analyse grammaticale adaptées au niveau ${niveau}. Fonctions : ${fonctionsStr}.${description ? ` ${description}` : ""}` },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Génère ${nbPhrases || 5} phrases d'analyse grammaticale pour le niveau ${niveau}. Fonctions à identifier : ${fonctionsStr}.${description ? ` ${description}` : ""}`,
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

    if (!Array.isArray(resultat.phrases) || resultat.phrases.length === 0) {
      return NextResponse.json({ erreur: "Format de réponse invalide." }, { status: 500 });
    }

    // Vérifier et corriger les positions
    for (const phrase of resultat.phrases) {
      const mots = phrase.texte.split(/\s+/);
      for (const g of phrase.groupes) {
        // Vérifier que les index sont corrects
        const motsDuGroupe = mots.slice(g.debut, g.fin + 1).join(" ");
        // Retirer la ponctuation pour comparer
        const clean = (s: string) => s.replace(/[.,;:!?'"()]/g, "").trim().toLowerCase();
        if (clean(motsDuGroupe) !== clean(g.mots)) {
          // Tenter de trouver la bonne position
          const target = clean(g.mots);
          for (let i = 0; i <= mots.length - 1; i++) {
            for (let j = i; j < mots.length; j++) {
              if (clean(mots.slice(i, j + 1).join(" ")) === target) {
                g.debut = i;
                g.fin = j;
                break;
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-analyse-phrase]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { REGLE_NOMBRES_EN_LETTRES, blocCorpus } from "@/lib/prompts-communs";
import { normaliserNombresEnLettres } from "@/lib/nombres-en-lettres";
import { recalerPhrases, type PhraseAnalyse } from "@/lib/analyse-phrase";
import { requireEnseignant } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const body = await req.json();
    const { niveau, nbPhrases, description, fonctionsActives, pdfBase64, corpus } = body;

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

PLACE DES GROUPES — l'élève doit chercher le sujet, pas le trouver toujours au même endroit :
- Au plus la MOITIÉ des phrases commence par le sujet.
- Les autres commencent par un complément circonstanciel déplacé en tête : "Chaque matin, les enfants promènent le chien." / "Dans la cour, Léa et Tom jouent aux billes."
- Si la fonction Sujet est demandée, au moins UNE phrase (deux à partir de 6 phrases) a un SUJET INVERSÉ, placé après le verbe : "Dans la forêt vivait un vieux loup." / "Au fond du jardin poussent des fleurs rouges." / "Sur la branche chantait un merle."
- Varier aussi la longueur du sujet : un pronom, un prénom, un groupe nominal long ("Le chien de ma voisine aboie."), un sujet éloigné du verbe.
- INTERDIT pour l'inversion : les questions et les pronoms collés au verbe par un trait d'union ("vas-tu", "dit-il") — le sujet et le verbe y forment un seul mot, l'élève ne peut pas les séparer. L'inversion se fait avec un groupe nominal sujet, après un complément de lieu ou de temps.
- Au CE2, phrases courtes même quand le sujet est inversé ("Dans la mare nagent des canards.").
- ⚠️ Les phrases citées dans ce message (y compris celles du format JSON) montrent des STRUCTURES : n'en reprends AUCUNE, ni même son début ou ses noms (pas de loup dans la forêt, de merle sur la branche, de chien de la voisine, de "Chaque matin"). Invente tes propres phrases, lieux, personnages et compléments.

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
    },
    {
      "texte": "Dans la forêt vivait un vieux loup.",
      "groupes": [
        { "mots": "Dans la forêt", "fonction": "CC Lieu", "debut": 0, "fin": 2 },
        { "mots": "vivait", "fonction": "Verbe", "debut": 3, "fin": 3 },
        { "mots": "un vieux loup", "fonction": "Sujet", "debut": 4, "fin": 6 }
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
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `${systemPrompt}${blocCorpus(corpus)}

${REGLE_NOMBRES_EN_LETTRES}`,
      messages,
    });

    const text = (response.content[0] as { type: "text"; text: string }).text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const resultat = normaliserNombresEnLettres(JSON.parse(cleaned));

    if (!Array.isArray(resultat.phrases) || resultat.phrases.length === 0) {
      return NextResponse.json({ erreur: "Format de réponse invalide." }, { status: 500 });
    }

    // Le texte des groupes fait foi, jamais les index annoncés : un groupe mal
    // placé est introuvable à l'écran, et l'élève reste bloqué dessus. Ceux
    // qu'on ne retrouve pas dans leur phrase sont écartés.
    resultat.phrases = recalerPhrases(resultat.phrases as PhraseAnalyse[]);

    if (resultat.phrases.length === 0) {
      return NextResponse.json(
        { erreur: "Les groupes générés ne correspondent pas aux phrases. Relance la génération." },
        { status: 500 },
      );
    }

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-analyse-phrase]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

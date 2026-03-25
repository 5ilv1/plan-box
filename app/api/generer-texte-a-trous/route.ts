import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { niveau, objectif, description, pdfBase64 } = body;

    if (!objectif && !description) {
      return NextResponse.json({ erreur: "Précise l'objectif ou la description." }, { status: 400 });
    }

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) expert en français qui crée des exercices de type "texte à trous".

Génère un texte adapté au niveau ${niveau} avec des mots manquants à compléter par l'élève.

Objectif pédagogique : ${objectif || "à déterminer selon la description"}
${description ? `Consigne de l'enseignant : ${description}` : ""}

RÈGLES STRICTES :
- Écris un texte de 4 à 8 phrases, cohérent, intéressant et ORIGINAL
- VARIE les thèmes : aventure, nature, voyage, animaux exotiques, sport, espace, cuisine, histoire, mer, montagne... NE PAS toujours utiliser l'école, Marie, ou des prénoms classiques
- Masque entre 6 et 12 mots en fonction de l'objectif pédagogique
- Les mots masqués doivent être pertinents par rapport à l'objectif
- Chaque trou DOIT avoir un indice pédagogique court et utile
- Le texte_complet DOIT être grammaticalement PARFAIT — aucune faute d'orthographe, de grammaire ou de conjugaison
- VÉRIFIE chaque phrase avant de répondre : sujet-verbe accordés, homophones corrects, ponctuation correcte
- Vocabulaire adapté au niveau ${niveau}

IMPORTANT : Réponds UNIQUEMENT en JSON valide, sans backticks, sans explication.

Format attendu :
{
  "titre": "Titre court et accrocheur",
  "consigne": "Consigne claire pour l'élève (1 phrase)",
  "texte_complet": "Le texte complet avec tous les mots corrects (pas de crochets). ZÉRO faute.",
  "trous": [
    { "position": 2, "mot": "mange", "indice": "verbe du 1er groupe au présent" },
    { "position": 8, "mot": "chantent", "indice": "accord sujet-verbe, le sujet est pluriel" }
  ]
}

La "position" est l'index du mot dans le texte splitté par espaces (0-indexed).
Vérifie que chaque position correspond bien au bon mot dans texte_complet.split(" ").
RELIS le texte_complet une dernière fois pour t'assurer qu'il n'y a AUCUNE faute.

RÈGLE HOMOPHONES : Si l'objectif porte sur des homophones (et/est/es, a/à, son/sont, etc.), le texte DOIT contenir AU MOINS une occurrence de CHAQUE homophone mentionné dans la consigne. Par exemple pour "et/est/es" : au moins 1 "et", 1 "est" ET 1 "es" (avec le sujet "tu"). Utilise des phrases avec "tu" pour naturellement placer "es".`;

    const messages: Anthropic.MessageParam[] = [];

    if (pdfBase64) {
      messages.push({
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          {
            type: "text",
            text: `Voici un document PDF comme modèle/inspiration. Génère un exercice de texte à trous adapté au niveau ${niveau}.${description ? ` Instructions : ${description}` : ""}`,
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Génère un exercice de texte à trous pour le niveau ${niveau}. Objectif : ${objectif}. ${description || ""}`,
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const text = (response.content[0] as { type: "text"; text: string }).text;

    // Nettoyer le JSON (retirer backticks éventuels)
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const resultat = JSON.parse(cleaned);

    // Valider la structure
    if (!resultat.texte_complet || !Array.isArray(resultat.trous) || resultat.trous.length === 0) {
      return NextResponse.json({ erreur: "Format de réponse invalide." }, { status: 500 });
    }

    // Vérifier et corriger les positions
    const mots = resultat.texte_complet.split(/\s+/);
    const clean = (s: string) => s.replace(/[.,;:!?'"()]/g, "").toLowerCase();
    const usedPositions = new Set<number>();

    for (const trou of resultat.trous) {
      // Si la position correspond déjà, OK
      if (mots[trou.position] && clean(mots[trou.position]) === clean(trou.mot) && !usedPositions.has(trou.position)) {
        usedPositions.add(trou.position);
        continue;
      }
      // Sinon chercher la prochaine occurrence non-utilisée
      let found = false;
      for (let i = 0; i < mots.length; i++) {
        if (!usedPositions.has(i) && clean(mots[i]) === clean(trou.mot)) {
          trou.position = i;
          usedPositions.add(i);
          found = true;
          break;
        }
      }
      if (!found) {
        // Dernier recours : chercher avec correspondance partielle
        for (let i = 0; i < mots.length; i++) {
          if (!usedPositions.has(i) && mots[i].toLowerCase().includes(trou.mot.toLowerCase())) {
            trou.position = i;
            usedPositions.add(i);
            break;
          }
        }
      }
    }

    // Synchroniser le mot du trou avec le mot réellement dans le texte à cette position
    // Cela garantit que la validation élève compare avec le bon mot
    for (const trou of resultat.trous) {
      if (mots[trou.position]) {
        // Garder le mot du texte (sans ponctuation pour la validation)
        trou.mot = mots[trou.position].replace(/[.,;:!?'"()]/g, "");
      }
    }

    // Filtrer les trous dont la position est toujours invalide
    resultat.trous = resultat.trous.filter((t: any) => t.position >= 0 && t.position < mots.length && t.mot.length > 0);

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-texte-a-trous]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

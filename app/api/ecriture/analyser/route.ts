import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  const texte = body.texte as string;
  const erreurs_precedentes = body.erreurs_precedentes as any[] | undefined;
  const jour = body.jour as number;
  const sujet = body.sujet as string | undefined;

  if (!texte || !jour) {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  let contextePrecedent = "";
  if (erreurs_precedentes && erreurs_precedentes.length > 0) {
    contextePrecedent = "\n\nERREURS DU JOUR PRÉCÉDENT (encore présentes = donner la correction) :\n" +
      erreurs_precedentes.map((e: any, i: number) =>
        `${i + 1}. [${e.type}] "${e.mot}" — Indice : "${e.indice}" — Correction : "${e.correction}"`
      ).join("\n") +
      "\n\nSi une de ces erreurs est ENCORE dans le texte, mets la correction dans le champ 'correction'.";
  }

  const systemPrompt = `Tu es un correcteur de français expert et bienveillant pour des élèves de CE2/CM1/CM2 (8-11 ans).

Analyse le texte et identifie TOUTES les erreurs :
- "orthographe" : mots mal orthographiés (ex: garson → garçon, foret → forêt)
- "grammaire" : accords sujet-verbe, adjectif-nom, participe passé, conjugaisons, accords en genre et nombre dans le groupe nominal
- "syntaxe" : ponctuation manquante, majuscules oubliées, phrases mal construites

RÈGLES D'ACCORD — TRÈS IMPORTANT :
- Accord sujet-verbe : "il marchais" → "il marchait" (imparfait 3e pers. = -ait)
- Accord dans le groupe nominal : "les arbres était très grand" → "les arbres étaient très grands" (pluriel !)
- Un adjectif s'accorde en genre et nombre avec le nom : "arbres grands", "maison grande"
- Imparfait : je -ais, tu -ais, il -ait, nous -ions, vous -iez, ils -aient
- Si le sujet est "il" et le verbe finit en "-ais", c'est une erreur → correction "-ait"

RÈGLE CRITIQUE — SIGNALER CHAQUE OCCURRENCE :
- Si un mot erroné apparaît PLUSIEURS FOIS dans le texte, signale CHAQUE occurrence séparément
- Utilise le champ "position" pour distinguer les occurrences (position = index du caractère dans le texte)
- Exemple : si "avais" (au lieu de "avait") apparaît 3 fois, retourne 3 objets distincts avec des positions différentes

Pour CHAQUE erreur, retourne un objet JSON :
- "mot" : le mot erroné tel qu'il apparaît dans le texte
- "type" : "orthographe" | "grammaire" | "syntaxe"
- "position" : index EXACT du premier caractère du mot dans le texte (commence à 0)
- "indice" : indice pédagogique SANS donner la réponse
- "correction" : forme correcte (UNIQUEMENT si erreur signalée hier et persistante)
${contextePrecedent}

IMPORTANT :
- Signale TOUTES les erreurs, y compris les répétitions d'une même faute
- Vérifie les accords en nombre (singulier/pluriel) dans TOUT le texte
- Ne signale PAS un mot correct comme erreur
- Ne signale PAS les choix stylistiques
- Vocabulaire adapté aux 8-11 ans, encourageant
- Maximum 20 erreurs
- Retourne UNIQUEMENT un JSON array, rien d'autre`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `${sujet ? `Sujet : "${sujet}"\n\n` : ""}Texte (Jour ${jour}) :\n\n${texte}`,
      }],
    });

    const text = (response.content[0] as any).text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ erreurs: [] });
    }

    const erreurs = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ erreurs });
  } catch (err) {
    console.error("[ecriture/analyser]", err);
    return NextResponse.json({ erreurs: [] });
  }
}

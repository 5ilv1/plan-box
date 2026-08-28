import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { REGLE_NOMBRES_EN_LETTRES } from "@/lib/prompts-communs";
import { requireEnseignant } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const body = await req.json();
    const { theme, niveau, description } = body as {
      theme: string;
      niveau: string;
      description?: string;
    };

    if (!theme?.trim()) {
      return NextResponse.json({ erreur: "Thème manquant." }, { status: 400 });
    }

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) spécialisé en mathématiques.
Génère EXACTEMENT 3 problèmes de maths pour le niveau ${niveau} sur le thème : « ${theme} ».

RÈGLES :
- Problèmes adaptés au niveau ${niveau} : vocabulaire simple, contexte familier (école, famille, sport, nature…)
- Progression des 3 problèmes : le premier est le plus simple, le troisième le plus difficile
- Chaque énoncé contient TOUTES les informations nécessaires pour résoudre
- Les nombres utilisés sont cohérents avec le niveau (pas de calculs monstrueux)
- Varier les contextes entre les 3 problèmes (ne pas répéter la même situation)
${description ? `- Consigne supplémentaire : ${description}` : ""}

FORMAT DES RÉPONSES :
- "resultat_attendu" : la valeur numérique finale avec son unité, écrite de façon standard
  • durées : "2 h 35 min", "45 min", "1 h"
  • prix : "12,50 €", "3 €"
  • longueurs : "4,5 m", "120 cm"
  • masse : "2,5 kg"
  • nombres sans unité : "48"
- "phrase_reponse_attendue" : une phrase complète naturelle qui reprend le contexte du problème et donne la valeur
  Ex : "Le train arrive à 11 h 45 en gare de Lyon."
- "mots_cles" : 2 à 4 mots/nombres importants qui DOIVENT figurer dans la phrase réponse pour la considérer correcte
  Ces mots sont en minuscules, sans accents superflus. Inclure le nombre clé et 1 ou 2 mots du contexte.
  Ex pour "Le train arrive à 11 h 45" : ["11", "45", "train"]
- "indice" : une piste qui oriente sans donner la réponse. 1 à 2 phrases.
  Ex : "Pense à convertir les heures en minutes avant d'additionner."

Réponds UNIQUEMENT en JSON valide, sans backticks, sans texte autour :
{
  "titre": "Problèmes de ${theme.toLowerCase()}",
  "theme": "${theme}",
  "consigne": "Lis bien chaque problème, calcule, puis écris ta phrase réponse.",
  "problemes": [
    {
      "id": 1,
      "enonce": "…",
      "resultat_attendu": "…",
      "phrase_reponse_attendue": "…",
      "mots_cles": ["…", "…"],
      "indice": "…"
    },
    { "id": 2, ... },
    { "id": 3, ... }
  ]
}`;

    const userMessage = `Génère 3 problèmes de maths pour le niveau ${niveau} sur le thème « ${theme} »${description ? ` — ${description}` : ""}.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `${systemPrompt}

${REGLE_NOMBRES_EN_LETTRES}`,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = (response.content[0] as { type: "text"; text: string }).text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const resultat = JSON.parse(cleaned);

    if (!Array.isArray(resultat.problemes) || resultat.problemes.length !== 3) {
      return NextResponse.json(
        { erreur: "Format de réponse invalide (3 problèmes attendus)." },
        { status: 500 }
      );
    }

    // Normaliser : s'assurer que chaque problème a bien tous les champs
    resultat.problemes = resultat.problemes.map((p: Record<string, unknown>, i: number) => ({
      id: (p.id as number) ?? i + 1,
      enonce: String(p.enonce ?? ""),
      resultat_attendu: String(p.resultat_attendu ?? ""),
      phrase_reponse_attendue: String(p.phrase_reponse_attendue ?? ""),
      mots_cles: Array.isArray(p.mots_cles) ? (p.mots_cles as string[]).map(String) : [],
      indice: String(p.indice ?? ""),
    }));

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-probleme-maths]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

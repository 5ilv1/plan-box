import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { REGLE_NOMBRES_EN_LETTRES, extraireJSON } from "@/lib/prompts-communs";
import { CRITERES, ordonner } from "@/lib/rangement";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { niveau, critere, nbSeries, nbElements, description } = body;

    const cle = typeof critere === "string" && CRITERES[critere] ? critere : "alphabetique";
    const nbS = Math.min(Math.max(parseInt(nbSeries, 10) || 4, 1), 10);
    const nbE = Math.min(Math.max(parseInt(nbElements, 10) || 5, 3), 8);

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) qui crée des exercices de rangement.

L'élève reçoit des étiquettes mélangées et doit les replacer de gauche à droite dans le bon ordre.

Niveau : ${niveau}
Critère de rangement : ${CRITERES[cle].label} — ${CRITERES[cle].consigne}
Nombre de séries : EXACTEMENT ${nbS}
Éléments par série : EXACTEMENT ${nbE}
${description ? `Consigne de l'enseignant : ${description}` : ""}

RÈGLES STRICTES :
- Donne les éléments DÉJÀ RANGÉS dans le bon ordre : c'est l'application qui les mélangera
- Chaque série a EXACTEMENT ${nbE} éléments, tous différents
- Une étiquette est courte (un mot, un nombre, un court groupe de mots) : jamais une phrase entière
- L'ordre doit être INCONTESTABLE : une seule solution possible
- Progresse en difficulté d'une série à l'autre
- Vocabulaire et nombres adaptés au niveau ${niveau} (8-11 ans)
${cle === "alphabetique" ? "- Inclus au moins une série où plusieurs mots commencent par la même lettre (il faut alors comparer la 2e, voire la 3e lettre)" : ""}
${cle === "croissant" || cle === "decroissant" ? "- Varie les écritures (nombres à chiffres, éventuellement décimaux) mais reste comparable au sein d'une série" : ""}

Réponds UNIQUEMENT en JSON valide, sans backticks :
{
  "titre": "Titre court",
  "consigne": "Consigne claire pour l'élève",
  "series": [
    { "elements": ["abricot", "banane", "cerise", "datte", "figue"] }
  ]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `${systemPrompt}\n\n${REGLE_NOMBRES_EN_LETTRES}`,
      messages: [{
        role: "user",
        content: `Génère ${nbS} séries de ${nbE} éléments à ranger (${CRITERES[cle].label}) pour le niveau ${niveau}.${description ? ` ${description}` : ""}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const resultat = extraireJSON(text) as Record<string, unknown> & Record<string, any>;

    if (!Array.isArray(resultat.series) || resultat.series.length === 0) {
      return NextResponse.json({ erreur: "Format de réponse invalide." }, { status: 500 });
    }

    // L'ordre de référence est recalculé quand le critère est objectif (alphabet,
    // valeur numérique) : le modèle se trompe trop souvent sur « 0,9 / 0,15 » ou
    // sur deux mots qui partagent leurs premières lettres.
    const series: { elements: string[] }[] = [];
    for (const s of resultat.series) {
      if (!Array.isArray(s?.elements)) continue;
      const elements = s.elements
        .filter((e: unknown) => typeof e === "string" && e.trim())
        .map((e: string) => e.trim());
      if (elements.length < 3) continue;
      if (new Set(elements).size !== elements.length) continue; // doublons → série ambiguë

      const recalcule = ordonner(elements, cle);
      if (cle === "croissant" || cle === "decroissant") {
        // Série non évaluable numériquement : écartée plutôt que fausse
        if (!recalcule) continue;
      }
      series.push({ elements: recalcule ?? elements });
    }

    if (series.length === 0) {
      return NextResponse.json(
        { erreur: "Aucune série exploitable n'a été produite. Relance la génération." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      resultat: {
        titre: resultat.titre ?? CRITERES[cle].label,
        consigne: resultat.consigne ?? `Range les étiquettes : ${CRITERES[cle].label.toLowerCase()}.`,
        critere: cle,
        series,
      },
    });
  } catch (err: unknown) {
    console.error("[generer-rangement]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

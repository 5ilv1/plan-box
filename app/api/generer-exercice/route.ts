import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ParamsGeneration } from "@/types";
import { validerReponsesExercice } from "@/lib/valider-reponses-exercice";
import { requireEnseignant } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { REGLE_NOMBRES_EN_LETTRES, REGLE_REPONSE_UNIQUE, blocCorpus } from "@/lib/prompts-communs";
import { normaliserNombresEnLettres } from "@/lib/nombres-en-lettres";
import { figuresPossibles, consigneFigures, filtrerFigures, remplacerNombre, MARGE_FIGURES } from "@/lib/figures-generation";

const client = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

type ParamsExercice = Extract<ParamsGeneration, { type: "exercice" }>;

/**
 * Géométrie, grandeurs et mesures : une question peut porter une figure
 * (lib/figures-generation.ts). Le thème compte aussi — les maths CE2 n'ont
 * pas de sous-domaine fiable.
 */
function avecFigures(p: ParamsExercice): boolean {
  return figuresPossibles(p.matiere, p.sousMatiere ?? "", p.chapitreTitre, p.contexte, (p as any).consigneDetaillee);
}

function promptExercice(p: ParamsExercice): string {
  const figures = avecFigures(p);
  return `Tu es un assistant pédagogique pour une école primaire française.
Tu génères des exercices adaptés au niveau ${p.niveauNom} (${p.matiere}).
Chapitre : ${p.chapitreTitre}.
Difficulté : ${p.difficulte}.
Nombre de questions : ${figures ? p.nbQuestions + MARGE_FIGURES : p.nbQuestions}.
${p.contexte ? `Thème souhaité : ${p.contexte}` : ""}
${(p as any).consigneDetaillee ? `\nConsigne de l'enseignant (à suivre impérativement) :\n${(p as any).consigneDetaillee}` : ""}
${p.modele ? `Génère dans le style de cet exercice modèle :\n${p.modele}` : ""}${blocCorpus((p as any).corpus)}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "titre": "Titre court de l'exercice",
  "consigne": "La consigne générale",
  "questions": [
    {
      "id": 1,
      "enonce": "Texte de la question",
      "reponse_attendue": "La réponse correcte",
      "indice": "Un indice optionnel si besoin"
    }
  ]
}

Règles :
- Langage simple, adapté à des enfants de 8-11 ans
- Pas de violence, pas de sujets sensibles
- Questions progressives en difficulté
- Réponses courtes et vérifiables${figures ? `\n\n${consigneFigures("exercice")}` : ""}`;
}

function promptCalcMental(p: Extract<ParamsGeneration, { type: "calcul_mental" }>): string {
  return `Tu génères une série de calculs mentaux pour des élèves de ${p.niveauNom} en école primaire française.
Opérations : ${p.operations.join(", ")}.
${p.table ? `Table ciblée : ${p.table}` : ""}
Nombre de calculs : ${p.nbCalculs}.
Difficulté : ${p.difficulte}.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "calculs": [
    { "id": 1, "enonce": "7 × 8 =", "reponse": "56" },
    { "id": 2, "enonce": "45 + 37 =", "reponse": "82" }
  ]
}

Règles :
- Calculs réalistes pour le niveau
- Pas de nombres négatifs pour CE2
- Résultats entiers uniquement
- Varier les structures (ex. "3 × ? = 21" parfois)`;
}

export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;
  const limited = rateLimit(req, { key: "generer-exercice", max: 20, windowSec: 60, identifier: auth.user.id });
  if (limited) return limited;

  try {
    const params: ParamsGeneration = await req.json();

    if (params.type === "ressource" || params.type === "dictee") {
      return NextResponse.json({ erreur: "Ce type ne passe pas par cette route." }, { status: 400 });
    }

    const prompt =
      params.type === "exercice"
        ? promptExercice(params)
        : promptCalcMental(params);

    // Construire le contenu du message (texte + PDF optionnel)
    const contentParts: any[] = [];

    // Si un PDF modèle est fourni, l'envoyer à Claude
    if (params.type === "exercice" && (params as any).pdfModeleBase64) {
      contentParts.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: (params as any).pdfModeleBase64,
        },
      });
      contentParts.push({
        type: "text",
        text: "Voici un PDF d'exercice modèle. Inspire-toi du style, du format et du niveau de difficulté de ce document pour générer l'exercice demandé.\n\n" + prompt,
      });
    } else {
      contentParts.push({ type: "text", text: prompt });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `${REGLE_NOMBRES_EN_LETTRES}\n\n${REGLE_REPONSE_UNIQUE}`,
      messages: [{ role: "user", content: contentParts }],
    });

    const texte =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Nettoyage éventuel de balises markdown
    const json = texte
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let resultat = normaliserNombresEnLettres(JSON.parse(json));

    // Une figure abîmée, ou contredite par la réponse, emporte sa question ;
    // les questions de marge comblent, puis on coupe au nombre demandé.
    if (params.type === "exercice" && avecFigures(params) && Array.isArray(resultat.questions)) {
      const { questions, ecartees, corrigees } = filtrerFigures(
        resultat.questions as { enonce: string; reponse_attendue: string; indice?: string; figure?: unknown }[],
        (q) => ({ enonce: String(q.enonce ?? ""), reponse: String(q.reponse_attendue ?? "") }),
        // Une aire mal comptée se recalcule sur le dessin ; l'indice, qui
        // citait souvent le mauvais compte, part avec elle.
        (q, valeur) => {
          const { indice: _i, ...reste } = q;
          return { ...reste, reponse_attendue: remplacerNombre(String(q.reponse_attendue ?? ""), valeur) };
        },
      );
      if (corrigees) console.log(`[generer-exercice] ${corrigees} mesure(s) recalculée(s) sur le dessin`);
      for (const e of ecartees) console.log(`[generer-exercice] figure écartée (${e.raison}) : ${e.enonce}`);
      if (questions.length === 0) {
        return NextResponse.json({ erreur: "Aucune question fiable n'a été générée. Relance la génération." }, { status: 500 });
      }
      resultat.questions = questions.slice(0, params.nbQuestions).map((q, i) => ({ ...q, id: i + 1 }));
    }

    resultat = await validerReponsesExercice(resultat, params.type, client);
    return NextResponse.json({ resultat });
  } catch (err) {
    console.error("Erreur génération exercice:", err);
    return NextResponse.json(
      { erreur: "Échec de la génération. Réessaie." },
      { status: 500 }
    );
  }
}

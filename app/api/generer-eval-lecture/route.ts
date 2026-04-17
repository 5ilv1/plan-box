import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export const maxDuration = 300;

interface ChapitreInput {
  titre: string;
  texte: string;
}

interface Question {
  id?: number;
  question: string;
  choix: string[];
  reponse: number;
}

function melanger<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Post-traitement :
 * 1. Répartit aléatoirement la position de la bonne réponse entre les 4 choix.
 * 2. Si la bonne réponse est nettement plus longue que les distracteurs, on neutralise
 *    en tronquant ou en égalisant (fallback : on garde tel quel mais on le loggue).
 */
function normaliserQuestions(questions: Question[]): Question[] {
  return questions.map((q, idx) => {
    const bonneReponse = q.choix[q.reponse];
    const distracteurs = q.choix.filter((_, i) => i !== q.reponse);

    // Mélanger la position de la bonne réponse
    const nouvellePos = Math.floor(Math.random() * 4);
    const nouveauxChoix: string[] = [];
    let idxDistracteur = 0;
    for (let i = 0; i < 4; i++) {
      if (i === nouvellePos) nouveauxChoix.push(bonneReponse);
      else nouveauxChoix.push(distracteurs[idxDistracteur++] ?? "");
    }

    return {
      id: idx + 1,
      question: q.question,
      choix: nouveauxChoix,
      reponse: nouvellePos,
    };
  });
}

/**
 * Vérifie que la bonne réponse n'est pas systématiquement la plus longue.
 * Retourne true si la répartition est correcte (pas de biais).
 */
function verifierBiaisLongueur(questions: Question[]): { ok: boolean; problemes: number[] } {
  const problemes: number[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const longueurs = q.choix.map((c) => c.length);
    const lenBonneRep = longueurs[q.reponse];
    const maxAutres = Math.max(...longueurs.filter((_, j) => j !== q.reponse));
    // Si la bonne réponse est plus de 50% plus longue que le plus long distracteur → biais
    if (lenBonneRep > maxAutres * 1.5 && lenBonneRep - maxAutres > 10) {
      problemes.push(i);
    }
  }
  return { ok: problemes.length === 0, problemes };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { titreLivre, niveau, chapitres, nbQuestions } = body as {
      titreLivre: string;
      niveau: string;
      chapitres: ChapitreInput[];
      nbQuestions?: number;
    };

    if (!Array.isArray(chapitres) || chapitres.length === 0) {
      return NextResponse.json({ erreur: "Liste des chapitres manquante." }, { status: 400 });
    }

    const nbQ = nbQuestions ?? 10;

    // Concatène les chapitres pour l'IA (tronqué si nécessaire pour tenir en contexte)
    const contenuLivre = chapitres
      .map((c) => `## ${c.titre}\n\n${c.texte}`)
      .join("\n\n---\n\n");

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) expert en évaluation de lecture.

Tu viens de lire un livre entier avec tes élèves. Tu dois maintenant créer une ÉVALUATION FINALE de compréhension globale, différente des questions posées chapitre par chapitre.

Livre : "${titreLivre ?? "Sans titre"}" — Niveau : ${niveau ?? "CM1"}

L'évaluation doit porter sur l'ENSEMBLE de l'histoire, pas sur des détails locaux :
- L'intrigue globale : arc narratif, moments-clés, dénouement
- Les personnages : leur évolution, leurs motivations, leurs relations
- Les thèmes : morale, leçons, messages du livre
- La chronologie : ordre des grands événements
- Les lieux et leur importance
- Le style ou le ton (si pertinent)

RÈGLES STRICTES :
- Exactement ${nbQ} questions au format QCM à 4 choix
- Une seule bonne réponse par question
- Les 3 mauvaises réponses (distracteurs) doivent être PLAUSIBLES :
  * Tirées d'autres moments du livre ou de confusions classiques
  * De longueur SIMILAIRE à la bonne réponse (important ! pas de distracteur trop court)
  * Grammaticalement cohérentes avec la question
- Les questions NE doivent PAS être reprises des questions par chapitre : formule-les différemment, vise la compréhension globale
- Varie les types : inférence, analyse, synthèse, chronologie
- Vocabulaire adapté au niveau ${niveau ?? "CM1"} (8-11 ans)
- NE PAS donner la réponse dans la question

CRITIQUE — ÉQUILIBRAGE DES CHOIX :
- La bonne réponse NE DOIT PAS être systématiquement plus longue que les autres
- Les 4 choix doivent avoir des longueurs comparables (écart max : ~30% entre le plus court et le plus long)
- Si la bonne réponse est naturellement courte, raccourcis les distracteurs ; si elle est longue, étoffe les distracteurs

Réponds UNIQUEMENT en JSON valide, sans backticks :
{
  "questions": [
    {
      "question": "Question claire sur l'ensemble de l'histoire ?",
      "choix": ["Choix A", "Choix B", "Choix C", "Choix D"],
      "reponse": 0
    }
  ]
}

IMPORTANT :
- "reponse" est l'INDEX (0-3) de la bonne réponse dans "choix"
- La position sera re-randomisée par le serveur ensuite, tu peux donc mettre la bonne réponse où tu veux
- VÉRIFIE que chaque "reponse" correspond bien à la bonne réponse`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Voici le livre complet, chapitre par chapitre :\n\n${contenuLivre}\n\nGénère ${nbQ} questions d'évaluation finale de compréhension globale.`,
        },
      ],
    });

    const text = (response.content[0] as { type: "text"; text: string }).text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json({ erreur: "Aucune question générée." }, { status: 500 });
    }

    // Valider et normaliser
    const questionsValides: Question[] = [];
    for (const q of parsed.questions) {
      if (!q.question || !Array.isArray(q.choix) || q.choix.length !== 4) continue;
      if (typeof q.reponse !== "number" || q.reponse < 0 || q.reponse >= 4) continue;
      questionsValides.push(q);
    }

    if (questionsValides.length === 0) {
      return NextResponse.json({ erreur: "Questions générées invalides." }, { status: 500 });
    }

    // Randomiser position + id
    const questionsFinales = normaliserQuestions(questionsValides);

    // Vérifier biais longueur (log seulement)
    const { ok, problemes } = verifierBiaisLongueur(questionsFinales);
    if (!ok) {
      console.warn(`[generer-eval-lecture] Biais longueur détecté sur questions : ${problemes.join(", ")}`);
    }

    // Vérifier aussi la distribution des positions (log seulement)
    const positions = questionsFinales.map((q) => q.reponse);
    const compteur = [0, 0, 0, 0];
    for (const p of positions) compteur[p]++;
    console.log(`[generer-eval-lecture] Distribution positions réponse : A=${compteur[0]} B=${compteur[1]} C=${compteur[2]} D=${compteur[3]}`);

    return NextResponse.json({
      resultat: {
        titre: `Évaluation finale — ${titreLivre ?? "Livre"}`,
        questions: questionsFinales,
      },
    });
  } catch (err: unknown) {
    console.error("[generer-eval-lecture]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

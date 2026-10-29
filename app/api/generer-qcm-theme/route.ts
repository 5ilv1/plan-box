import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnseignant } from "@/lib/server-auth";
import { couperQcm, relireQcm } from "@/lib/relire-qcm";
import { figuresPossibles, consigneFigures, filtrerFigures, premierNombre, nbOptionsJustes, nbOptionsJustesDroite } from "@/lib/figures-generation";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: NextRequest) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const body = await req.json();
    const {
      niveau = "CM1",
      matiere = "",
      sous_matiere = "",
      theme = "",
      consigne = "",
      titre = "",
      nbQuestions = 10,
    } = body;

    if (!theme.trim() && !sous_matiere.trim() && !consigne.trim()) {
      return NextResponse.json(
        { erreur: "Donne un thème, une sous-matière ou une consigne pour générer le QCM." },
        { status: 400 }
      );
    }

    const nbVoulu = Math.min(Math.max(parseInt(String(nbQuestions), 10) || 10, 3), 20);
    // Deux questions de marge : la relecture écarte celles qui n'ont pas
    // exactement une bonne option (lib/relire-qcm.ts).
    const nbQ = nbVoulu + 2;
    // Géométrie, grandeurs et mesures : une question peut porter une figure.
    // Le relecteur ne voit pas le dessin : c'est filtrerFigures() qui vérifie.
    const figures = figuresPossibles(matiere, sous_matiere, theme, consigne, titre);

    const systemPrompt = `Tu es un enseignant de primaire (CE2/CM1/CM2) expert en création de QCM pédagogiques.

Génère exactement ${nbQ} questions à choix multiple adaptées au niveau ${niveau}.

${matiere ? `Matière : ${matiere}` : ""}
${sous_matiere ? `Sous-matière / notion : ${sous_matiere}` : ""}
${theme ? `Thème : ${theme}` : ""}
${consigne ? `Consignes spécifiques de l'enseignant : ${consigne}` : ""}

RÈGLES STRICTES :
- Exactement ${nbQ} questions
- Chaque question a exactement 4 options
- Une seule bonne réponse par question
- La position de la bonne réponse doit varier aléatoirement entre 0, 1, 2 et 3
- Les mauvaises réponses doivent être plausibles mais clairement fausses
- Vocabulaire adapté à des élèves de 8-11 ans
- Courte explication (1-2 phrases) pour chaque bonne réponse
- NE PAS donner la réponse dans la formulation de la question

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans texte autour) :
{
  "titre": "Titre du QCM",
  "questions": [
    {
      "question": "Question ?",
      "options": ["A", "B", "C", "D"],
      "reponse_correcte": 0,
      "explication": "Courte explication."
    }
  ]
}${figures ? `\n\n${consigneFigures("qcm")}` : ""}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Génère le QCM demandé.${titre ? ` Titre suggéré : ${titre}.` : ""}`,
        },
      ],
    });

    const raw = (response.content[0] as { type: "text"; text: string }).text
      .trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json({ erreur: "Aucune question générée." }, { status: 500 });
    }

    let brutes = parsed.questions as any[];
    if (figures) {
      const f = filtrerFigures(brutes, (q: any) => ({
        enonce: String(q.question ?? ""),
        reponse: Array.isArray(q.options) ? String(q.options[q.reponse_correcte] ?? "") : "",
      }),
      // Aire mal comptée : la bonne option est celle qui vaut le dessin, s'il
      // y en a exactement une. L'explication citait le mauvais compte.
      (q: any, valeur: number) => {
        const justes = (Array.isArray(q.options) ? q.options : [])
          .map((o: unknown, i: number) => (premierNombre(String(o)) === valeur ? i : -1))
          .filter((i: number) => i >= 0);
        if (justes.length !== 1) return null;
        const { explication: _e, ...reste } = q;
        return { ...reste, reponse_correcte: justes[0] };
      });
      for (const e of f.ecartees) console.log(`[generer-qcm-theme] figure écartée (${e.raison}) : ${e.enonce}`);
      // Une seule option juste au regard du dessin.
      brutes = f.questions.filter((q: any) => {
        const options = Array.isArray(q.options) ? q.options.map(String) : null;
        const enonce = String(q.question ?? "");
        const n = !options ? null
          : q.figure ? nbOptionsJustes(enonce, options, q.figure)
          : q.droite ? nbOptionsJustesDroite(enonce, options, q.droite)
          : null;
        if (n !== null && n !== 1) console.log(`[generer-qcm-theme] ${n} option(s) juste(s) au dessin : ${q.question}`);
        return n === null || n === 1;
      });
    }

    // Validation + mélange des positions
    const questions = brutes.map((q: any) => {
      const options: string[] = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      while (options.length < 4) options.push("—");
      let idx = typeof q.reponse_correcte === "number" ? q.reponse_correcte : 0;
      if (idx < 0 || idx >= 4) idx = 0;
      const bonne = options[idx];
      const perm = [0, 1, 2, 3];
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      const newOptions = perm.map((p) => options[p]);
      return {
        question: String(q.question ?? ""),
        options: newOptions,
        reponse_correcte: newOptions.indexOf(bonne),
        explication: q.explication ? String(q.explication) : undefined,
        ...(q.figure ? { figure: q.figure } : {}),
        ...(q.droite ? { droite: q.droite } : {}),
      };
    });

    const relu = await relireQcm(questions, anthropic, { niveau });
    if (relu.questions.length === 0) {
      return NextResponse.json({ erreur: "Aucune question fiable n'a été générée. Relance la génération." }, { status: 500 });
    }

    const resultat = {
      titre: parsed.titre || titre || "QCM",
      questions: couperQcm(relu.questions, nbVoulu),
    };

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[generer-qcm-theme]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

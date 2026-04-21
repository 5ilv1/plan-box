import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * POST /api/enseignant/ecriture/suggestions-ia
 *
 * Analyse un texte d'élève et renvoie une liste de suggestions d'annotations
 * (passage à surligner + correction/suggestion + commentaire pédagogique).
 * L'enseignant valide/édite ensuite côté UI avant de poser les annotations.
 *
 * Body : { texte: string, sujet?: string }
 * → { suggestions: [{ debut, fin, extrait, suggestion, commentaire }] }
 */

interface SuggestionIA {
  debut: number;
  fin: number;
  extrait: string;
  suggestion: string;
  commentaire: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { texte, sujet } = (await req.json()) as {
    texte?: string;
    sujet?: string;
  };

  if (!texte?.trim()) {
    return NextResponse.json({ suggestions: [] });
  }

  const systemPrompt = `Tu es un professeur des écoles qui corrige le texte d'un élève de CE2/CM1/CM2 (8-11 ans).

Ton rôle : identifier des passages à améliorer et proposer une correction + un commentaire pédagogique bienveillant.

TYPES DE SUGGESTIONS :
- Orthographe (mots mal orthographiés)
- Grammaire (accords sujet-verbe, genre/nombre, temps)
- Syntaxe (ponctuation, majuscules, structure de phrase)
- Vocabulaire (mot imprécis, répétition, mot plus juste possible)
- Style (phrase qui pourrait être plus riche, idée à développer)

Pour CHAQUE suggestion, retourne un objet JSON :
- "debut" : index EXACT du premier caractère du passage dans le texte (commence à 0)
- "fin" : index EXACT du caractère suivant la fin du passage (exclusif)
- "extrait" : le passage tel qu'il apparaît dans le texte (doit correspondre à texte.slice(debut, fin))
- "suggestion" : la correction ou la reformulation proposée
- "commentaire" : UNE phrase pédagogique courte et bienveillante (ex : "Attention à l'accord avec « les arbres ».", "Tu peux remplacer « gros » par un mot plus précis.")

RÈGLES CRITIQUES :
- Les indices "debut" et "fin" doivent être EXACTS : texte.slice(debut, fin) === extrait
- Vise un passage court (1 à 6 mots maximum)
- Maximum 10 suggestions
- Priorise les suggestions les plus utiles pédagogiquement
- Commentaire encourageant, jamais négatif
- Ne propose PAS de suggestion pour ce qui est correct ou pour un simple choix stylistique légitime
- Retourne UNIQUEMENT un JSON array, rien d'autre`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${sujet ? `Sujet imposé : « ${sujet} »\n\n` : ""}Texte de l'élève :\n\n${texte}`,
        },
      ],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text;
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ suggestions: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]) as SuggestionIA[];

    // Filtrer les suggestions dont les indices sont incohérents
    const suggestions = parsed.filter((s) => {
      if (
        typeof s.debut !== "number" ||
        typeof s.fin !== "number" ||
        s.debut < 0 ||
        s.fin > texte.length ||
        s.fin <= s.debut
      ) {
        return false;
      }
      // Vérifier que l'extrait correspond vraiment (sinon on corrige)
      const slice = texte.slice(s.debut, s.fin);
      if (slice === s.extrait) return true;
      // Essayer de retrouver l'extrait dans le texte
      const idx = texte.indexOf(s.extrait);
      if (idx >= 0) {
        s.debut = idx;
        s.fin = idx + s.extrait.length;
        return true;
      }
      return false;
    });

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[ecriture/suggestions-ia]", err);
    return NextResponse.json({ erreur: "Erreur IA", suggestions: [] }, { status: 500 });
  }
}

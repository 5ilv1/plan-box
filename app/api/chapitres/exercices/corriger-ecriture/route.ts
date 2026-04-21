import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { REFERENCE_CYCLE3 } from "@/lib/ecriture-reference-cycle3";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

/**
 * POST /api/chapitres/exercices/corriger-ecriture
 * Analyse le texte de l'élève par rapport aux contraintes de l'exercice.
 * Body: { texte, consigne, contraintes, nb_phrases, tentative, exerciceId? }
 * tentative: 1 = première soumission (indices), 2 = deuxième soumission (validation finale)
 */
async function niveauDepuisExercice(exerciceId: string | undefined): Promise<"CE2" | "CM1" | "CM2"> {
  if (!exerciceId) return "CM1";
  try {
    const admin = createAdminClient();
    const { data: exo } = await admin
      .from("exercice")
      .select("chapitre_id")
      .eq("id", exerciceId)
      .single();
    if (!exo?.chapitre_id) return "CM1";
    const { data: chap } = await admin
      .from("chapitres")
      .select("niveaux(nom)")
      .eq("id", exo.chapitre_id)
      .single();
    const nom = (chap as unknown as { niveaux?: { nom?: string } })?.niveaux?.nom;
    if (nom === "CE2" || nom === "CM1" || nom === "CM2") return nom;
  } catch {}
  return "CM1";
}

export async function POST(req: NextRequest) {
  try {
    const { texte, consigne, contraintes, nb_phrases, tentative, exerciceId } = await req.json();

    if (!texte || !consigne || !contraintes) {
      return NextResponse.json({ error: "texte, consigne et contraintes requis" }, { status: 400 });
    }

    const niveau = await niveauDepuisExercice(exerciceId);
    const estDeuxiemeTentative = tentative === 2;

    const systemDynamique = `Tu es un enseignant bienveillant de français en école primaire, spécialisé ${niveau} (${niveau === "CE2" ? "8-9" : niveau === "CM1" ? "9-10" : "10-11"} ans).

Tu t'appuies sur le référentiel cycle 3 fourni en amont. Adapte ton exigence au niveau ${niveau} : ne pénalise pas sur des notions qui dépassent son programme (pas de subjonctif pour un CE2, pas d'accord complexe du participe passé pour un CE2/CM1).

Un élève de ${niveau} devait écrire ${nb_phrases || 3} phrases en respectant cette consigne :
"${consigne}"

Les contraintes à vérifier :
${(contraintes as string[]).map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

${estDeuxiemeTentative
  ? `C'est la DEUXIÈME tentative. Donne les corrections directes (mot_erroné → mot_correct).
Si les seules erreurs restantes sont mineures (contexte un peu libre, vocabulaire créatif), VALIDE le texte.`
  : `C'est la PREMIÈRE tentative.
Donne des indices courts et bienveillants pour aider l'élève à se corriger lui-même, adaptés au niveau ${niveau}.`}

Réponds en JSON valide :
{
  "nb_phrases_ecrites": <nombre de phrases détectées>,
  "valide": <true/false>,
  "erreurs": [
    {
      "phrase": "la phrase de l'élève contenant l'erreur",
      "type": "conjugaison|orthographe|grammaire|contrainte_non_respectee|nombre_phrases",
      "mot_concerne": "le mot EXACT de l'élève (OBLIGATOIRE)",
      "indice": "${estDeuxiemeTentative ? "mot_erroné → mot_correct" : "indice court pour corriger ce mot"}"
    }
  ],
  "commentaire": "commentaire encourageant (1-2 phrases) adapté au niveau ${niveau}",
  "score": <contraintes respectées / total>
}

Règles :
- Ne signale QUE les vraies erreurs de langue du niveau ${niveau} : orthographe, conjugaison, grammaire au programme
- IMPORTANT : Les contraintes d'utilisation de mots (ex: "Utiliser « est » au moins une fois") s'évaluent sur L'ENSEMBLE du texte, PAS phrase par phrase. Si le mot apparaît dans N'IMPORTE QUELLE phrase, la contrainte est respectée. Ne signale PAS l'absence d'un mot dans une phrase si ce mot est présent dans une autre phrase.
- Pour les contraintes de CONTEXTE/THÈME : sois TOLÉRANT. Si l'élève parle de nager pendant une excursion en bateau, c'est acceptable. Ne sanctionne le contexte que s'il est complètement hors sujet.
- Vérifie le nombre de phrases (doit être ${nb_phrases || 3})
- Chaque erreur DOIT avoir "mot_concerne" avec le mot exact
- L'indice doit être court (max 15 mots) et adapté au niveau ${niveau}
- Sois encourageant et bienveillant — c'est un enfant !
- Si tout est correct ou si les erreurs restantes sont mineures, "valide" = true et "erreurs" = []
- Réponds UNIQUEMENT en JSON valide, sans markdown`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: REFERENCE_CYCLE3,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: systemDynamique,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Niveau : ${niveau}\n\nTexte de l'élève :\n"""\n${texte}\n"""`,
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const json = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const analyse = JSON.parse(json);

    return NextResponse.json({ ...analyse, niveau });
  } catch (err) {
    console.error("[corriger-ecriture]", err);
    return NextResponse.json({ error: "Erreur lors de l'analyse" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { REFERENCE_CYCLE3 } from "@/lib/ecriture-reference-cycle3";
import { getServerUser } from "@/lib/server-auth";

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
  // Appelée par les élèves : on exige une session, sans exiger l'enseignant.
  // Sans ça, la clé Anthropic est utilisable par n'importe qui.
  const utilisateur = await getServerUser();
  if (!utilisateur) {
    return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });
  }

  try {
    const { texte, consigne, contraintes, nb_phrases, tentative, exerciceId } = await req.json();

    if (!texte || !consigne || !contraintes) {
      return NextResponse.json({ error: "texte, consigne et contraintes requis" }, { status: 400 });
    }

    const niveau = await niveauDepuisExercice(exerciceId);
    const estDeuxiemeTentative = tentative === 2;

    const systemDynamique = `Tu es un enseignant bienveillant de français en école primaire, spécialisé ${niveau} (${niveau === "CE2" ? "8-9" : niveau === "CM1" ? "9-10" : "10-11"} ans).

Tu t'appuies sur le référentiel cycle 3 fourni en amont. Adapte ton exigence au niveau ${niveau} : ne pénalise pas sur des notions qui dépassent son programme (pas de subjonctif pour un CE2, pas d'accord complexe du participe passé pour un CE2/CM1).

Un élève de ${niveau} devait écrire ${nb_phrases || 3} phrases.

⚠️ DISTINCTION IMPORTANTE entre la consigne et les contraintes :

CONSIGNE (cadre / inspiration, NON évaluée) :
"${consigne}"
→ La consigne donne juste un thème pour que l'élève ait quelque chose à raconter.
   Si l'élève dérive du thème (ex : la consigne parle d'une excursion sur la
   rivière mais l'élève raconte une journée à la piscine, ou même une histoire
   sans rapport), c'est OK. Le but est qu'il PRATIQUE la compétence de langue,
   pas qu'il colle au thème.

CONTRAINTES DE LANGUE (les seules qui comptent pour le score) :
${(contraintes as string[]).map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}
→ Ce sont les compétences à entraîner (temps, accords, mots imposés, etc.).
   C'est UNIQUEMENT sur ces contraintes que tu évalues le texte.

${estDeuxiemeTentative
  ? `C'est la DEUXIÈME tentative. Donne les corrections directes (mot_erroné → mot_correct).
Si les seules erreurs restantes sont mineures, VALIDE le texte.`
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
  "score": <contraintes de LANGUE respectées / total contraintes de LANGUE>
}

⚠️ RÈGLES STRICTES :

1. THÈME / CONTEXTE / SUJET de la consigne → JAMAIS pénalisé.
   - Ne crée jamais d'erreur "contrainte_non_respectee" pour un écart de thème.
   - Le score ne tient JAMAIS compte de la fidélité au thème.
   - Si l'élève écrit "Je vais aller à la piscine demain" alors que la consigne
     parlait d'excursion sur la rivière → la contrainte "futur simple" est
     respectée, point. C'est validé.

2. Contraintes de LANGUE = seules évaluées :
   - Temps verbal demandé (futur, imparfait, passé composé…) → vérifie qu'au
     moins une partie du texte utilise ce temps. Tolérant : un mélange est OK
     tant que le temps cible apparaît clairement.
   - Mots à utiliser (ex : "utiliser 'est' au moins une fois") → évalué sur
     L'ENSEMBLE du texte, pas phrase par phrase. Si le mot est dans n'importe
     quelle phrase, c'est respecté.
   - Accords, ponctuation, structure de phrase → seulement si c'est une
     contrainte explicite ET au programme du niveau ${niveau}.

3. Erreurs de langue (orthographe / conjugaison / grammaire) :
   - Ne signale QUE les vraies erreurs au programme du niveau ${niveau}.
   - Chaque erreur DOIT avoir "mot_concerne" avec le mot exact.
   - L'indice doit être court (max 15 mots) et adapté au niveau.

4. Nombre de phrases :
   - Doit être ${nb_phrases || 3}. Si différent, type="nombre_phrases".
   - Tolère ± 1 phrase si le texte est cohérent.

5. Validation finale :
   - "valide" = true dès que toutes les contraintes de LANGUE sont respectées
     et qu'il n'y a pas d'erreur grave d'orthographe/grammaire au programme.
   - Sois encourageant et bienveillant — c'est un enfant !

Réponds UNIQUEMENT en JSON valide, sans markdown.`;

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

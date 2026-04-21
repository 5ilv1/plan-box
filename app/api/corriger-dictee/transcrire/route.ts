import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

export const maxDuration = 120;

/**
 * POST /api/corriger-dictee/transcrire
 * Body: { images: string[] (base64 data-urls), bloc_id: string }
 * Retourne: { transcription: string }
 *
 * OCR aveugle : l'IA ne voit PAS le texte attendu, seulement la photo,
 * pour éviter de biaiser la transcription vers ce qu'elle devrait lire.
 * La transcription est ensuite présentée à l'élève pour validation/édition
 * avant la correction proprement dite.
 */

export async function POST(req: NextRequest) {
  const body = await req.json();
  const bloc_id: string | undefined = body.bloc_id;
  const imageList: string[] = body.images ?? (body.image ? [body.image] : []);

  if (imageList.length === 0 || !bloc_id) {
    return NextResponse.json({ error: "image(s) et bloc_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("type, eleve_id")
    .eq("id", bloc_id)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ error: "Bloc introuvable" }, { status: 404 });
  }

  if (bloc.eleve_id) {
    const user = await getServerUser();
    if (!user || user.id !== bloc.eleve_id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  }

  if (bloc.type !== "dictee" && bloc.type !== "mots") {
    return NextResponse.json({ error: "Ce bloc n'est pas une dictée ou une liste de mots" }, { status: 400 });
  }

  const estMots = bloc.type === "mots";

  // Préparer les images
  const imageBlocks: { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }[] = [];
  for (const img of imageList) {
    const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Format image invalide" }, { status: 400 });
    }
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: match[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: match[2],
      },
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
  const nbPages = imageBlocks.length;

  const prompt = estMots
    ? `Tu es un OCR spécialisé dans l'écriture manuscrite d'enfants de primaire.

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier` : "Voici la photo d'un cahier"} où un élève a écrit une liste de mots.

MISSION : transcrire EXACTEMENT ce que l'élève a écrit, mot pour mot. Tu ne dois PAS corriger les fautes — c'est tout l'intérêt : l'élève relira ta transcription et pourra corriger ton interprétation si tu t'es trompé.

⚠️ RÈGLES CRITIQUES :

1. Ne CORRIGE JAMAIS les fautes d'orthographe de l'élève.
   Il a écrit "peti" sans "t" → écris "peti".
   Il a écrit "canar" sans "d" → écris "canar".
   Il a écrit "elefan" → écris "elefan".

2. ACCENTS : reporte UNIQUEMENT ce qui est visible.
   Pas de trait au-dessus du "e" → écris "e" sans accent.
   Un petit trait oblique visible → accent.

3. LETTRES AMBIGUËS : quand tu hésites, choisis la plus SIMPLE (celle qui pourrait être une faute) plutôt que la forme "correcte". Ton rôle est de VOIR ce qui est écrit, pas d'inférer.

4. IGNORE : titre, prénom, date, numérotation, en-tête, signature, notes en marge.

Un mot par ligne. Respecte la casse.

Réponds UNIQUEMENT avec ce JSON :
{ "transcription": "mot1\\nmot2\\nmot3\\n..." }`
    : `Tu es un OCR spécialisé dans l'écriture manuscrite d'enfants de primaire.

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier` : "Voici la photo d'un cahier"} où un élève a écrit une dictée.

MISSION : transcrire EXACTEMENT ce que l'élève a écrit, mot pour mot. Tu ne dois PAS corriger les fautes — c'est tout l'intérêt : l'élève relira ta transcription et pourra corriger ton interprétation si tu t'es trompé.

⚠️ RÈGLES CRITIQUES :

1. Ne CORRIGE JAMAIS les fautes d'orthographe de l'élève.
   "il mange" reste "il mange" (pas "ils mangent" si pas de "s" visibles).
   "enfan" reste "enfan" (pas "enfant" si pas de "t" visible).
   "courure" reste "courure" (pas "coururent").

2. ACCENTS : reporte UNIQUEMENT ce qui est visible.
   Pas de trait au-dessus du "e" → écris "e" sans accent.
   Un petit trait oblique visible → accent.

3. LETTRES AMBIGUËS : quand tu hésites, choisis la plus SIMPLE (celle qui pourrait être une faute) plutôt que la forme "correcte". Ton rôle est de VOIR ce qui est écrit, pas d'inférer.

4. IGNORE : titre, prénom, nom, date, en-tête, signature, notes en marge. Commence au PREMIER MOT de la dictée, termine au dernier.

Conserve la ponctuation exacte et la casse. Une seule ligne continue, phrases séparées par leur ponctuation. Ignore les ratures barrées.

Réponds UNIQUEMENT avec ce JSON :
{ "transcription": "ce que l'élève a écrit, mot pour mot" }`;

  try {
    const resp = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const texte = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const match = texte.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("[transcrire-dictee] JSON introuvable dans la réponse");
      return NextResponse.json({ error: "Transcription IA invalide" }, { status: 500 });
    }

    const transcription = String(JSON.parse(match[0]).transcription ?? "").trim();
    if (!transcription) {
      return NextResponse.json({ error: "Transcription vide" }, { status: 500 });
    }

    return NextResponse.json({ transcription });
  } catch (err: unknown) {
    console.error("[transcrire-dictee] Erreur vision:", err);
    return NextResponse.json({ error: "Erreur lors de la lecture de la photo" }, { status: 500 });
  }
}

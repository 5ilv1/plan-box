import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

export const maxDuration = 60;

/**
 * POST /api/corriger-dictee
 * Body: { images: string[] (base64 data-urls), bloc_id: string }
 *   ou  { image: string (base64 data-url), bloc_id: string } pour rétro-compat
 * Retourne: { transcription, erreurs: [{ mot_eleve, type_erreur, indice }] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const bloc_id = body.bloc_id;
  const imageList: string[] = body.images ?? (body.image ? [body.image] : []);

  if (imageList.length === 0 || !bloc_id) {
    return NextResponse.json({ error: "image(s) et bloc_id requis" }, { status: 400 });
  }

  // Récupérer le bloc plan_travail pour obtenir le texte attendu
  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("contenu, type, eleve_id, repetibox_eleve_id")
    .eq("id", bloc_id)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ error: "Bloc introuvable" }, { status: 404 });
  }

  // Vérifier que le bloc appartient à l'élève PB authentifié
  if (bloc.eleve_id) {
    const user = await getServerUser();
    if (!user || user.id !== bloc.eleve_id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  }

  if (bloc.type !== "dictee" && bloc.type !== "mots") {
    return NextResponse.json({ error: "Ce bloc n'est pas une dictée ou une liste de mots" }, { status: 400 });
  }

  const contenu = bloc.contenu as {
    texte?: string;
    phrases?: { id: number; texte: string }[];
    mots?: { mot: string; definition: string; pronom?: string }[];
  };

  const estMots = bloc.type === "mots";
  const texteAttendu = estMots
    ? (contenu.mots ?? []).map((m) => m.pronom ? `${m.pronom} ${m.mot}` : m.mot).join("\n")
    : contenu.texte || contenu.phrases?.map((p) => p.texte).join(" ") || "";

  if (!texteAttendu) {
    return NextResponse.json({ error: "Contenu de référence introuvable" }, { status: 400 });
  }

  // Extraire le base64 et le media type depuis chaque data-url
  const imageBlocks: { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }[] = [];
  for (const img of imageList) {
    const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Format image invalide (data-url base64 attendu)" }, { status: 400 });
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

  const promptDictee = `Tu es un enseignant bienveillant qui corrige la dictée d'un élève de primaire (CE2-CM2).

TEXTE ATTENDU DE LA DICTÉE :
"""
${texteAttendu}
"""

L'élève a écrit sa dictée sur son cahier. ${nbPages > 1 ? `Voici les ${nbPages} pages de sa dictée.` : "Voici la photo de ce qu'il a écrit."}

CONSIGNES :
1. Transcris exactement ce que l'élève a écrit (avec ses erreurs).
2. Compare avec le texte attendu et identifie chaque erreur.
3. Pour chaque erreur, donne un INDICE pédagogique qui met l'élève sur la voie SANS donner la réponse. L'indice doit l'aider à trouver la correction lui-même.

Types d'indices selon l'erreur :
- Lettre muette → "Essaie de mettre ce mot au féminin (ou au pluriel) pour entendre la lettre cachée."
- Accord sujet/verbe → "Relis la phrase : qui fait l'action ? Est-ce singulier ou pluriel ?"
- Accord adjectif → "L'adjectif s'accorde avec le nom. Ce nom est-il masculin ou féminin ? Singulier ou pluriel ?"
- Conjugaison → "Ce verbe est du Xe groupe. Comment se conjugue-t-il au [temps] avec [sujet] ?"
- Homophone → "a/à, et/est, son/sont… Essaie de remplacer par [astuce] pour vérifier."
- Mot oublié → "Relis ta phrase entre « X » et « Y » : il manque un petit mot."
- Orthographe lexicale → "Ce mot est difficile ! Il fait partie de ta liste de mots. Essaie de t'en souvenir."
- Majuscule → "En début de phrase ou pour un nom propre, quelle lettre faut-il ?"
- Ponctuation → "Vérifie la ponctuation à la fin de ta phrase."`;

  const promptMots = `Tu es un enseignant bienveillant qui corrige la dictée de mots d'un élève de primaire (CE2-CM2).

LISTE DES MOTS ATTENDUS (un par ligne) :
"""
${texteAttendu}
"""

L'élève a écrit ces mots sur son cahier. ${nbPages > 1 ? `Voici les ${nbPages} pages.` : "Voici la photo de ce qu'il a écrit."}

CONSIGNES :
1. Transcris exactement les mots que l'élève a écrits (avec ses erreurs).
2. Compare chaque mot avec la liste attendue et identifie chaque erreur d'orthographe.
3. Pour chaque erreur, donne un INDICE pédagogique qui met l'élève sur la voie SANS donner la réponse.
4. Si un mot de la liste est absent (oublié), signale-le aussi.

Types d'indices :
- Lettre muette → "Essaie de mettre ce mot au féminin (ou au pluriel) pour entendre la lettre cachée."
- Accent manquant/mauvais → "Ce mot a un accent. Écoute bien la voyelle : est-ce un accent aigu, grave ou circonflexe ?"
- Lettre doublée → "Ce mot a une consonne doublée. Écoute bien le son au milieu du mot."
- Orthographe lexicale → "Ce mot est dans ta liste. Ferme les yeux, essaie de le visualiser lettre par lettre."
- Mot oublié → "Il manque un mot dans ta liste ! Relis les mots que tu devais apprendre."`;

  const promptFin = `

Réponds UNIQUEMENT avec ce JSON (pas de texte autour) :
{
  "transcription": "ce que l'élève a écrit, mot pour mot",
  "nb_mots_corrects": <nombre>,
  "nb_mots_total": <nombre>,
  "erreurs": [
    {
      "mot_eleve": "ce que l'élève a écrit",
      "mot_attendu": "ce qui était attendu (pour usage interne, ne sera PAS montré à l'élève)",
      "type_erreur": "lettre_muette|accord_sujet_verbe|accord_adjectif|conjugaison|homophone|mot_oublie|orthographe|majuscule|ponctuation|accent|lettre_doublee|autre",
      "indice": "l'indice pédagogique bienveillant"
    }
  ]
}`;

  const prompt = (estMots ? promptMots : promptDictee) + promptFin;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const texteReponse = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Parser le JSON depuis la réponse
    const jsonMatch = texteReponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 500 });
    }

    const resultat = JSON.parse(jsonMatch[0]);

    // Retirer mot_attendu des erreurs avant d'envoyer au client (l'élève ne doit pas voir la réponse)
    const erreursSansReponse = (resultat.erreurs || []).map((e: Record<string, unknown>) => ({
      mot_eleve: e.mot_eleve,
      type_erreur: e.type_erreur,
      indice: e.indice,
    }));

    return NextResponse.json({
      transcription: resultat.transcription,
      nb_mots_corrects: resultat.nb_mots_corrects,
      nb_mots_total: resultat.nb_mots_total,
      erreurs: erreursSansReponse,
    });
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse de la dictée" },
      { status: 500 },
    );
  }
}

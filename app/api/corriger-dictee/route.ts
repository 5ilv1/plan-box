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
 *
 * Pipeline en 2 passes (plus fiable qu'une seule passe vision+texte) :
 *  1. VISION : on demande à Claude de transcrire FIDÈLEMENT ce qu'il voit,
 *     sans lui montrer le texte attendu (sinon il « lit » le texte attendu
 *     et rate les fautes de l'élève).
 *  2. COMPARAISON : on envoie la transcription + le texte attendu à Claude
 *     en texte pur, et on lui demande de lister toutes les erreurs avec
 *     indices pédagogiques.
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

  // ───────────────────────────────────────────────────────────────────────────
  // PASSE 1 — VISION : transcription fidèle (sans montrer le texte attendu)
  // ───────────────────────────────────────────────────────────────────────────
  const promptTranscription = estMots
    ? `Tu es un assistant OCR spécialisé dans l'écriture manuscrite d'enfants.

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier` : "Voici la photo d'un cahier"} où un élève de primaire a écrit une liste de mots.

TA MISSION : transcrire EXACTEMENT ce que l'élève a écrit, lettre par lettre, MÊME SI C'EST FAUX.

RÈGLES ABSOLUES :
- Ne CORRIGE PAS les fautes. Reproduis les erreurs d'orthographe, d'accent, de majuscule, de lettre doublée, etc.
- Si l'élève a écrit "maison" avec un seul "o" (mason), tu transcris "mason".
- Si l'élève a oublié un accent, tu l'omets aussi.
- Si l'écriture est ambiguë entre deux lettres, choisis la lettre qui donnerait le MOT LE PLUS PROCHE d'un mot français existant (mais sans inventer).
- Un mot par ligne (comme sur le cahier).
- Ignore les ratures visiblement barrées.

Réponds UNIQUEMENT avec ce JSON (pas de texte autour) :
{
  "transcription": "ligne1\\nligne2\\n..."
}`
    : `Tu es un assistant OCR spécialisé dans l'écriture manuscrite d'enfants.

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier` : "Voici la photo d'un cahier"} où un élève de primaire a écrit une dictée.

TA MISSION : transcrire EXACTEMENT ce que l'élève a écrit, mot par mot, MÊME SI C'EST FAUX.

RÈGLES ABSOLUES :
- Ne CORRIGE PAS les fautes. Reproduis toutes les erreurs : orthographe, accords, accents, majuscules, ponctuation, lettres doublées, mots oubliés, mots en trop, conjugaisons erronées…
- Si l'élève a écrit "il mange" au lieu de "ils mangent", tu transcris "il mange".
- Si l'élève a écrit "à" au lieu de "a", tu écris "à".
- Si un mot est manquant, ne l'invente pas.
- Si un mot est en trop, garde-le.
- Conserve la ponctuation et la casse telles qu'écrites.
- Mets les phrases sur une seule ligne continue, séparées par un espace.
- Ignore les ratures visiblement barrées.

Réponds UNIQUEMENT avec ce JSON (pas de texte autour) :
{
  "transcription": "ce que l'élève a vraiment écrit, mot pour mot"
}`;

  let transcription = "";
  try {
    const respVision = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: promptTranscription },
          ],
        },
      ],
    });

    const texteVision = respVision.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const matchVision = texteVision.match(/\{[\s\S]*\}/);
    if (!matchVision) {
      return NextResponse.json({ error: "Transcription IA invalide" }, { status: 500 });
    }
    const parsedVision = JSON.parse(matchVision[0]);
    transcription = String(parsedVision.transcription ?? "").trim();
    if (!transcription) {
      return NextResponse.json({ error: "Transcription vide" }, { status: 500 });
    }
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur vision:", err);
    return NextResponse.json({ error: "Erreur lors de la lecture de la photo" }, { status: 500 });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PASSE 2 — COMPARAISON : texte pur, toutes les erreurs listées
  // ───────────────────────────────────────────────────────────────────────────
  const promptComparaison = estMots
    ? `Tu es un enseignant bienveillant qui corrige la dictée de mots d'un élève de primaire (CE2-CM2).

LISTE DES MOTS ATTENDUS (un par ligne) :
"""
${texteAttendu}
"""

CE QUE L'ÉLÈVE A ÉCRIT (transcription fidèle, erreurs comprises) :
"""
${transcription}
"""

TA MISSION : compare mot à mot la transcription à la liste attendue et liste TOUTES les erreurs, sans en oublier.

RÈGLES STRICTES :
- Ne considère PAS un mot comme correct s'il diffère d'une seule lettre, d'un accent ou d'une majuscule.
- Pour chaque mot attendu absent ou mal orthographié → une entrée dans "erreurs".
- Pour chaque mot en trop écrit par l'élève → une entrée avec type "autre".
- Le champ "nb_mots_corrects" est le nombre de mots de la liste attendue écrits PARFAITEMENT (identiques à la version attendue).
- Le champ "nb_mots_total" est le nombre total de mots dans la liste attendue.

Types d'erreurs possibles :
- lettre_muette | accord_adjectif | accent | lettre_doublee | orthographe | majuscule | mot_oublie | autre

Donne un INDICE pédagogique bienveillant qui met l'élève sur la voie SANS donner la réponse.`
    : `Tu es un enseignant bienveillant qui corrige la dictée d'un élève de primaire (CE2-CM2).

TEXTE ATTENDU DE LA DICTÉE :
"""
${texteAttendu}
"""

CE QUE L'ÉLÈVE A ÉCRIT (transcription fidèle, erreurs comprises) :
"""
${transcription}
"""

TA MISSION : compare les deux textes mot à mot et liste TOUTES les erreurs de l'élève, sans en oublier une seule.

RÈGLES STRICTES :
- Parcours le texte attendu de gauche à droite et, pour chaque mot, vérifie s'il correspond EXACTEMENT (orthographe, accent, majuscule, ponctuation) au mot écrit par l'élève.
- Un mot qui diffère d'une lettre, d'un accent, d'une majuscule ou d'une terminaison d'accord est une ERREUR.
- Une ponctuation manquante ou erronée est une erreur (type "ponctuation").
- Un mot absent est une erreur type "mot_oublie".
- Un mot en trop est une erreur type "autre".
- Tu dois lister absolument CHAQUE différence. Il vaut mieux trop d'erreurs qu'en oublier.

nb_mots_total = nombre de mots dans le texte attendu.
nb_mots_corrects = nombre de mots du texte attendu retrouvés à l'identique dans la production de l'élève.

Types d'erreurs possibles :
- lettre_muette | accord_sujet_verbe | accord_adjectif | conjugaison | homophone | mot_oublie | orthographe | majuscule | ponctuation | accent | lettre_doublee | autre

Types d'indices selon l'erreur :
- Lettre muette → "Essaie de mettre ce mot au féminin (ou au pluriel) pour entendre la lettre cachée."
- Accord sujet/verbe → "Relis la phrase : qui fait l'action ? Est-ce singulier ou pluriel ?"
- Accord adjectif → "L'adjectif s'accorde avec le nom. Ce nom est-il masculin ou féminin ? Singulier ou pluriel ?"
- Conjugaison → "Ce verbe est du Xe groupe. Comment se conjugue-t-il au [temps] avec [sujet] ?"
- Homophone → "a/à, et/est, son/sont… Essaie de remplacer par [astuce] pour vérifier."
- Mot oublié → "Relis ta phrase entre « X » et « Y » : il manque un petit mot."
- Orthographe lexicale → "Ce mot est difficile ! Essaie de t'en souvenir."
- Majuscule → "En début de phrase ou pour un nom propre, quelle lettre faut-il ?"
- Ponctuation → "Vérifie la ponctuation à la fin de ta phrase."
- Accent → "Écoute bien la voyelle : aigu, grave ou circonflexe ?"`;

  const promptFin = `

Réponds UNIQUEMENT avec ce JSON (pas de texte autour) :
{
  "nb_mots_corrects": <nombre>,
  "nb_mots_total": <nombre>,
  "erreurs": [
    {
      "mot_eleve": "ce que l'élève a écrit (ou vide si mot oublié)",
      "mot_attendu": "ce qui était attendu (usage interne, pas montré à l'élève)",
      "type_erreur": "lettre_muette|accord_sujet_verbe|accord_adjectif|conjugaison|homophone|mot_oublie|orthographe|majuscule|ponctuation|accent|lettre_doublee|autre",
      "indice": "indice pédagogique bienveillant, ne donne PAS la réponse"
    }
  ]
}`;

  try {
    const respCompar = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [
        { role: "user", content: promptComparaison + promptFin },
      ],
    });

    const texteCompar = respCompar.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = texteCompar.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 500 });
    }

    const resultat = JSON.parse(jsonMatch[0]);

    // Retirer mot_attendu des erreurs avant d'envoyer au client
    const erreursSansReponse = (resultat.erreurs || []).map((e: Record<string, unknown>) => ({
      mot_eleve: e.mot_eleve,
      type_erreur: e.type_erreur,
      indice: e.indice,
    }));

    return NextResponse.json({
      transcription,
      nb_mots_corrects: resultat.nb_mots_corrects,
      nb_mots_total: resultat.nb_mots_total,
      erreurs: erreursSansReponse,
    });
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur comparaison:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse de la dictée" },
      { status: 500 },
    );
  }
}

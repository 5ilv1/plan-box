import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export const maxDuration = 300;

// Limite Vercel serverless : ~4.5 MB — on augmente pour cette route
export const dynamic = "force-dynamic";

// Taille max PDF (Vercel + Anthropic accepte jusqu'à 32 MB)
const TAILLE_MAX_MO = 25;

export async function POST(req: Request) {
  try {
    let pdfBase64: string | undefined;

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // Mode FormData (préféré pour gros fichiers — évite l'explosion mémoire navigateur)
      const formData = await req.formData();
      const file = formData.get("pdf");
      if (!(file instanceof File)) {
        return NextResponse.json({ erreur: "PDF manquant." }, { status: 400 });
      }
      if (file.size > TAILLE_MAX_MO * 1024 * 1024) {
        return NextResponse.json(
          { erreur: `PDF trop volumineux (${Math.round(file.size / 1024 / 1024)} MB). Max ${TAILLE_MAX_MO} MB.` },
          { status: 413 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      pdfBase64 = buffer.toString("base64");
    } else {
      // Ancien mode JSON (rétrocompat)
      const body = await req.json();
      pdfBase64 = body.pdfBase64;
    }

    if (!pdfBase64) {
      return NextResponse.json({ erreur: "PDF manquant." }, { status: 400 });
    }

    const systemPrompt = `Tu es un expert en analyse de livres jeunesse.

À partir du PDF fourni, identifie TOUS les chapitres du livre et extrais leur texte intégral.

RÈGLES STRICTES :
- Identifie chaque chapitre comme une unité narrative (numéro + titre quand il y a).
- Ignore : pages de garde, table des matières, remerciements, dédicaces, 4e de couverture.
- Inclure : prologue, épilogue (en tant que chapitres à part entière).
- Pour chaque chapitre, extrais le texte COMPLET tel qu'écrit dans le livre, proprement formaté en paragraphes.
- Préserve la ponctuation, les dialogues, les sauts de paragraphes.
- NE PAS résumer, NE PAS paraphraser, NE PAS abréger — texte intégral.
- Si un chapitre n'a pas de titre, utilise "Chapitre N" (ou "Prologue"/"Épilogue" selon le cas).

Réponds UNIQUEMENT en JSON valide, sans backticks, avec cette structure :
{
  "titre_livre": "Titre du livre (si détecté)",
  "auteur": "Auteur (si détecté, sinon null)",
  "chapitres": [
    {
      "ordre": 1,
      "titre": "Chapitre 1 — Le départ",
      "texte": "Texte complet du chapitre..."
    }
  ]
}`;

    // Streaming obligatoire pour max_tokens élevé (SDK bloque sinon)
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 64000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: "Extrais tous les chapitres de ce livre avec leur texte intégral." },
          ],
        },
      ],
    });

    const finalMessage = await stream.finalMessage();
    const text = (finalMessage.content[0] as { type: "text"; text: string }).text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const resultat = JSON.parse(cleaned);

    if (!Array.isArray(resultat.chapitres) || resultat.chapitres.length === 0) {
      return NextResponse.json({ erreur: "Aucun chapitre détecté dans le PDF." }, { status: 500 });
    }

    // Ajoute un nbMots par chapitre pour affichage
    for (const c of resultat.chapitres) {
      c.nb_mots = (c.texte ?? "").split(/\s+/).filter(Boolean).length;
    }

    return NextResponse.json({ resultat });
  } catch (err: unknown) {
    console.error("[extraire-chapitres-livre]", err);

    // Erreur de rate limit Anthropic (Tier 1 : 30k tokens/min)
    const isRateLimit =
      (err as { status?: number })?.status === 429 ||
      (err instanceof Error && /rate[_\s-]?limit|429/i.test(err.message));

    if (isRateLimit) {
      return NextResponse.json(
        {
          erreur:
            "Le livre dépasse la limite de tokens par minute de ton compte Anthropic (30 000 tokens/min au Tier 1). Utilise plutôt le mode « Ajouter un chapitre manuellement » pour traiter le livre chapitre par chapitre, ou divise le PDF en plusieurs parties plus courtes (~50 pages max).",
          code: "rate_limit",
        },
        { status: 429 }
      );
    }

    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

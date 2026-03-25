import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase-admin";
import { enonceePonctuation } from "@/lib/dictee-utils";

// POST /api/tts/generer-dictee
// Body: { dictee_id: string, niveau_etoiles: number, texte_complet: string, phrases: { id: number; texte: string }[] }
// Génère audio complet + par phrase, stocke dans Supabase Storage, met à jour table dictees
export async function POST(req: NextRequest) {
  try {
    const { dictee_id, niveau_etoiles, texte_complet, phrases } = await req.json();
    if (!dictee_id || !niveau_etoiles || !texte_complet || !phrases) {
      return NextResponse.json({ erreur: "Paramètres manquants" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const admin = createAdminClient();
    const base = `dictees/${dictee_id}/niveau_${niveau_etoiles}`;

    // Helper : générer audio + upload + retourner URL publique
    async function genererEtUploader(texte: string, chemin: string, lent = false): Promise<string> {
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "shimmer",
        input: enonceePonctuation(texte),
        response_format: "mp3",
        speed: lent ? 0.8 : 0.85,
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      await admin.storage.from("dictees").upload(chemin, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });
      const { data: { publicUrl } } = admin.storage.from("dictees").getPublicUrl(chemin);
      return publicUrl;
    }

    // 1. Audio complet (légèrement ralenti)
    const audioCompletUrl = await genererEtUploader(texte_complet, `${base}/complet.mp3`);

    // 2. Audio par phrase (encore plus lent, en séquentiel pour ne pas surcharger l'API)
    const audioPhraseUrls: { id: number; url: string }[] = [];
    for (const phrase of phrases as { id: number; texte: string }[]) {
      const url = await genererEtUploader(phrase.texte, `${base}/phrase_${phrase.id}.mp3`, true);
      audioPhraseUrls.push({ id: phrase.id, url });
    }

    // 3. Mettre à jour la table dictees
    const { data: dicteeRow } = await admin
      .from("dictees")
      .update({
        audio_complet_url: audioCompletUrl,
        audio_phrases_urls: audioPhraseUrls,
      })
      .eq("id", dictee_id)
      .select("titre, niveau_etoiles")
      .single();

    // 4. Mettre à jour plan_travail.contenu pour que les élèves voient les URLs audio
    // On cible les blocs dictée ayant le même titre et le même niveau_etoiles
    if (dicteeRow?.titre) {
      const { data: blocsAPatcher } = await admin
        .from("plan_travail")
        .select("id, contenu")
        .eq("type", "dictee")
        .eq("titre", dicteeRow.titre)
        .filter("contenu->niveau_etoiles", "eq", niveau_etoiles);

      if (blocsAPatcher && blocsAPatcher.length > 0) {
        await Promise.all(
          blocsAPatcher.map((b) =>
            admin.from("plan_travail").update({
              contenu: {
                ...(b.contenu as Record<string, unknown>),
                audio_complet_url: audioCompletUrl,
                audio_phrases_urls: audioPhraseUrls,
              },
            }).eq("id", b.id)
          )
        );
        console.log(`[TTS] ${blocsAPatcher.length} bloc(s) plan_travail mis à jour avec les URLs audio`);
      }
    }

    return NextResponse.json({ ok: true, audioCompletUrl, audioPhraseUrls });
  } catch (err) {
    console.error("[TTS generer-dictee]", err);
    return NextResponse.json({ erreur: "Échec génération audio." }, { status: 500 });
  }
}

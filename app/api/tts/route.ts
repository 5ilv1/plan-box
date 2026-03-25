import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase-admin";
import { enonceePonctuation } from "@/lib/dictee-utils";

// POST /api/tts
// Génère un fichier audio via OpenAI TTS et le stocke dans Supabase Storage
// Body: { texte: string, cheminStockage: string, dictee?: boolean }
//   dictee=true  → la ponctuation est prononcée à voix haute ("virgule", "point"…)
//   dictee=false → comportement TTS standard (défaut)
// Retourne: { url: string }
export async function POST(req: NextRequest) {
  try {
    const { texte, cheminStockage, dictee } = await req.json();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (!texte || !cheminStockage) {
      return NextResponse.json({ erreur: "texte et cheminStockage requis" }, { status: 400 });
    }

    // En mode dictée, on épelle la ponctuation pour que l'élève puisse la noter
    const texteALire = dictee ? enonceePonctuation(texte) : texte;

    // Génération audio via OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "shimmer",
      input: texteALire,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    // Upload dans Supabase Storage (bucket "dictees", accès public)
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("dictees")
      .upload(cheminStockage, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[TTS] Erreur upload Supabase:", uploadError.message);
      return NextResponse.json({ erreur: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage
      .from("dictees")
      .getPublicUrl(cheminStockage);

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("[TTS] Erreur:", err);
    return NextResponse.json({ erreur: "Échec de la synthèse vocale." }, { status: 500 });
  }
}

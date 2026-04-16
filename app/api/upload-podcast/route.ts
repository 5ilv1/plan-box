import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/upload-podcast
 * Body JSON: { nom: string, contentType?: string }
 *
 * Génère une URL signée Supabase Storage pour que le client uploade
 * directement le fichier MP3 (évite la limite 4 MB Vercel).
 *
 * Retourne: { token, path, publicUrl }
 */
export async function POST(req: NextRequest) {
  try {
    const { nom, contentType } = await req.json().catch(() => ({}));
    if (!nom) {
      return NextResponse.json({ error: "Nom de fichier requis" }, { status: 400 });
    }

    const ext  = (nom as string).split(".").pop()?.toLowerCase() ?? "mp3";
    const path = `podcasts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const admin = createAdminClient();

    const { data, error } = await admin.storage
      .from("podcasts")
      .createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Erreur presign" }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage.from("podcasts").getPublicUrl(path);

    return NextResponse.json({ token: data.token, path: data.path, publicUrl });
  } catch (err) {
    console.error("[upload-podcast]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

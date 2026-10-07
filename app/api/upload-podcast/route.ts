import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { cleDepuisUrlR2, supprimerR2, urlEnvoiR2, urlPubliqueR2 } from "@/lib/r2";

/**
 * POST /api/upload-podcast
 * Body JSON: { nom: string, contentType?: string }
 *
 * Génère une URL signée Cloudflare R2 pour que le client dépose
 * directement le fichier MP3 (évite la limite 4 Mo Vercel).
 * Les podcasts ne vont plus dans Supabase Storage : voir lib/r2.ts.
 *
 * Retourne: { uploadUrl, headers, publicUrl } — le client fait
 * `fetch(uploadUrl, { method: "PUT", headers, body: fichier })`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  try {
    const { nom, contentType } = await req.json().catch(() => ({}));
    if (!nom) {
      return NextResponse.json({ error: "Nom de fichier requis" }, { status: 400 });
    }

    const ext = (nom as string).split(".").pop()?.toLowerCase() ?? "mp3";
    const cle = `podcasts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { url, headers } = await urlEnvoiR2(cle, (contentType as string) || "audio/mpeg");

    return NextResponse.json({ uploadUrl: url, headers, publicUrl: urlPubliqueR2(cle) });
  } catch (err) {
    console.error("[upload-podcast]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/upload-podcast
 * Body JSON: { url: string }
 *
 * Supprime le fichier d'un podcast remplacé. Accepte une adresse R2 ou
 * une ancienne adresse Supabase Storage ; toute autre adresse est ignorée.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  try {
    const { url } = await req.json().catch(() => ({}));
    if (typeof url !== "string") {
      return NextResponse.json({ error: "Adresse requise" }, { status: 400 });
    }

    const cleR2 = cleDepuisUrlR2(url);
    if (cleR2) {
      await supprimerR2(cleR2);
      return NextResponse.json({ ok: true });
    }

    const ancien = url.match(/\/storage\/v1\/object\/public\/podcasts\/(.+)$/);
    if (ancien) {
      await createAdminClient().storage.from("podcasts").remove([ancien[1]]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload-podcast DELETE]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

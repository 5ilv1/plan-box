import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * POST /api/upload-couverture
 * Body JSON: { nom: string }
 *
 * Génère une URL signée pour uploader une couverture de livre
 * dans le bucket `couvertures` (accessible publiquement en lecture).
 *
 * Retourne: { token, path, publicUrl }
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  try {
    const { nom } = await req.json().catch(() => ({}));
    if (!nom) {
      return NextResponse.json({ error: "Nom de fichier requis" }, { status: 400 });
    }

    const ext = (nom as string).split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const admin = createAdminClient();

    const { data, error } = await admin.storage
      .from("couvertures")
      .createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Erreur presign" }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage.from("couvertures").getPublicUrl(path);

    return NextResponse.json({ token: data.token, path: data.path, publicUrl });
  } catch (err) {
    console.error("[upload-couverture]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

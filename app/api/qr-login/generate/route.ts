import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/qr-login/generate
 * Body: { eleveAuthId: string }
 *
 * Crée ou renouvelle un token QR long-durée (1 an) pour un élève Repetibox.
 * Retourne { token: string } — le token est intégré dans l'URL du QR code.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { eleveAuthId } = body ?? {};

  if (!eleveAuthId) {
    return NextResponse.json({ erreur: "eleveAuthId requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérifier que l'élève existe dans auth.users
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(eleveAuthId);
  if (userError || !userData.user) {
    return NextResponse.json({ erreur: "Utilisateur introuvable" }, { status: 404 });
  }

  // Upsert le token QR (un token par élève, renouvelable)
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const { data: existing } = await admin
    .from("qr_tokens")
    .select("token")
    .eq("eleve_auth_id", eleveAuthId)
    .single();

  if (existing) {
    // Renouveler l'expiration
    await admin
      .from("qr_tokens")
      .update({ expires_at: expiresAt.toISOString() })
      .eq("eleve_auth_id", eleveAuthId);
    return NextResponse.json({ token: existing.token });
  }

  // Créer un nouveau token
  const { data: newToken, error: insertError } = await admin
    .from("qr_tokens")
    .insert({ eleve_auth_id: eleveAuthId, expires_at: expiresAt.toISOString() })
    .select("token")
    .single();

  if (insertError || !newToken) {
    return NextResponse.json({ erreur: "Erreur création token" }, { status: 500 });
  }

  return NextResponse.json({ token: newToken.token });
}

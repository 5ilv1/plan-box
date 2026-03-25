import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/qr-login/verify
 * Body: { token: string }
 *
 * Vérifie un token QR, génère un magic link Supabase pour l'élève.
 * Retourne { actionLink: string } — le client redirige vers ce lien.
 *
 * Le magic link a une durée de vie courte (configurable dans Supabase)
 * mais est regénéré à chaque scan. Le token QR lui-même dure 1 an.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token } = body ?? {};

  if (!token) {
    return NextResponse.json({ erreur: "Token requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérifier le token
  const { data: tokenRow, error } = await admin
    .from("qr_tokens")
    .select("eleve_auth_id, expires_at")
    .eq("token", token)
    .single();

  if (error || !tokenRow) {
    return NextResponse.json({ erreur: "QR code invalide ou inconnu." }, { status: 404 });
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ erreur: "QR code expiré. Demande un nouveau code à ton enseignant." }, { status: 410 });
  }

  // Récupérer l'email de l'utilisateur
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(tokenRow.eleve_auth_id);
  if (userError || !userData.user?.email) {
    return NextResponse.json({ erreur: "Utilisateur introuvable." }, { status: 404 });
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/eleve/dashboard`;

  // Générer un magic link à usage unique
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json({ erreur: "Erreur génération lien de connexion." }, { status: 500 });
  }

  return NextResponse.json({ actionLink: linkData.properties.action_link });
}

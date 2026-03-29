import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/qr-login/verify
 * Body: { token: string }
 *
 * Vérifie un token QR, génère un OTP Supabase, le vérifie immédiatement
 * côté serveur et retourne { accessToken, refreshToken } au client.
 *
 * Le client appelle ensuite supabase.auth.setSession() directement,
 * sans passer par le flow redirect/PKCE qui requiert un code verifier
 * stocké côté client.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token } = body ?? {};

  if (!token) {
    return NextResponse.json({ erreur: "Token requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Vérifier le token QR
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

  // 2. Récupérer l'email de l'utilisateur
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(tokenRow.eleve_auth_id);
  if (userError || !userData.user?.email) {
    return NextResponse.json({ erreur: "Utilisateur introuvable." }, { status: 404 });
  }

  const email = userData.user.email;

  // 3. Générer un OTP à usage unique
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData?.properties?.email_otp) {
    return NextResponse.json({ erreur: "Erreur génération OTP." }, { status: 500 });
  }

  // 4. Vérifier l'OTP côté serveur → obtenir les tokens directement
  const { data: otpData, error: otpError } = await admin.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: "email",
  });

  if (otpError || !otpData?.session) {
    console.error("verifyOtp error:", otpError?.message);
    return NextResponse.json({ erreur: "Impossible d'établir la session." }, { status: 500 });
  }

  // 5. Invalider le token QR après usage (sécurité : usage unique)
  await admin.from("qr_tokens").delete().eq("token", token);

  return NextResponse.json({
    accessToken: otpData.session.access_token,
    refreshToken: otpData.session.refresh_token,
  });
}

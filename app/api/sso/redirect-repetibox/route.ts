import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/sso/redirect-repetibox
 *
 * Génère un magic link Supabase pour l'utilisateur connecté
 * et redirige vers Repetibox sans re-authentification.
 */
export async function GET() {
  const user = await getServerUser();
  if (!user || !user.email) {
    return NextResponse.redirect(new URL("/eleve", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }

  const admin = createAdminClient();
  const repetiboxUrl = process.env.NEXT_PUBLIC_REPETIBOX_URL || "https://leitner-app-kohl.vercel.app";

  try {
    // Générer un magic link via Supabase admin
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: {
        redirectTo: `${repetiboxUrl}/eleve/dashboard`,
      },
    });

    if (error || !data?.properties?.action_link) {
      console.error("[SSO] Erreur magic link:", error?.message);
      // Fallback : rediriger normalement sans SSO
      return NextResponse.redirect(repetiboxUrl);
    }

    // Rediriger vers le magic link Supabase qui va authentifier l'utilisateur
    return NextResponse.redirect(data.properties.action_link);
  } catch (err) {
    console.error("[SSO] Erreur:", err);
    return NextResponse.redirect(repetiboxUrl);
  }
}

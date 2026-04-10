import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function getServerUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Vérifie que l'utilisateur est authentifié ET est l'enseignant.
 * Retourne le user si OK, ou une NextResponse 401/403 sinon.
 */
export async function requireEnseignant(): Promise<
  | { user: NonNullable<Awaited<ReturnType<typeof getServerUser>>>; error?: never }
  | { user?: never; error: NextResponse }
> {
  const user = await getServerUser();
  if (!user) {
    return { error: NextResponse.json({ erreur: "Non authentifié" }, { status: 401 }) };
  }

  // Vérifier par email OU par possession d'une classe
  const enseignantEmail = process.env.APP_ENSEIGNANT_EMAIL;
  if (enseignantEmail && user.email === enseignantEmail) {
    return { user };
  }

  // Fallback : vérifier si l'utilisateur possède au moins une classe
  const { createClient: createAdmin } = await import("@supabase/supabase-js");
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const { data: classes } = await admin
    .from("classe")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (!classes || classes.length === 0) {
    return { error: NextResponse.json({ erreur: "Accès réservé à l'enseignant" }, { status: 403 }) };
  }

  return { user };
}

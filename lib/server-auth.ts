import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PLANBOX_AUTH_COOKIE } from "./supabase";

export async function getServerUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Même nom de cookie que le client navigateur (lib/supabase.ts), sinon
      // le serveur ne retrouve pas la session Plan Box.
      cookieOptions: { name: PLANBOX_AUTH_COOKIE },
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

/**
 * Comme requireEnseignant(), mais autorise aussi un appel signé par CRON_SECRET
 * via le header "Authorization: Bearer <CRON_SECRET>". Utile pour les routes
 * qui sont appelées en interne par un cron Vercel ET par l'enseignant.
 */
export async function requireEnseignantOrCron(
  req: Request,
): Promise<
  | { ok: true; user?: NonNullable<Awaited<ReturnType<typeof getServerUser>>>; error?: never }
  | { ok?: false; user?: never; error: NextResponse }
> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return { ok: true };
  }
  const r = await requireEnseignant();
  if (r.error) return { error: r.error };
  return { ok: true, user: r.user };
}

/**
 * Vérifie que l'utilisateur authentifié est :
 *  - soit l'enseignant (autorisé sur tous les élèves)
 *  - soit l'élève propriétaire (eleveId === user.id pour PlanBox,
 *    ou eleve.auth_id === user.id pour Repetibox)
 *
 * Au moins un de eleveId / repetiboxId doit être fourni.
 */
export async function requireProprietaireOuEnseignant(
  eleveId: string | null,
  repetiboxId: number | null,
): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getServerUser>>>; error?: never }
  | { ok?: false; user?: never; error: NextResponse }
> {
  const user = await getServerUser();
  if (!user) {
    return { error: NextResponse.json({ erreur: "Non authentifié" }, { status: 401 }) };
  }

  // Cas 1 : enseignant (email ou possession d'une classe)
  const enseignantEmail = process.env.APP_ENSEIGNANT_EMAIL;
  if (enseignantEmail && user.email === enseignantEmail) {
    return { ok: true, user };
  }

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
  if (classes && classes.length > 0) {
    return { ok: true, user };
  }

  // Cas 2 : élève PlanBox propriétaire
  if (eleveId && eleveId === user.id) {
    return { ok: true, user };
  }

  // Cas 3 : élève Repetibox propriétaire (table eleve, champ auth_id)
  if (repetiboxId != null) {
    const { data: eleve } = await admin
      .from("eleve")
      .select("auth_id")
      .eq("id", repetiboxId)
      .maybeSingle();
    if (eleve?.auth_id === user.id) {
      return { ok: true, user };
    }
  }

  return { error: NextResponse.json({ erreur: "Accès refusé" }, { status: 403 }) };
}

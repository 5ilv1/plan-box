import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/enseignant/exercice-resultat/forcer-validation
 * Body: { resultat_id: string, action: "forcer" | "annuler" }
 *
 * - "forcer"  : score = total, valide = true, force_par_enseignant = true
 * - "annuler" : valide = false, force_par_enseignant = false
 *               (le score reste celui du dernier essai réel ; on ne le réécrit pas
 *               car on n'a pas conservé l'historique avant le forçage)
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  let body: { resultat_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreur: "Body JSON invalide" }, { status: 400 });
  }

  const { resultat_id, action } = body;
  if (!resultat_id || !action || !["forcer", "annuler"].includes(action)) {
    return NextResponse.json(
      { erreur: "resultat_id et action ('forcer' | 'annuler') requis" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Lire l'état actuel pour avoir le total
  const { data: ligne, error: errLecture } = await admin
    .from("exercice_resultat")
    .select("id, total, score, valide, force_par_enseignant")
    .eq("id", resultat_id)
    .maybeSingle();

  if (errLecture || !ligne) {
    return NextResponse.json({ erreur: "Résultat introuvable" }, { status: 404 });
  }

  const update: Record<string, unknown> =
    action === "forcer"
      ? { score: ligne.total, valide: true, force_par_enseignant: true }
      : { valide: false, force_par_enseignant: false };

  const { error } = await admin
    .from("exercice_resultat")
    .update(update)
    .eq("id", resultat_id);

  if (error) {
    console.error("[forcer-validation]", error);
    return NextResponse.json({ erreur: "Erreur mise à jour" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action });
}

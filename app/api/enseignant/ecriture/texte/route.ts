import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { normaliserContenuEcriture } from "@/lib/ecriture-normaliser";

/**
 * POST /api/enseignant/ecriture/texte
 *
 * Permet à l'enseignant de corriger directement le texte d'un élève.
 * Met à jour `texte_courant` (et `texte_final` si le bloc est déjà envoyé).
 *
 * Body : { blocId, texte }
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { blocId, texte } = (await req.json()) as { blocId?: string; texte?: string };
  if (!blocId || typeof texte !== "string") {
    return NextResponse.json({ erreur: "blocId et texte requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("id, contenu")
    .eq("id", blocId)
    .single();
  if (error || !bloc) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);
  contenu.texte_courant = texte;
  if (contenu.date_envoi && contenu.texte_final) {
    contenu.texte_final = texte;
  }

  await admin.from("plan_travail").update({ contenu }).eq("id", blocId);

  return NextResponse.json({ ok: true, contenu });
}

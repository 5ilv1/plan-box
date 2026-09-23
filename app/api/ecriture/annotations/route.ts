import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";
import { normaliserContenuEcriture } from "@/lib/ecriture-normaliser";

/**
 * GET /api/ecriture/annotations?blocId=...
 *
 * Retourne la liste des annotations enseignant pour un bloc d'atelier d'écriture
 * (utilisé par le polling côté élève, toutes les 20 s).
 */
export async function GET(req: NextRequest) {
  const blocId = req.nextUrl.searchParams.get("blocId");
  if (!blocId) {
    return NextResponse.json({ erreur: "blocId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("contenu, eleve_id, repetibox_eleve_id")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ annotations: [] });
  }

  // Les annotations citent le texte de l'élève : réservées à lui et à
  // l'enseignant, pas à quiconque connaît l'identifiant du bloc.
  const garde = await requireProprietaireOuEnseignant(bloc.eleve_id, bloc.repetibox_eleve_id);
  if (garde.error) return garde.error;

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);
  return NextResponse.json({ annotations: contenu.annotations });
}

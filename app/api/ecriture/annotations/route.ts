import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
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
    .select("contenu")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ annotations: [] });
  }

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);
  return NextResponse.json({ annotations: contenu.annotations });
}

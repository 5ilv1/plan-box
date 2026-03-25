import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/repetibox-eleve-by-auth?auth_id=<uuid>
 *
 * Retourne les infos d'un élève Repetibox à partir de son auth_id Supabase.
 * Utilisé par useEleveSession pour identifier les élèves migrés (@planbox.local).
 */
export async function GET(req: NextRequest) {
  const authId = req.nextUrl.searchParams.get("auth_id");

  if (!authId) {
    return NextResponse.json({ erreur: "Paramètre auth_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("eleve")
    .select("id, prenom, nom")
    .eq("auth_id", authId)
    .single();

  if (error || !data) {
    return NextResponse.json({ erreur: "Élève introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id as number,
    prenom: data.prenom as string,
    nom: data.nom as string,
  });
}

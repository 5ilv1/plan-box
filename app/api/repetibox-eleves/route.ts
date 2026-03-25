import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/repetibox-eleves
 *
 * Retourne la liste des élèves de la table "eleve" (Repetibox, integer IDs).
 * Utilise le client admin pour bypasser les RLS.
 * Route serveur uniquement — clé secrète jamais exposée au navigateur.
 */
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("eleve")
    .select("id, prenom, nom, identifiant, auth_id")
    .order("prenom");

  if (error) {
    console.error("[API /repetibox-eleves]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ eleves: data ?? [] });
}

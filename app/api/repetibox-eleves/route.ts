import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * GET /api/repetibox-eleves
 *
 * Retourne la liste des élèves de la table "eleve" (Repetibox, integer IDs).
 * Utilise le client admin pour bypasser les RLS.
 * Route serveur uniquement — clé secrète jamais exposée au navigateur.
 *
 * ?avecIdentifiants=1 ajoute le mot de passe en clair (cartes de connexion à
 * imprimer). Réservé à l'enseignant, donc jamais renvoyé par défaut.
 */
export async function GET(request: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const avecIdentifiants = request.nextUrl.searchParams.get("avecIdentifiants") === "1";

  const admin = createAdminClient();

  const colonnes = [
    "id",
    "prenom",
    "nom",
    "identifiant",
    "auth_id",
    "avatar_bigheads",
    ...(avecIdentifiants ? ["mot_de_passe"] : []),
  ].join(", ");

  const { data, error } = await admin
    .from("eleve")
    .select(colonnes)
    .order("prenom");

  if (error) {
    console.error("[API /repetibox-eleves]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ eleves: data ?? [] });
}

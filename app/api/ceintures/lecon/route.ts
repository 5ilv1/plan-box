import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/ceintures/lecon?item_code=P16
 *
 * La leçon d'un item : la règle, la procédure, deux exemples travaillés et le
 * piège. Format : docs/ceintures/SPEC-LECONS.md.
 *
 * C'est la SEULE route qui sert une leçon, et la page évaluation ne l'appelle
 * jamais — une leçon pendant l'évaluation donnerait la règle au moment précis
 * où l'on vérifie qu'elle est acquise.
 *
 * Pas d'authentification : le contenu est identique pour toute la classe et ne
 * porte aucune donnée d'élève, comme les exercices eux-mêmes.
 */
export async function GET(req: NextRequest) {
  const itemCode = req.nextUrl.searchParams.get("item_code")?.trim().toUpperCase();

  if (!itemCode) {
    return NextResponse.json({ erreur: "item_code requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ceinture_item")
    .select("code, libelle, lecon")
    .eq("code", itemCode)
    .maybeSingle();

  if (error) {
    console.error("[ceintures/lecon]", error);
    return NextResponse.json({ erreur: "Erreur de lecture" }, { status: 500 });
  }

  // Un item sans leçon n'est pas une erreur : l'élève ira droit à l'exercice.
  return NextResponse.json({
    lecon: data?.lecon ?? null,
    item_libelle: data?.libelle ?? null,
  });
}

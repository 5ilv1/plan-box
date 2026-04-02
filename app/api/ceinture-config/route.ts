import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/ceinture-config?enseignant_id=UUID
 * Retourne la config ceintures pour tous les groupes de l'enseignant
 */
export async function GET(req: NextRequest) {
  const enseignantId = req.nextUrl.searchParams.get("enseignant_id");
  if (!enseignantId) {
    return NextResponse.json({ error: "enseignant_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Récupérer tous les groupes (la table n'a pas de colonne enseignant_id)
  const { data: groupes } = await admin
    .from("groupes")
    .select("id, nom")
    .order("nom");

  if (!groupes) return NextResponse.json({ groupes: [] });

  // Récupérer les configs existantes
  const { data: configs } = await admin
    .from("ceinture_config")
    .select("groupe_id, actif")
    .in("groupe_id", groupes.map((g) => g.id));

  const configMap = new Map((configs ?? []).map((c) => [c.groupe_id, c.actif]));

  return NextResponse.json({
    groupes: groupes.map((g) => ({
      id: g.id,
      nom: g.nom,
      actif: configMap.get(g.id) ?? false, // désactivé par défaut
    })),
  });
}

/**
 * POST /api/ceinture-config
 * Body: { groupe_id, actif }
 */
export async function POST(req: NextRequest) {
  const { groupe_id, actif } = await req.json();

  if (!groupe_id || actif === undefined) {
    return NextResponse.json({ error: "groupe_id et actif requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("ceinture_config")
    .upsert({ groupe_id, actif }, { onConflict: "groupe_id" });

  if (error) {
    console.error("[ceinture-config] Erreur:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

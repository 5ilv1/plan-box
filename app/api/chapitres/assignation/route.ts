import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/chapitres/assignation?chapitre_id=UUID
 * Retourne tous les groupes avec leur statut d'assignation pour ce chapitre.
 */
export async function GET(req: NextRequest) {
  const chapitreId = req.nextUrl.searchParams.get("chapitre_id");
  if (!chapitreId) {
    return NextResponse.json({ error: "chapitre_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Tous les groupes
  const { data: groupes, error: errGroupes } = await admin
    .from("groupes")
    .select("id, nom")
    .order("nom");

  if (errGroupes) {
    console.error("[assignation GET] groupes", errGroupes);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }

  // 2. Assignations existantes pour ce chapitre
  const { data: assignations } = await admin
    .from("chapitre_assignation")
    .select("groupe_id, actif")
    .eq("chapitre_id", chapitreId);

  const assignMap = new Map((assignations ?? []).map((a) => [a.groupe_id, a.actif]));

  // 3. Fusionner
  const result = (groupes ?? []).map((g) => ({
    id: g.id,
    nom: g.nom,
    actif: assignMap.get(g.id) ?? false,
  }));

  return NextResponse.json({ groupes: result });
}

/**
 * POST /api/chapitres/assignation
 * Toggle une assignation. Body: { chapitre_id, groupe_id, actif }
 * Upsert dans chapitre_assignation.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { chapitre_id, groupe_id, actif } = body;

  if (!chapitre_id || !groupe_id || actif === undefined) {
    return NextResponse.json({ error: "chapitre_id, groupe_id et actif requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chapitre_assignation")
    .upsert(
      { chapitre_id, groupe_id, actif },
      { onConflict: "chapitre_id,groupe_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[assignation POST]", error);
    return NextResponse.json({ error: "Erreur lors de l'assignation" }, { status: 500 });
  }

  return NextResponse.json(data);
}

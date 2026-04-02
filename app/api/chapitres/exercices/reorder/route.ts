import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/chapitres/exercices/reorder
 * Body: { exercice_ids: string[] } — tableau d'IDs dans le nouvel ordre.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { exercice_ids } = body;

  if (!Array.isArray(exercice_ids) || exercice_ids.length === 0) {
    return NextResponse.json({ error: "exercice_ids requis (tableau non vide)" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Mettre à jour l'ordre de chaque exercice
  const updates = exercice_ids.map((id: string, index: number) =>
    admin.from("exercice").update({ ordre: index + 1 }).eq("id", id)
  );

  const results = await Promise.all(updates);

  const erreur = results.find((r) => r.error);
  if (erreur?.error) {
    console.error("[reorder]", erreur.error);
    return NextResponse.json({ error: "Erreur lors du réordonnancement" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

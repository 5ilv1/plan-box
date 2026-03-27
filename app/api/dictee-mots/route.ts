import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/dictee-mots?parent_id=xxx
 * Retourne tous les mots uniques (dédupliqués) pour un dictee_parent_id donné
 * (toutes les étoiles / niveaux confondus).
 */
export async function GET(req: NextRequest) {
  const parentId = req.nextUrl.searchParams.get("parent_id");
  if (!parentId) {
    return NextResponse.json({ error: "parent_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dictees")
    .select("mots")
    .eq("dictee_parent_id", parentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fusionner et dédupliquer les mots de tous les niveaux
  const seen = new Set<string>();
  const motsUniques: { mot: string; definition: string }[] = [];

  for (const row of data ?? []) {
    const mots = row.mots as { mot: string; definition: string }[] | null;
    if (!Array.isArray(mots)) continue;
    for (const m of mots) {
      const key = m.mot.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        motsUniques.push({ mot: m.mot, definition: m.definition });
      }
    }
  }

  return NextResponse.json({ mots: motsUniques });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { CEINTURES } from "@/lib/ceintures";

/**
 * GET /api/ceinture-progression?eleve_id=UUID ou ?rb_id=5
 * Retourne : { ceinture_index, dernier_score_pct }
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ error: "eleve_id ou rb_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Trouver la ceinture la plus haute obtenue (évaluation réussie)
  let query = admin
    .from("ceinture_resultat")
    .select("ceinture_index")
    .eq("mode", "evaluation")
    .eq("reussi", true)
    .order("ceinture_index", { ascending: false })
    .limit(1);

  if (eleveId) query = query.eq("eleve_id", eleveId);
  else query = query.eq("repetibox_eleve_id", parseInt(rbId!, 10));

  const { data: evalReussies } = await query;

  const maxReussi = evalReussies?.[0]?.ceinture_index ?? -1;
  const ceintureIndex = Math.min(maxReussi + 1, CEINTURES.length - 1);

  // Dernier score d'entraînement sur cette ceinture
  let queryDernier = admin
    .from("ceinture_resultat")
    .select("nb_correct, nb_total")
    .eq("ceinture_index", ceintureIndex)
    .eq("mode", "entrainement")
    .order("created_at", { ascending: false })
    .limit(1);

  if (eleveId) queryDernier = queryDernier.eq("eleve_id", eleveId);
  else queryDernier = queryDernier.eq("repetibox_eleve_id", parseInt(rbId!, 10));

  const { data: derniers } = await queryDernier;
  const dernierScorePct = derniers?.[0]
    ? Math.round((derniers[0].nb_correct / derniers[0].nb_total) * 100)
    : null;

  return NextResponse.json({
    ceinture_index: ceintureIndex,
    dernier_score_pct: dernierScorePct,
  });
}

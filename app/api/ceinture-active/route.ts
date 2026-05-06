import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";

/**
 * GET /api/ceinture-active?eleve_id=UUID ou ?rb_id=5
 * Retourne { actif: boolean } — true si au moins un groupe de l'élève a les ceintures activées
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ actif: false });
  }

  const rbIdNum = rbId ? parseInt(rbId, 10) : null;
  const auth = await requireProprietaireOuEnseignant(
    eleveId,
    rbIdNum != null && !isNaN(rbIdNum) ? rbIdNum : null,
  );
  if (auth.error) return auth.error;

  const admin = createAdminClient();

  // Trouver les groupes de l'élève
  let query = admin.from("eleve_groupe").select("groupe_id");
  if (eleveId) query = query.eq("planbox_eleve_id", eleveId);
  else query = query.eq("repetibox_eleve_id", parseInt(rbId!, 10));

  const { data: groupes } = await query;
  if (!groupes || groupes.length === 0) {
    return NextResponse.json({ actif: false });
  }

  // Vérifier si au moins un de ces groupes a les ceintures activées
  const { data: configs } = await admin
    .from("ceinture_config")
    .select("groupe_id")
    .eq("actif", true)
    .in("groupe_id", groupes.map((g) => g.groupe_id));

  return NextResponse.json({ actif: (configs?.length ?? 0) > 0 });
}

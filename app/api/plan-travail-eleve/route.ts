import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/plan-travail-eleve?eleveId=<uuid>&debut=<YYYY-MM-DD>&fin=<YYYY-MM-DD>
// GET /api/plan-travail-eleve?eleveId=rb_<N>&debut=<YYYY-MM-DD>&fin=<YYYY-MM-DD>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const debut = searchParams.get("debut");
  const fin = searchParams.get("fin");

  if (!eleveId || !debut || !fin) {
    return NextResponse.json({ erreur: "Paramètres manquants" }, { status: 400 });
  }

  const admin = createAdminClient();
  const isRepetibox = eleveId.startsWith("rb_");

  let query = admin
    .from("plan_travail")
    .select("id, type, titre, statut, date_assignation, date_limite, periodicite, contenu")
    .gte("date_assignation", debut)
    .lte("date_assignation", fin)
    .order("date_assignation")
    .order("created_at");

  if (isRepetibox) {
    const rbId = parseInt(eleveId.slice(3), 10);
    if (isNaN(rbId)) return NextResponse.json({ erreur: "ID invalide" }, { status: 400 });
    query = query.eq("repetibox_eleve_id", rbId);
  } else {
    query = query.eq("eleve_id", eleveId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ blocs: data ?? [] });
}

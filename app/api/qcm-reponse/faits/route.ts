import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/qcm-reponse/faits?qcm_ids=a,b,c&eleve_id=...        (Plan Box)
// GET /api/qcm-reponse/faits?qcm_ids=a,b,c&rb_id=26             (Repetibox)
// → { faits: ["qcm_id_1", "qcm_id_2"] }  — qcm_ids auxquels l'élève a répondu
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qcmIdsRaw = searchParams.get("qcm_ids");
  const eleveId = searchParams.get("eleve_id");
  const rbIdRaw = searchParams.get("rb_id");

  if (!qcmIdsRaw) {
    return NextResponse.json({ erreur: "qcm_ids requis" }, { status: 400 });
  }
  if (!eleveId && !rbIdRaw) {
    return NextResponse.json({ erreur: "eleve_id ou rb_id requis" }, { status: 400 });
  }

  const qcmIds = qcmIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (qcmIds.length === 0) {
    return NextResponse.json({ faits: [] });
  }

  const admin = createAdminClient();
  let query = admin.from("qcm_reponse").select("qcm_id").in("qcm_id", qcmIds);

  if (eleveId) {
    query = query.eq("eleve_id", eleveId);
  } else if (rbIdRaw) {
    const rbId = parseInt(rbIdRaw, 10);
    if (isNaN(rbId)) {
      return NextResponse.json({ erreur: "rb_id invalide" }, { status: 400 });
    }
    query = query.eq("repetibox_eleve_id", rbId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  const faits = [...new Set((data ?? []).map((r) => r.qcm_id))];
  return NextResponse.json({ faits });
}

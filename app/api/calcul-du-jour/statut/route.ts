import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NIVEAUX_IDS } from "@/lib/calcul-jour";

/**
 * GET /api/calcul-du-jour/statut?date=YYYY-MM-DD  (défaut : aujourd'hui, UTC)
 *
 * Endpoint PUBLIC en lecture seule, destiné au monitoring (cron, supervision).
 * Indique uniquement, pour chaque niveau, si le calcul du jour existe et à
 * quelle heure il a été créé. N'expose JAMAIS les nombres ni la réponse du
 * calcul → aucune triche possible.
 */
export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ?? new Date().toISOString().split("T")[0];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calcul_jour")
    .select("niveau_id, created_at")
    .eq("date", date)
    .in("niveau_id", Object.values(NIVEAUX_IDS));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const createdParId = new Map<string, string>(
    (data ?? []).map((r) => [r.niveau_id as string, r.created_at as string]),
  );

  const niveaux: Record<string, { present: boolean; created_at: string | null }> = {};
  for (const [nom, id] of Object.entries(NIVEAUX_IDS)) {
    const created = createdParId.get(id) ?? null;
    niveaux[nom] = { present: created != null, created_at: created };
  }

  const tousPresents = Object.values(niveaux).every((n) => n.present);

  return NextResponse.json({ date, tous_presents: tousPresents, niveaux });
}

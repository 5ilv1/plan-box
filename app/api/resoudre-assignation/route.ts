import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { AssignationSelecteur } from "@/types";

/**
 * POST /api/resoudre-assignation
 * Résout une assignation côté serveur (bypass RLS) pour obtenir la liste d'élèves.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const assignation: AssignationSelecteur = body.assignation;

  if (!assignation) {
    return NextResponse.json({ error: "assignation manquante" }, { status: 400 });
  }

  const admin = createAdminClient();
  const uidsSet = new Set<string>();

  if (assignation.groupeIds.length > 0) {
    // Table PlanBox (eleve_groupe)
    const { data: membresPB } = await admin
      .from("eleve_groupe")
      .select("planbox_eleve_id, repetibox_eleve_id")
      .in("groupe_id", assignation.groupeIds);

    for (const m of membresPB ?? []) {
      if (m.planbox_eleve_id) uidsSet.add(`pb_${m.planbox_eleve_id}`);
      if (m.repetibox_eleve_id) uidsSet.add(`rb_${m.repetibox_eleve_id}`);
    }

    // Table Repetibox (groupe_eleve)
    const { data: membresRB } = await admin
      .from("groupe_eleve")
      .select("eleve_id")
      .in("groupe_id", assignation.groupeIds);

    for (const m of membresRB ?? []) {
      if (m.eleve_id) uidsSet.add(`rb_${m.eleve_id}`);
    }
  }

  // Élèves individuels
  for (const uid of assignation.eleveUids) {
    uidsSet.add(uid);
  }

  const eleves = Array.from(uidsSet).map((uid) => {
    if (uid.startsWith("rb_")) {
      return { uid, eleve_id: null, repetibox_eleve_id: parseInt(uid.replace("rb_", ""), 10) };
    }
    return { uid, eleve_id: uid.replace("pb_", ""), repetibox_eleve_id: null };
  });

  return NextResponse.json({ eleves });
}

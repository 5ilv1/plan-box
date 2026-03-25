import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { batchId, parentIds, titres, titresMots } = await req.json();

    if (!batchId || !parentIds?.length || !titres?.length) {
      return NextResponse.json({ erreur: "Paramètres manquants." }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Supprimer les dictées par batch_id
    const { error: e1 } = await admin.from("dictees").delete().eq("batch_id", batchId);
    if (e1) console.error("[supprimer-dictee-semaine] dictees batch_id:", e1.message);

    // 2. Backward-compat : supprimer aussi par dictee_parent_id
    const { error: e2 } = await admin.from("dictees").delete().in("dictee_parent_id", parentIds);
    if (e2) console.error("[supprimer-dictee-semaine] dictees parent_id:", e2.message);

    // 3. Supprimer plan_travail type "dictee"
    const { error: e3, count: c3 } = await admin
      .from("plan_travail")
      .delete({ count: "exact" })
      .eq("type", "dictee")
      .in("titre", titres);
    if (e3) console.error("[supprimer-dictee-semaine] plan_travail dictee:", e3.message);

    // 4. Supprimer plan_travail type "mots"
    const { error: e4, count: c4 } = await admin
      .from("plan_travail")
      .delete({ count: "exact" })
      .eq("type", "mots")
      .in("titre", titresMots);
    if (e4) console.error("[supprimer-dictee-semaine] plan_travail mots:", e4.message);

    if (e1 || e2 || e3 || e4) {
      return NextResponse.json(
        { erreur: (e1 || e2 || e3 || e4)?.message ?? "Erreur inconnue" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, planTravailSupprimes: (c3 ?? 0) + (c4 ?? 0) });
  } catch (err) {
    console.error("[supprimer-dictee-semaine]", err);
    return NextResponse.json({ erreur: "Erreur serveur." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { batchId, parentIds, titres, titresMots, titresRevision } = await req.json();

    if (!batchId || !parentIds?.length || !titres?.length) {
      return NextResponse.json({ erreur: "Paramètres manquants." }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Supprimer les dictées par batch_id
    const { error: e1, count: c1batch } = await admin.from("dictees").delete({ count: "exact" }).eq("batch_id", batchId);
    if (e1) console.error("[supprimer-dictee-semaine] dictees batch_id:", e1.message);

    // 2. Backward-compat : supprimer aussi par dictee_parent_id (anciennes dictées sans batch_id)
    const { error: e2 } = await admin.from("dictees").delete().in("dictee_parent_id", parentIds);
    if (e2) console.error("[supprimer-dictee-semaine] dictees parent_id:", e2.message);

    // 2b. Si batch_id n'a rien supprimé, essayer aussi par id directement (batchId = parentId pour les anciennes)
    if ((c1batch ?? 0) === 0) {
      const { error: e2b } = await admin.from("dictees").delete().eq("dictee_parent_id", batchId);
      if (e2b) console.error("[supprimer-dictee-semaine] dictees fallback parent_id:", e2b.message);
    }

    // 3. Supprimer plan_travail type "dictee"
    const { error: e3, count: c3 } = await admin
      .from("plan_travail")
      .delete({ count: "exact" })
      .eq("type", "dictee")
      .in("titre", titres);
    if (e3) console.error("[supprimer-dictee-semaine] plan_travail dictee:", e3.message);

    // 4. Supprimer plan_travail type "mots" (mots de la semaine)
    const { error: e4, count: c4 } = await admin
      .from("plan_travail")
      .delete({ count: "exact" })
      .eq("type", "mots")
      .in("titre", titresMots);
    if (e4) console.error("[supprimer-dictee-semaine] plan_travail mots:", e4.message);

    // 5. Supprimer plan_travail type "mots" (révisions mots)
    let c5 = 0;
    let e5: { message: string } | null = null;
    if (titresRevision?.length) {
      const { error, count } = await admin
        .from("plan_travail")
        .delete({ count: "exact" })
        .eq("type", "mots")
        .in("titre", titresRevision);
      if (error) { e5 = error; console.error("[supprimer-dictee-semaine] plan_travail revision:", error.message); }
      c5 = count ?? 0;
    }

    // Erreur critique seulement si la suppression dictees ET plan_travail échouent toutes
    const erreursCritiques = [e3, e4, e5].filter(Boolean);
    if (erreursCritiques.length > 0) {
      console.error("[supprimer-dictee-semaine] erreurs:", erreursCritiques.map((e) => e?.message));
    }

    return NextResponse.json({ ok: true, planTravailSupprimes: (c3 ?? 0) + (c4 ?? 0) + c5 });
  } catch (err) {
    console.error("[supprimer-dictee-semaine]", err);
    return NextResponse.json({ erreur: "Erreur serveur." }, { status: 500 });
  }
}

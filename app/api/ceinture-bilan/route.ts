import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { CEINTURES } from "@/lib/ceintures";

/**
 * GET /api/ceinture-bilan?eleve_id=UUID ou ?rb_id=5
 * Retourne les stats complètes pour la page bilan
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ actif: false });
  }

  const admin = createAdminClient();
  const filter = eleveId
    ? { col: "eleve_id", val: eleveId }
    : { col: "repetibox_eleve_id", val: parseInt(rbId!, 10) };

  // Vérifier si les ceintures sont activées pour cet élève
  const table = eleveId ? "planbox_eleve_id" : "repetibox_eleve_id";
  const { data: groupes } = await admin
    .from("eleve_groupe")
    .select("groupe_id")
    .eq(table, filter.val);

  if (!groupes || groupes.length === 0) {
    return NextResponse.json({ actif: false });
  }

  const { data: configs } = await admin
    .from("ceinture_config")
    .select("groupe_id")
    .eq("actif", true)
    .in("groupe_id", groupes.map((g) => g.groupe_id));

  if (!configs || configs.length === 0) {
    return NextResponse.json({ actif: false });
  }

  // Toutes les évaluations réussies (ceintures obtenues)
  const { data: evalReussies } = await admin
    .from("ceinture_resultat")
    .select("ceinture_index, created_at")
    .eq(filter.col, filter.val)
    .eq("mode", "evaluation")
    .eq("reussi", true)
    .order("ceinture_index", { ascending: true });

  const ceinturesObtenues = new Map<number, string>();
  for (const e of evalReussies ?? []) {
    if (!ceinturesObtenues.has(e.ceinture_index)) {
      ceinturesObtenues.set(e.ceinture_index, e.created_at);
    }
  }

  // Ceinture actuelle
  const maxReussi = evalReussies?.length
    ? Math.max(...evalReussies.map((e) => e.ceinture_index))
    : -1;
  const ceintureIndex = Math.min(maxReussi + 1, CEINTURES.length - 1);

  // Tous les résultats (pour stats globales)
  const { data: tousResultats } = await admin
    .from("ceinture_resultat")
    .select("mode, nb_correct, nb_total, temps_ms")
    .eq(filter.col, filter.val);

  const entrainements = (tousResultats ?? []).filter((r) => r.mode === "entrainement");
  const nbEntrainements = entrainements.length;
  const tempsMoyen = nbEntrainements > 0
    ? Math.round(entrainements.reduce((s, r) => s + (r.temps_ms ?? 0), 0) / nbEntrainements / 1000)
    : 0;

  // Dernier score d'entraînement sur la ceinture actuelle
  const { data: dernierEntr } = await admin
    .from("ceinture_resultat")
    .select("nb_correct, nb_total")
    .eq(filter.col, filter.val)
    .eq("ceinture_index", ceintureIndex)
    .eq("mode", "entrainement")
    .order("created_at", { ascending: false })
    .limit(1);

  const dernierScore = dernierEntr?.[0]
    ? { bon: dernierEntr[0].nb_correct, total: dernierEntr[0].nb_total }
    : null;

  return NextResponse.json({
    actif: true,
    ceintureIndex,
    nbObtenues: ceinturesObtenues.size,
    nbTotal: CEINTURES.length,
    nbEntrainements,
    tempsMoyenSec: tempsMoyen,
    dernierScore,
    ceintures: CEINTURES.map((c) => ({
      index: c.index,
      nom: c.nom,
      couleur: c.couleur,
      obtenue: ceinturesObtenues.has(c.index),
      dateObtention: ceinturesObtenues.get(c.index) ?? null,
      enCours: c.index === ceintureIndex,
    })),
  });
}

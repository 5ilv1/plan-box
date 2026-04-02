import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { CEINTURES } from "@/lib/ceintures";

/**
 * POST /api/ceinture-resultat
 * Body: { eleve_id?, repetibox_eleve_id?, ceinture_index, mode, nb_correct, nb_total, temps_ms, reussi, details }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    eleve_id,
    repetibox_eleve_id,
    ceinture_index,
    mode,
    nb_correct,
    nb_total,
    temps_ms,
    reussi,
    details,
  } = body;

  if ((!eleve_id && !repetibox_eleve_id) || ceinture_index === undefined || !mode) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin.from("ceinture_resultat").insert({
    eleve_id: eleve_id || null,
    repetibox_eleve_id: repetibox_eleve_id || null,
    ceinture_index,
    mode,
    nb_correct,
    nb_total,
    temps_ms,
    reussi,
    details,
  });

  if (error) {
    console.error("[ceinture-resultat] Erreur insert:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }

  // Si évaluation réussie, retourner la nouvelle ceinture
  let nouvelleCeinture: number | undefined;
  if (mode === "evaluation" && reussi) {
    nouvelleCeinture = Math.min(ceinture_index + 1, CEINTURES.length - 1);
  }

  return NextResponse.json({
    ok: true,
    nouvelle_ceinture: nouvelleCeinture,
  });
}

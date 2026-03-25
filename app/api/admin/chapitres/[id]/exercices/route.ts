import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/admin/chapitres/[id]/exercices
// Retourne les exercices du chapitre avec stats élèves
// ?check_delete=<exerciceId> → retourne le nb de plan_travail non-fait liés
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapitreId } = await params;
  const admin = createAdminClient();

  const checkDeleteId = new URL(req.url).searchParams.get("check_delete");

  // Mode vérification avant suppression
  if (checkDeleteId) {
    const { data: ex } = await admin
      .from("banque_exercices")
      .select("titre")
      .eq("id", checkDeleteId)
      .single();

    const { count } = await admin
      .from("plan_travail")
      .select("*", { count: "exact", head: true })
      .eq("chapitre_id", chapitreId)
      .eq("titre", ex?.titre ?? "___INTROUVABLE___")
      .neq("statut", "fait");

    return NextResponse.json({ nonFait: count ?? 0 });
  }

  // Mode normal : exercices + stats
  const { data: exercices, error } = await admin
    .from("banque_exercices")
    .select("*")
    .eq("chapitre_id", chapitreId)
    .order("ordre", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Statistiques élèves : plan_travail pour ce chapitre
  const { data: planStats } = await admin
    .from("plan_travail")
    .select("titre, statut, eleve_id, repetibox_eleve_id")
    .eq("chapitre_id", chapitreId)
    .in("type", ["exercice", "calcul_mental"]);

  // Calcul par exercice (appariement par titre)
  const exercicesAvecStats = (exercices ?? []).map((ex) => {
    const matching = (planStats ?? []).filter((pt) => pt.titre === ex.titre);

    const elevesTotal = new Set([
      ...matching.filter((pt) => pt.eleve_id).map((pt) => pt.eleve_id as string),
      ...matching
        .filter((pt) => pt.repetibox_eleve_id)
        .map((pt) => `rb_${pt.repetibox_eleve_id}`),
    ]);

    const elevesValides = new Set([
      ...matching
        .filter((pt) => pt.statut === "fait" && pt.eleve_id)
        .map((pt) => pt.eleve_id as string),
      ...matching
        .filter((pt) => pt.statut === "fait" && pt.repetibox_eleve_id)
        .map((pt) => `rb_${pt.repetibox_eleve_id}`),
    ]);

    return {
      ...ex,
      stats: { total: elevesTotal.size, valides: elevesValides.size },
    };
  });

  return NextResponse.json({ exercices: exercicesAvecStats });
}

// PATCH /api/admin/chapitres/[id]/exercices
// Met à jour l'ordre des exercices : body = { ordre: [{ id, ordre }] }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapitreId } = await params;
  const { ordre } = await req.json().catch(() => ({ ordre: [] }));

  if (!Array.isArray(ordre)) {
    return NextResponse.json({ erreur: "ordre requis (tableau)" }, { status: 400 });
  }

  const admin = createAdminClient();

  await Promise.all(
    ordre.map(({ id, ordre: o }: { id: string; ordre: number }) =>
      admin
        .from("banque_exercices")
        .update({ ordre: o })
        .eq("id", id)
        .eq("chapitre_id", chapitreId)
    )
  );

  return NextResponse.json({ ok: true });
}

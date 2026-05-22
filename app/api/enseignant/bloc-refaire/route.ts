import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * POST /api/enseignant/bloc-refaire
 *
 * Remet un bloc plan_travail en statut "a_faire" et efface le score
 * stocké dans contenu (score_eleve, score_total, reponses_eleve…).
 *
 * Cas spécial : calcul du jour (pas dans plan_travail) → supprime les
 * lignes calcul_jour_resultat correspondantes.
 *
 * Body :
 *   - { type: "bloc", id: string }
 *   - { type: "calcul_jour", calcul_id: string, eleve_id?: string, rb_eleve_id?: number }
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Body manquant" }, { status: 400 });

  const admin = createAdminClient();

  if (body.type === "calcul_jour") {
    const { calcul_id, eleve_id, rb_eleve_id } = body as {
      calcul_id?: string; eleve_id?: string; rb_eleve_id?: number;
    };
    if (!calcul_id || (!eleve_id && rb_eleve_id === undefined)) {
      return NextResponse.json({ erreur: "calcul_id et eleve_id/rb_eleve_id requis" }, { status: 400 });
    }
    let q = admin.from("calcul_jour_resultat").delete().eq("calcul_id", calcul_id);
    if (eleve_id) q = q.eq("eleve_id", eleve_id);
    else if (rb_eleve_id !== undefined) q = q.eq("rb_eleve_id", rb_eleve_id);
    const { error } = await q;
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Cas par défaut : bloc plan_travail
  const blocId = body.id as string | undefined;
  if (!blocId) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const { data: bloc } = await admin
    .from("plan_travail")
    .select("id, contenu")
    .eq("id", blocId)
    .single();
  if (!bloc) return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });

  // Efface les champs de scoring du contenu
  const contenu = (bloc.contenu ?? {}) as Record<string, unknown>;
  const nouveau = { ...contenu };
  delete nouveau.score_eleve;
  delete nouveau.score_total;
  delete nouveau.premier_score;
  delete nouveau.premier_score_total;
  delete nouveau.reponses_eleve;
  delete nouveau.nb_tentatives;

  const { error } = await admin
    .from("plan_travail")
    .update({ statut: "a_faire", contenu: nouveau })
    .eq("id", blocId);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

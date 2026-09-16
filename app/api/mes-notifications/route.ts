import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Notifications d'un élève Repetibox.
 *
 * Les élèves PlanBox lisent `notifications` en direct via RLS ; les élèves
 * Repetibox n'ont pas de session Supabase exploitable côté navigateur et
 * passent, comme pour leur plan de travail, par une route serveur.
 *
 * GET   /api/mes-notifications?rb=<id>   → les notifications non lues
 * PATCH /api/mes-notifications           → { id, rb } marque comme lue
 */

const COLONNES = "id, type, message, chapitre_id, lu, created_at, chapitres(titre)";

export async function GET(req: NextRequest) {
  const rb = parseInt(req.nextUrl.searchParams.get("rb") ?? "", 10);
  if (isNaN(rb)) return NextResponse.json({ erreur: "Paramètre rb requis" }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("notifications")
    .select(COLONNES)
    .eq("rb_eleve_id", rb)
    .eq("lu", false)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const { id, rb } = (await req.json().catch(() => ({}))) as { id?: string; rb?: number };
  const rbId = parseInt(String(rb), 10);
  if (!id || isNaN(rbId)) {
    return NextResponse.json({ erreur: "Paramètres id et rb requis" }, { status: 400 });
  }

  // Le filtre sur `rb_eleve_id` est la vérification de propriété : un élève ne
  // peut pas marquer lue la notification d'un autre.
  const { error } = await createAdminClient()
    .from("notifications")
    .update({ lu: true })
    .eq("id", id)
    .eq("rb_eleve_id", rbId);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

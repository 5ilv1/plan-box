import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/gestion-plan-travail?types=ressource,media,libre
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const typesParam = searchParams.get("types");
  const types = typesParam ? typesParam.split(",") : ["ressource", "media", "libre"];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plan_travail")
    .select("id, type, titre, statut, date_assignation, date_limite, periodicite, eleve_id, repetibox_eleve_id")
    .in("type", types)
    .order("date_assignation", { ascending: false })
    .order("created_at");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ lignes: data ?? [] });
}

// PATCH /api/gestion-plan-travail
// { ids: string[], date_assignation?: string, date_limite?: string | null }
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { ids, date_assignation, date_limite, periodicite } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ erreur: "ids requis" }, { status: 400 });
  }

  const champs: Record<string, unknown> = {};
  if (date_assignation !== undefined) champs.date_assignation = date_assignation;
  if (date_limite !== undefined) champs.date_limite = date_limite;
  if (periodicite !== undefined) champs.periodicite = periodicite;

  if (Object.keys(champs).length === 0) {
    return NextResponse.json({ erreur: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("plan_travail").update(champs).in("id", ids);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

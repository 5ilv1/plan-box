import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/bibliotheque-ressources?enseignant_id=<uuid>
export async function GET(req: NextRequest) {
  const enseignantId = new URL(req.url).searchParams.get("enseignant_id");
  if (!enseignantId) return NextResponse.json({ erreur: "enseignant_id requis" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("banque_ressources")
    .select("id, titre, sous_type, contenu, matiere, tags, created_at")
    .eq("enseignant_id", enseignantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ressources: data ?? [] });
}

// POST /api/bibliotheque-ressources
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { enseignant_id, titre, sous_type, contenu, matiere } = body;
  if (!enseignant_id || !titre || !sous_type || !contenu) {
    return NextResponse.json({ erreur: "Champs manquants" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("banque_ressources")
    .insert({ enseignant_id, titre, sous_type, contenu, matiere: matiere ?? null })
    .select("id")
    .single();

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

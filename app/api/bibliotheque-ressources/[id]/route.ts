import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/bibliotheque-ressources/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("banque_ressources")
    .select("id, titre, sous_type, contenu, matiere, tags, created_at")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ erreur: "Introuvable" }, { status: 404 });
  return NextResponse.json({ ressource: data });
}

// PATCH /api/bibliotheque-ressources/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { titre, sous_type, matiere, contenu } = body;
  const admin = createAdminClient();
  const { error } = await admin
    .from("banque_ressources")
    .update({ titre, sous_type, matiere: matiere ?? null, contenu })
    .eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/bibliotheque-ressources/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("banque_ressources")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

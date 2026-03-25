import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("matieres")
    .select("id, nom, icone, ordre")
    .order("ordre", { ascending: true });
  if (error) return NextResponse.json({ matieres: [] });
  return NextResponse.json({ matieres: data ?? [] });
}

export async function POST(req: Request) {
  const { nom, icone } = await req.json();
  if (!nom?.trim()) return NextResponse.json({ erreur: "Nom requis" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("matieres")
    .select("ordre")
    .order("ordre", { ascending: false })
    .limit(1);
  const ordre = (existing?.[0]?.ordre ?? 0) + 1;

  const { data, error } = await supabase
    .from("matieres")
    .insert({ nom: nom.trim(), icone: icone ?? "📋", ordre })
    .select()
    .single();
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
  return NextResponse.json({ matiere: data });
}

export async function PATCH(req: Request) {
  const { id, nom, icone, ordre } = await req.json();
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const supabase = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (nom !== undefined) updates.nom = nom.trim();
  if (icone !== undefined) updates.icone = icone;
  if (ordre !== undefined) updates.ordre = ordre;

  const { data, error } = await supabase
    .from("matieres")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
  return NextResponse.json({ matiere: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const supabase = createAdminClient();
  await supabase.from("matieres").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}

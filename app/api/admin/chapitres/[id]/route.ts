import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/admin/chapitres/[id]
// Retourne un chapitre avec son niveau
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("chapitres")
    .select("*, niveaux(*)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ erreur: error.message }, { status: 404 });

  return NextResponse.json({ chapitre: data });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";
import { sanitizeOptions } from "@/lib/bigheads";

/**
 * PUT /api/eleve/avatar — l'élève connecté enregistre son avatar BigHeads.
 *
 * L'avatar vit dans `eleve.avatar_bigheads`, table Repetibox : la base est
 * partagée, et le même avatar suit l'élève dans les deux applications.
 * Repetibox expose la même route de son côté.
 */
export async function PUT(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const options = sanitizeOptions(body?.options);
  if (!options) {
    return NextResponse.json({ error: "Avatar invalide" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // L'élève est identifié par son auth_id, jamais par un id fourni côté client.
  const { data: eleve, error: findError } = await supabase
    .from("eleve")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (findError || !eleve) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("eleve")
    .update({ avatar_bigheads: options })
    .eq("id", eleve.id);

  if (updateError) {
    console.error("[eleve/avatar]", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, avatar_bigheads: options });
}

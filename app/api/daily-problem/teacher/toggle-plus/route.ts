import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  // Vérifier que c'est un enseignant
  const { data: classes } = await admin
    .from("classe")
    .select("id")
    .eq("user_id", user.id);
  if (!classes || classes.length === 0) {
    return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
  }

  const { eleve_id, niveau_plus } = await req.json();
  if (!eleve_id || typeof niveau_plus !== "boolean") {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // Vérifier que l'élève appartient à une classe de l'enseignant
  const classeIds = classes.map((c: any) => c.id);
  const { data: eleve } = await admin
    .from("eleve")
    .select("id, classe_id")
    .eq("id", eleve_id)
    .in("classe_id", classeIds)
    .maybeSingle();

  if (!eleve) {
    return NextResponse.json({ error: "Élève non trouvé" }, { status: 404 });
  }

  const { error } = await admin
    .from("eleve")
    .update({ niveau_plus })
    .eq("id", eleve_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eleve_id, niveau_plus });
}

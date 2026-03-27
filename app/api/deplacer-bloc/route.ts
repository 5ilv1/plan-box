import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const { type, titre, ancienneDate, nouvelleDate } = await req.json();

  if (!type || !titre || !ancienneDate || !nouvelleDate) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // Mettre à jour tous les blocs correspondants (un par élève)
  const { data, error } = await admin
    .from("plan_travail")
    .update({ date_assignation: nouvelleDate })
    .eq("type", type)
    .eq("titre", titre)
    .eq("date_assignation", ancienneDate)
    .eq("statut", "a_faire") // Ne déplacer que les blocs non commencés
    .select("id");

  if (error) {
    console.error("[deplacer-bloc]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    updated: data?.length ?? 0,
  });
}

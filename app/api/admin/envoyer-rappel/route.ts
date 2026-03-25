import { createAdminClient } from "@/lib/supabase-admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { eleveId, chapitreId, message } = body;

  if (!eleveId || !chapitreId || !message) {
    return NextResponse.json(
      { erreur: "eleveId, chapitreId et message sont requis" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("notifications").insert({
    type: "chapitre_valide",
    eleve_id: eleveId,
    chapitre_id: chapitreId,
    message,
    lu: false,
  });

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

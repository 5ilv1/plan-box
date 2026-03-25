import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// DELETE /api/admin/supprimer-blocs
// Body : { ids: string[] }
// Supprime tous les plan_travail dont l'id est dans la liste
export async function DELETE(req: Request) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ erreur: "ids requis" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("plan_travail")
      .delete()
      .in("id", ids);

    if (error) {
      return NextResponse.json({ erreur: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, supprimés: ids.length });
  } catch (err) {
    console.error("[supprimer-blocs]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

// POST /api/admin/parametres/jours-sans-ecole
// Body: { label, date_debut, date_fin }
export async function POST(req: NextRequest) {
  // Réservé à l'enseignant : cette méthode modifie ou supprime du contenu.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  const body = await req.json().catch(() => null);
  const { label, date_debut, date_fin } = body ?? {};

  if (!label || !date_debut || !date_fin) {
    return NextResponse.json({ erreur: "label, date_debut et date_fin requis" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_debut) || !/^\d{4}-\d{2}-\d{2}$/.test(date_fin)) {
    return NextResponse.json({ erreur: "Format date invalide (YYYY-MM-DD)" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("jours_sans_ecole")
    .insert({ label, date_debut, date_fin })
    .select()
    .single();

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ jour: data });
}

// DELETE /api/admin/parametres/jours-sans-ecole?id=<uuid>
export async function DELETE(req: NextRequest) {
  // Réservé à l'enseignant : cette méthode modifie ou supprime du contenu.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  const { error } = await admin.from("jours_sans_ecole").delete().eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

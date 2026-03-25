import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/admin/groupes
// Retourne tous les groupes avec leurs membres (PB + RB)
export async function GET() {
  const admin = createAdminClient();

  const [
    { data: groupes },
    { data: liaisons },
    { data: pbEleves },
    { data: rbEleves },
  ] = await Promise.all([
    admin.from("groupes").select("id, nom, created_at").order("nom"),
    admin.from("eleve_groupe").select("groupe_id, planbox_eleve_id, repetibox_eleve_id"),
    admin.from("eleves").select("id, prenom, nom, niveaux(nom)"),
    admin.from("eleve").select("id, prenom, nom, identifiant"),
  ]);

  const pbMap = new Map((pbEleves ?? []).map((e: any) => [e.id, e]));
  const rbMap = new Map((rbEleves ?? []).map((e: any) => [e.id, e]));

  const groupesAvecMembres = (groupes ?? []).map((g: any) => {
    const membres = (liaisons ?? [])
      .filter((l: any) => l.groupe_id === g.id)
      .map((l: any) => {
        if (l.planbox_eleve_id) {
          const e = pbMap.get(l.planbox_eleve_id);
          return e
            ? { uid: `pb_${e.id}`, prenom: e.prenom, nom: e.nom, source: "planbox", info: e.niveaux?.nom ?? "" }
            : null;
        } else {
          const e = rbMap.get(l.repetibox_eleve_id);
          return e
            ? { uid: `rb_${e.id}`, prenom: e.prenom, nom: e.nom, source: "repetibox", info: e.identifiant ?? "" }
            : null;
        }
      })
      .filter(Boolean);

    return { ...g, membres };
  });

  return NextResponse.json({ groupes: groupesAvecMembres });
}

// POST /api/admin/groupes
// Crée un groupe et optionnellement y ajoute des élèves
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { nom, eleveUids } = body ?? {};

  if (!nom?.trim()) {
    return NextResponse.json({ erreur: "Le nom est requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: groupe, error } = await admin
    .from("groupes")
    .insert({ nom: nom.trim() })
    .select()
    .single();

  if (error || !groupe) {
    return NextResponse.json({ erreur: error?.message ?? "Erreur création" }, { status: 500 });
  }

  // Ajouter les membres si fournis
  if (Array.isArray(eleveUids) && eleveUids.length > 0) {
    const lignes = eleveUids.map((uid: string) => {
      if (uid.startsWith("pb_")) {
        return { groupe_id: groupe.id, planbox_eleve_id: uid.replace("pb_", ""), repetibox_eleve_id: null };
      } else {
        return { groupe_id: groupe.id, planbox_eleve_id: null, repetibox_eleve_id: parseInt(uid.replace("rb_", ""), 10) };
      }
    });
    await admin.from("eleve_groupe").insert(lignes);
  }

  return NextResponse.json({ groupe }, { status: 201 });
}

// PATCH /api/admin/groupes
// Renomme un groupe
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { id, nom } = body ?? {};

  if (!id || !nom?.trim()) {
    return NextResponse.json({ erreur: "id et nom requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("groupes")
    .update({ nom: nom.trim() })
    .eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/groupes?id=<uuid>
// Supprime un groupe et ses liaisons élèves
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");

  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  // Supprimer liaisons puis groupe (eleve_groupe a ON DELETE CASCADE mais on est sûrs)
  await admin.from("eleve_groupe").delete().eq("groupe_id", id);
  const { error } = await admin.from("groupes").delete().eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

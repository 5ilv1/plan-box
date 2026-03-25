import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/admin/chapitres
// Retourne tous les chapitres avec leur niveau, triés par matière > niveau > ordre
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("chapitres")
    .select("*, niveaux(*)")
    .order("matiere")
    .order("ordre", { nullsFirst: false });

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ chapitres: data ?? [] });
}

// POST /api/admin/chapitres
// Crée un nouveau chapitre
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { titre, matiere, sous_matiere, niveau_id, description, nb_cartes_eval, seuil_reussite } = body ?? {};

  if (!titre?.trim() || !matiere || !niveau_id) {
    return NextResponse.json(
      { erreur: "Champs requis : titre, matiere, niveau_id" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Calculer le prochain numéro d'ordre dans ce groupe matière+niveau
  const { data: derniers } = await admin
    .from("chapitres")
    .select("ordre")
    .eq("niveau_id", niveau_id)
    .eq("matiere", matiere)
    .order("ordre", { ascending: false })
    .limit(1);

  const prochainOrdre = ((derniers?.[0]?.ordre) ?? 0) + 1;

  const { data, error } = await admin
    .from("chapitres")
    .insert({
      titre: titre.trim(),
      matiere,
      sous_matiere: sous_matiere?.trim() || null,
      niveau_id,
      description: description?.trim() ?? null,
      nb_cartes_eval: nb_cartes_eval ?? 20,
      seuil_reussite: seuil_reussite ?? 90,
      ordre: prochainOrdre,
    })
    .select("*, niveaux(*)")
    .single();

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ chapitre: data }, { status: 201 });
}

// PATCH /api/admin/chapitres
// Met à jour un chapitre (champs ou ordre)
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { id, ...champs } = body ?? {};

  if (!id) {
    return NextResponse.json({ erreur: "id requis" }, { status: 400 });
  }

  const champsAutorisés = [
    "titre", "matiere", "sous_matiere", "niveau_id",
    "description", "nb_cartes_eval", "seuil_reussite", "ordre",
  ];

  const champsMaj: Record<string, unknown> = {};
  for (const k of champsAutorisés) {
    if (k in champs) champsMaj[k] = champs[k];
  }

  if (Object.keys(champsMaj).length === 0) {
    return NextResponse.json({ erreur: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("chapitres")
    .update(champsMaj)
    .eq("id", id)
    .select("*, niveaux(*)")
    .single();

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ chapitre: data });
}

// DELETE /api/admin/chapitres?id=<uuid>
// Supprime un chapitre — refusé si des élèves sont en cours dessus
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");

  if (!id) {
    return NextResponse.json({ erreur: "id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérifier élèves en cours sur ce chapitre
  const { count } = await admin
    .from("pb_progression")
    .select("*", { count: "exact", head: true })
    .eq("chapitre_id", id)
    .eq("statut", "en_cours");

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        erreur: `${count} élève(s) sont en cours sur ce chapitre. Changez d'abord leur chapitre.`,
        nb_eleves: count,
      },
      { status: 409 }
    );
  }

  const { error } = await admin.from("chapitres").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

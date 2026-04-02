import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

const TYPES_VALIDES = [
  "exercice",
  "calcul_mental",
  "texte_a_trous",
  "analyse_phrase",
  "qcm",
  "classement",
  "ecriture_contrainte",
] as const;

const CHAMPS_MODIFIABLES = ["titre", "type", "contenu", "nb_questions", "ordre"];

/**
 * GET /api/chapitres/exercices?chapitre_id=UUID
 * Retourne tous les exercices d'un chapitre, triés par ordre.
 */
export async function GET(req: NextRequest) {
  const chapitreId = req.nextUrl.searchParams.get("chapitre_id");
  if (!chapitreId) {
    return NextResponse.json({ error: "chapitre_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("exercice")
    .select("*")
    .eq("chapitre_id", chapitreId)
    .order("ordre", { ascending: true });

  if (error) {
    console.error("[exercices GET]", error);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }

  return NextResponse.json({ exercices: data ?? [] });
}

/**
 * POST /api/chapitres/exercices
 * Crée un nouvel exercice. Body: { chapitre_id, titre, type, contenu, nb_questions }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { chapitre_id, titre, type, contenu, nb_questions } = body;

  if (!chapitre_id || !titre || !type) {
    return NextResponse.json({ error: "chapitre_id, titre et type requis" }, { status: 400 });
  }

  if (!TYPES_VALIDES.includes(type)) {
    return NextResponse.json({ error: `Type invalide. Types acceptés : ${TYPES_VALIDES.join(", ")}` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Calculer l'ordre (max + 1)
  const { data: existants } = await admin
    .from("exercice")
    .select("ordre")
    .eq("chapitre_id", chapitre_id)
    .order("ordre", { ascending: false })
    .limit(1);

  const ordre = existants && existants.length > 0 ? existants[0].ordre + 1 : 1;

  const { data, error } = await admin
    .from("exercice")
    .insert({ chapitre_id, titre, type, contenu, nb_questions, ordre })
    .select()
    .single();

  if (error) {
    console.error("[exercices POST]", error);
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }

  return NextResponse.json({ exercice: data });
}

/**
 * PATCH /api/chapitres/exercices
 * Met à jour un exercice. Body: { id, ...champs }
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...champs } = body;

  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  // Filtrer les champs autorisés
  const updates: Record<string, unknown> = {};
  for (const champ of CHAMPS_MODIFIABLES) {
    if (champ in champs) {
      updates[champ] = champs[champ];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ modifiable fourni" }, { status: 400 });
  }

  if (updates.type && !TYPES_VALIDES.includes(updates.type as any)) {
    return NextResponse.json({ error: `Type invalide. Types acceptés : ${TYPES_VALIDES.join(", ")}` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("exercice")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[exercices PATCH]", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/chapitres/exercices?id=UUID
 * Supprime un exercice.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("exercice").delete().eq("id", id);

  if (error) {
    console.error("[exercices DELETE]", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

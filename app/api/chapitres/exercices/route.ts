import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { servirVariante } from "@/lib/ceintures-competences";

const TYPES_VALIDES = [
  "exercice",
  "calcul_mental",
  "texte_a_trous",
  "analyse_phrase",
  "qcm",
  "classement",
  "ecriture_contrainte",
  "revision",
  "lecture",
] as const;

const CHAMPS_MODIFIABLES = ["titre", "type", "contenu", "nb_questions", "ordre"];

/**
 * GET /api/chapitres/exercices?chapitre_id=UUID
 *  … &eleve_id=UUID   ou  &rb_eleve_id=NUMBER   (optionnel)
 *
 * Retourne tous les exercices d'un chapitre, triés par ordre.
 *
 * Les exercices-ceintures portent leurs deux variantes d'entraînement dans
 * `contenu.variantes`. Sans identifiant d'élève, la variante aplatie dans
 * `contenu` est servie telle quelle — comportement historique, inchangé. Avec
 * un identifiant, la variante de remédiation propre à CET élève est substituée
 * (table `ceinture_variante`) : `exercice.contenu` est partagé par toute la
 * classe, on ne peut donc pas y basculer un élève sans basculer les autres.
 * Dans les deux cas `contenu.variantes` est retiré avant l'envoi.
 */
export async function GET(req: NextRequest) {
  const chapitreId = req.nextUrl.searchParams.get("chapitre_id");
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbEleveId = req.nextUrl.searchParams.get("rb_eleve_id");

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

  let exercices = data ?? [];

  // Aucun exercice à variantes → rien à faire (cas de tous les chapitres
  // ordinaires : une seule requête, comme avant).
  const aDesVariantes = exercices.some((e) =>
    Array.isArray((e.contenu as Record<string, unknown>)?.variantes),
  );

  if (aDesVariantes) {
    const varianteParExo = new Map<string, number>();

    if (eleveId || rbEleveId) {
      let q = admin
        .from("ceinture_variante")
        .select("exercice_id, variante")
        .in("exercice_id", exercices.map((e) => e.id));
      q = eleveId ? q.eq("eleve_id", eleveId) : q.eq("rb_eleve_id", Number(rbEleveId));

      const { data: variantes } = await q;
      for (const v of variantes ?? []) varianteParExo.set(v.exercice_id, v.variante);
    }

    exercices = exercices.map((e) => {
      const contenu = e.contenu as Record<string, unknown>;
      if (!Array.isArray(contenu?.variantes)) return e;
      const n = varianteParExo.get(e.id) ?? (contenu.variante as number) ?? 1;
      return { ...e, contenu: servirVariante(contenu, n) };
    });
  }

  return NextResponse.json({ exercices });
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

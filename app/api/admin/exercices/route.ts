import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/admin/exercices
// Insère un exercice dans la banque (server-side, bypass RLS)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { type, matiere, niveau_id, chapitre_id, titre, contenu, nb_utilisations } = body;

  if (!type || !contenu) {
    return NextResponse.json({ erreur: "type et contenu requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.from("banque_exercices").insert({
    type,
    matiere:        matiere ?? null,
    niveau_id:      niveau_id ?? null,
    chapitre_id:    chapitre_id ?? null,
    titre:          titre ?? null,
    contenu,
    nb_utilisations: nb_utilisations ?? 1,
  }).select("id").single();

  if (error) {
    console.error("[banque_exercices] INSERT erreur :", error.message, error.details);
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  console.log("[banque_exercices] INSERT OK — id:", data?.id);
  return NextResponse.json({ ok: true, id: data?.id });
}

// GET /api/admin/exercices?type=exercice&matiere=maths&niveau_id=xxx
// Retourne la banque d'exercices avec filtres optionnels
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const type = params.get("type");
  const matiere = params.get("matiere");
  const niveauId = params.get("niveau_id");
  const chapitreId = params.get("chapitre_id");

  const admin = createAdminClient();

  let query = admin
    .from("banque_exercices")
    .select("*, niveaux(nom), chapitres(titre)")
    .order("created_at", { ascending: false });

  if (type) query = query.eq("type", type);
  if (matiere) query = query.eq("matiere", matiere);
  if (niveauId) query = query.eq("niveau_id", niveauId);
  if (chapitreId) query = query.eq("chapitre_id", chapitreId);

  const { data, error } = await query;

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ exercices: data ?? [] });
}

// PATCH /api/admin/exercices
// Met à jour un exercice (titre, matiere, chapitre_id, niveau_id, contenu)
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { id, titre, contenu, matiere, sous_matiere, chapitre_id, niveau_id } = body ?? {};

  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  const champsMaj: Record<string, unknown> = {};
  if (titre !== undefined) champsMaj.titre = titre;
  if (contenu !== undefined) champsMaj.contenu = contenu;
  if (matiere !== undefined) champsMaj.matiere = matiere;
  if (sous_matiere !== undefined) champsMaj.sous_matiere = sous_matiere;
  if (chapitre_id !== undefined) champsMaj.chapitre_id = chapitre_id;
  if (niveau_id !== undefined) champsMaj.niveau_id = niveau_id;

  const { error } = await admin.from("banque_exercices").update(champsMaj).eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/exercices?id=<uuid>
// Supprime l'exercice de la banque ET tous les plan_travail non-fait associés (par titre + type)
export async function DELETE(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");

  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  // 1. Récupérer l'exercice pour connaître son titre et son type
  const { data: ex } = await admin
    .from("banque_exercices")
    .select("titre, type")
    .eq("id", id)
    .single();

  // 2. Supprimer les plan_travail non-fait correspondants (titre + type)
  if (ex?.titre) {
    const { error: ePT } = await admin
      .from("plan_travail")
      .delete()
      .eq("titre", ex.titre)
      .eq("type", ex.type)
      .neq("statut", "fait");
    if (ePT) console.error("[banque_exercices DELETE] plan_travail:", ePT.message);
  }

  // 3. Supprimer l'exercice de la banque
  const { error } = await admin.from("banque_exercices").delete().eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

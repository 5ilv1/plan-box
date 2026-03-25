import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/mon-plan-travail?rb=<repetibox_eleve_id>
// GET /api/mon-plan-travail?rb=<repetibox_eleve_id>&bloc=<blocId>   → un seul bloc
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rb = searchParams.get("rb");
  const blocId = searchParams.get("bloc"); // optionnel — pour la page activité

  if (!rb) {
    return NextResponse.json({ erreur: "Paramètre rb requis" }, { status: 400 });
  }

  const rbId = parseInt(rb, 10);
  if (isNaN(rbId)) {
    return NextResponse.json({ erreur: "ID élève invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Cas 1 : récupérer un bloc précis (page activité)
  if (blocId) {
    const { data, error } = await admin
      .from("plan_travail")
      .select("*, chapitres(titre, matiere)")
      .eq("id", blocId)
      .eq("repetibox_eleve_id", rbId) // vérification de propriété
      .single();

    if (error || !data) {
      return NextResponse.json({ erreur: "Bloc introuvable ou accès refusé" }, { status: 404 });
    }

    return NextResponse.json({ bloc: data });
  }

  // Cas 2 : tous les blocs de l'élève (dashboard)
  const { data, error } = await admin
    .from("plan_travail")
    .select("*, chapitres(*)")
    .eq("repetibox_eleve_id", rbId)
    .order("date_assignation", { ascending: false });

  if (error) {
    console.error("[GET /api/mon-plan-travail]", error);
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ blocs: data ?? [] });
}

// PATCH /api/mon-plan-travail
// Met à jour le statut (et optionnellement le contenu) d'un bloc
// Vérifie que le bloc appartient bien à l'élève RB
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { blocId, statut, eleveRbId, contenu } = body ?? {};

  if (!blocId || !statut || !eleveRbId) {
    return NextResponse.json(
      { erreur: "Paramètres manquants (blocId, statut, eleveRbId)" },
      { status: 400 }
    );
  }

  const rbId = parseInt(String(eleveRbId), 10);
  if (isNaN(rbId)) {
    return NextResponse.json({ erreur: "eleveRbId invalide" }, { status: 400 });
  }

  const statutsValides = ["a_faire", "en_cours", "fait"];
  if (!statutsValides.includes(statut)) {
    return NextResponse.json({ erreur: "Statut invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérification de propriété : le bloc doit appartenir à cet élève Repetibox
  const { data: bloc, error: erreurVerif } = await admin
    .from("plan_travail")
    .select("id, repetibox_eleve_id")
    .eq("id", blocId)
    .eq("repetibox_eleve_id", rbId)
    .single();

  if (erreurVerif || !bloc) {
    return NextResponse.json(
      { erreur: "Bloc introuvable ou accès refusé" },
      { status: 403 }
    );
  }

  // Champs à mettre à jour — contenu est optionnel (pour sauvegarder le score)
  const champsMaj: Record<string, unknown> = { statut };
  if (contenu !== undefined) {
    champsMaj.contenu = contenu;
  }

  const { error } = await admin
    .from("plan_travail")
    .update(champsMaj)
    .eq("id", blocId);

  if (error) {
    console.error("[PATCH /api/mon-plan-travail]", error);
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { normaliserContenuEcriture } from "@/lib/ecriture-normaliser";

/**
 * GET /api/enseignant/ecriture/bloc?blocId=...
 *
 * Charge les informations détaillées d'un bloc atelier d'écriture (mode semaine)
 * pour l'interface d'annotation côté enseignant.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const blocId = req.nextUrl.searchParams.get("blocId");
  if (!blocId) {
    return NextResponse.json({ erreur: "blocId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("id, titre, contenu, statut, date_assignation, eleve_id, repetibox_eleve_id")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);

  // Infos élève
  let eleve: { id: string; source: "planbox" | "repetibox"; prenom: string; nom: string; classe: string } | null = null;

  if (bloc.repetibox_eleve_id) {
    const { data: e } = await admin
      .from("eleve")
      .select("id, prenom, nom, classe_id")
      .eq("id", bloc.repetibox_eleve_id)
      .single();
    if (e) {
      let classe = "";
      if (e.classe_id) {
        const { data: c } = await admin.from("classe").select("nom").eq("id", e.classe_id).single();
        classe = (c?.nom as string) ?? "";
      }
      eleve = {
        id: String(e.id),
        source: "repetibox",
        prenom: e.prenom as string,
        nom: (e.nom as string) ?? "",
        classe,
      };
    }
  } else if (bloc.eleve_id) {
    const { data: e } = await admin
      .from("eleves")
      .select("id, prenom, nom, niveaux(nom)")
      .eq("id", bloc.eleve_id)
      .single();
    if (e) {
      eleve = {
        id: e.id as string,
        source: "planbox",
        prenom: e.prenom as string,
        nom: ((e as unknown as { nom?: string }).nom) ?? "",
        classe: ((e as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? "",
      };
    }
  }

  return NextResponse.json({
    bloc: {
      id: bloc.id,
      titre: bloc.titre,
      statut: bloc.statut,
      date_assignation: bloc.date_assignation,
    },
    contenu,
    eleve,
  });
}

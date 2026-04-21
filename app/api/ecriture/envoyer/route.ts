import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  normaliserContenuEcriture,
  majHistorique,
  dateStr,
  estVendredi,
} from "@/lib/ecriture-normaliser";

/**
 * POST /api/ecriture/envoyer
 *
 * Finalise le texte de l'atelier d'écriture : pose `texte_final` + `date_envoi`
 * et passe le bloc au statut "fait". N'est autorisé que le vendredi.
 *
 * Body : {
 *   blocId: string,
 *   texte: string,
 *   eleveRbId?: number
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { blocId, texte, eleveRbId } = body as {
    blocId?: string;
    texte?: string;
    eleveRbId?: number;
  };

  if (!blocId || !texte?.trim()) {
    return NextResponse.json({ erreur: "blocId et texte requis" }, { status: 400 });
  }

  if (!estVendredi()) {
    return NextResponse.json(
      { erreur: "L'envoi n'est ouvert que le vendredi" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("id, contenu, repetibox_eleve_id, eleve_id")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  if (eleveRbId && bloc.repetibox_eleve_id !== eleveRbId) {
    return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  }

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);

  if (contenu.date_envoi && contenu.texte_final.trim().length > 0) {
    return NextResponse.json({ erreur: "Texte déjà envoyé" }, { status: 409 });
  }

  const aujourdhui = dateStr();
  contenu.texte_courant = texte;
  contenu.texte_final = texte;
  contenu.date_envoi = aujourdhui;
  contenu.historique = majHistorique(contenu.historique, texte, aujourdhui);

  await admin
    .from("plan_travail")
    .update({ contenu, statut: "fait" })
    .eq("id", blocId);

  return NextResponse.json({ ok: true });
}

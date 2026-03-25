import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/ecriture/sauvegarder
 *
 * Sauvegarde le texte de l'élève pour un jour donné de l'atelier d'écriture.
 *
 * Body : {
 *   blocId: string,
 *   jour: 1 | 2 | 3 | 4,
 *   texte: string,
 *   erreurs?: any[],
 *   eleveRbId?: number  // pour élèves Repetibox
 * }
 */
export async function POST(req: NextRequest) {
  const { blocId, jour, texte, erreurs, eleveRbId } = await req.json();

  if (!blocId || !jour) {
    return NextResponse.json({ erreur: "blocId et jour requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Récupérer le bloc actuel
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("id, contenu, repetibox_eleve_id, eleve_id")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  // Vérifier la propriété (sécurité)
  if (eleveRbId && bloc.repetibox_eleve_id !== eleveRbId) {
    return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  }

  const contenu = (bloc.contenu ?? {}) as Record<string, unknown>;

  // Mettre à jour le texte du jour
  const jourKey = jour === 4 ? "texte_final" : `texte_jour${jour}`;
  contenu[jourKey] = texte;

  // Sauvegarder les erreurs si fournies
  if (erreurs !== undefined) {
    contenu[`erreurs_jour${jour}`] = erreurs;
  }

  // Déterminer le statut
  let statut = "en_cours";
  if (jour === 4 && texte.trim().length > 0) {
    statut = "fait"; // Finalisation terminée
  }

  await admin
    .from("plan_travail")
    .update({ contenu, statut })
    .eq("id", blocId);

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  normaliserContenuEcriture,
  majHistorique,
  dateStr,
} from "@/lib/ecriture-normaliser";

/**
 * POST /api/ecriture/envoyer
 *
 * Deux types d'envoi :
 *   - `final: false` (défaut) → premier envoi : l'enseignant peut corriger,
 *     l'élève peut encore modifier son texte en appliquant les annotations.
 *   - `final: true` → version finale : verrouille définitivement le texte
 *     (pose `date_version_finale`). L'élève ne peut plus rien modifier.
 *
 * Body : { blocId, texte, eleveRbId?, final? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { blocId, texte, eleveRbId, final } = body as {
    blocId?: string;
    texte?: string;
    eleveRbId?: number;
    final?: boolean;
  };

  if (!blocId || !texte?.trim()) {
    return NextResponse.json({ erreur: "blocId et texte requis" }, { status: 400 });
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

  if (contenu.date_version_finale) {
    return NextResponse.json({ erreur: "Version finale déjà validée" }, { status: 409 });
  }

  const aujourdhui = dateStr();
  contenu.texte_courant = texte;
  contenu.texte_final = texte;
  if (!contenu.date_envoi) {
    contenu.date_envoi = aujourdhui;
  }
  if (final) {
    contenu.date_version_finale = aujourdhui;
  }
  contenu.historique = majHistorique(contenu.historique, texte, aujourdhui);

  await admin
    .from("plan_travail")
    .update({ contenu, statut: "fait" })
    .eq("id", blocId);

  return NextResponse.json({ ok: true });
}

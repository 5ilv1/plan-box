import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";
import {
  normaliserContenuEcriture,
  majHistorique,
  dateStr,
} from "@/lib/ecriture-normaliser";

/**
 * POST /api/ecriture/sauvegarder
 *
 * Sauvegarde le texte courant de l'élève pour l'atelier d'écriture mode semaine.
 * Met à jour `texte_courant` et ajoute/met à jour l'entrée du jour dans
 * l'historique (snapshot).
 *
 * Body : {
 *   blocId: string,
 *   texte: string,
 *   eleveRbId?: number  // sécurité élèves Repetibox
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  // `eleveRbId` peut encore arriver des anciens clients : il est ignoré.
  const { blocId, texte } = body as {
    blocId?: string;
    texte?: string;
  };

  if (!blocId || texte === undefined) {
    return NextResponse.json({ erreur: "blocId et texte requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("id, contenu, repetibox_eleve_id, eleve_id, statut")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  // Le propriétaire se lit dans le bloc, jamais dans la requête : un
  // `eleveRbId` envoyé par le navigateur se falsifie, et l'omettre suffisait à
  // écrire dans le bloc de n'importe qui.
  const garde = await requireProprietaireOuEnseignant(bloc.eleve_id, bloc.repetibox_eleve_id);
  if (garde.error) return garde.error;

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);
  const dejaEnvoye = !!contenu.date_envoi && contenu.texte_final.trim().length > 0;

  // Version finale verrouillée : plus aucune modification possible
  if (contenu.date_version_finale) {
    return NextResponse.json({ erreur: "Version finale verrouillée" }, { status: 409 });
  }

  contenu.texte_courant = texte;
  // Après envoi, l'élève peut encore appliquer les corrections de l'enseignant —
  // on garde texte_final aligné sur texte_courant.
  if (dejaEnvoye) {
    contenu.texte_final = texte;
  }

  // Snapshot du jour : on remplace (ou crée) l'entrée de la date d'aujourd'hui
  if (texte.trim().length > 0) {
    contenu.historique = majHistorique(contenu.historique, texte, dateStr());
  }

  // Statut : passe en "en_cours" dès qu'on a du texte
  let statut = bloc.statut;
  if (texte.trim().length > 0 && statut === "a_faire") statut = "en_cours";

  const { error: errMaj } = await admin
    .from("plan_travail")
    .update({ contenu, statut })
    .eq("id", blocId);
  if (errMaj) {
    // L'élève doit savoir que son texte n'est pas enregistré : un `ok` ici lui
    // ferait croire le contraire.
    return NextResponse.json({ erreur: "Sauvegarde impossible" }, { status: 500 });
  }

  // Le contenu tel qu'il est désormais en base : la page s'en sert pour clore
  // l'activité, au lieu de réécrire la copie chargée à l'ouverture — qui ne
  // contient pas le texte, et l'effacerait.
  return NextResponse.json({ ok: true, contenu });
}

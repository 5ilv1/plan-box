import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { prochainJourEcole } from "@/lib/calendrier-scolaire";

const MAX_REAFFECTATIONS = 3;

/**
 * POST /api/reaffecter-exercice
 * Body : { blocId, eleveId?, eleveRbId?, score, scoreTotal }
 *
 * Crée un nouveau plan_travail pour le prochain jour d'école si :
 *  - Le score est < 60 % (SEUIL_REAFFECT)
 *  - Le nombre de réaffectations précédentes < 3
 *  - Aucun doublon n'existe déjà pour ce bloc et cet élève ce jour-là
 */
export async function POST(req: NextRequest) {
  let body: {
    blocId?: string;
    eleveId?: string | null;
    eleveRbId?: number | null;
    score?: number;
    scoreTotal?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreur: "Corps JSON invalide" }, { status: 400 });
  }

  const { blocId, eleveId, eleveRbId, score, scoreTotal } = body;

  if (!blocId) {
    return NextResponse.json({ erreur: "blocId requis" }, { status: 400 });
  }
  if (!eleveId && !eleveRbId) {
    return NextResponse.json({ erreur: "eleveId ou eleveRbId requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Récupérer le bloc source
  const { data: blocSource, error: errBloc } = await admin
    .from("plan_travail")
    .select("*")
    .eq("id", blocId)
    .single();

  if (errBloc || !blocSource) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  // 2. Vérifier le compteur de réaffectations dans le contenu
  const contenu = (blocSource.contenu ?? {}) as Record<string, unknown>;
  const nbReaffectations = (contenu.nb_reaffectations as number) ?? 0;

  if (nbReaffectations >= MAX_REAFFECTATIONS) {
    // Créer une notification enseignant
    await creerNotificationDifficulte(admin, blocSource, eleveId ?? null, eleveRbId ?? null);
    return NextResponse.json({ reaffecte: false, raison: "max_atteint" });
  }

  // 3. Incrémenter nb_reaffectations sur le bloc source
  const contenuMaj = { ...contenu, nb_reaffectations: nbReaffectations + 1 };
  await admin.from("plan_travail").update({ contenu: contenuMaj }).eq("id", blocId);

  // 4. Récupérer la zone scolaire + jours d'exception
  //    App mono-enseignant : on prend la première entrée de la table enseignant
  let zone = "A";
  let joursException: { date_debut: string; date_fin: string }[] = [];

  const { data: ensData } = await admin
    .from("enseignant")
    .select("zone_scolaire")
    .limit(1)
    .single();

  if (ensData?.zone_scolaire) zone = ensData.zone_scolaire;

  const { data: joursData } = await admin
    .from("jours_sans_ecole")
    .select("date_debut, date_fin");

  joursException = joursData ?? [];

  // 5. Calculer le prochain jour d'école
  const dateDepart = blocSource.date_assignation ?? new Date().toISOString().split("T")[0];
  const dateProchainJour = await prochainJourEcole(dateDepart, joursException, zone);

  // 6. Vérifier qu'un doublon n'existe pas déjà
  let query = admin
    .from("plan_travail")
    .select("id")
    .eq("date_assignation", dateProchainJour)
    .eq("titre", blocSource.titre)
    .eq("type", blocSource.type);

  if (eleveId) {
    query = query.eq("eleve_id", eleveId);
  } else if (eleveRbId) {
    query = query.eq("repetibox_eleve_id", eleveRbId);
  }

  const { data: doublon } = await query.maybeSingle();
  if (doublon) {
    return NextResponse.json({ reaffecte: false, raison: "doublon", dateProchainJour });
  }

  // 7. Créer le nouveau bloc réaffecté
  const nouveauContenu = {
    ...blocSource.contenu,
    source_bloc_id: blocId,
    reaffectation: true,
    score_precedent: score,
    score_precedent_total: scoreTotal,
  };

  const nouveauBloc: Record<string, unknown> = {
    titre: blocSource.titre,
    type: blocSource.type,
    contenu: nouveauContenu,
    date_assignation: dateProchainJour,
    statut: "a_faire",
    chapitre_id: blocSource.chapitre_id ?? null,
    groupe_label: blocSource.groupe_label ?? null,
  };

  if (eleveId) {
    nouveauBloc.eleve_id = eleveId;
  } else if (eleveRbId) {
    nouveauBloc.repetibox_eleve_id = eleveRbId;
  }

  const { error: errInsert } = await admin.from("plan_travail").insert(nouveauBloc);

  if (errInsert) {
    console.error("[reaffecter-exercice] insert error:", errInsert);
    return NextResponse.json({ erreur: errInsert.message }, { status: 500 });
  }

  return NextResponse.json({ reaffecte: true, dateProchainJour });
}

/** Crée une notification enseignant quand un élève échoue 3 fois */
async function creerNotificationDifficulte(
  admin: ReturnType<typeof createAdminClient>,
  bloc: Record<string, unknown>,
  eleveId: string | null,
  eleveRbId: number | null,
) {
  try {
    // Récupérer le nom de l'élève
    let prenomNom = "Un élève";
    let eleveUuid: string | null = null;

    if (eleveId) {
      eleveUuid = eleveId;
      const { data } = await admin.from("eleves").select("prenom, nom").eq("id", eleveId).single();
      if (data) prenomNom = `${data.prenom} ${data.nom}`;
    } else if (eleveRbId) {
      const { data } = await admin.from("eleve").select("prenom, nom").eq("id", eleveRbId).single();
      if (data) prenomNom = `${data.prenom} ${data.nom}`;
    }

    const message = `⚠️ ${prenomNom} a échoué 3 fois à l'exercice « ${bloc.titre} ». Une attention particulière est recommandée.`;

    // Vérifier si une notif similaire existe déjà (dans les 7 derniers jours)
    const { data: existante } = await admin
      .from("notifications")
      .select("id")
      .ilike("message", `%${bloc.titre}%`)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .maybeSingle();

    if (existante) return;

    await admin.from("notifications").insert({
      type: "difficulte",
      eleve_id: eleveUuid,
      message,
      lu: false,
    });
  } catch {
    // Ne pas faire échouer la requête principale
  }
}

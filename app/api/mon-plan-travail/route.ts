import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { champsTerminaison, champsReprise } from "@/lib/suivi-metriques";

// GET /api/mon-plan-travail?rb=<repetibox_eleve_id>
// GET /api/mon-plan-travail?rb=<repetibox_eleve_id>&bloc=<blocId>   → un seul bloc
// GET /api/mon-plan-travail?rb=<id>&debut=YYYY-MM-DD&fin=YYYY-MM-DD → blocs d'une période
// GET /api/mon-plan-travail?rb=<id>&types=exercice,calcul_mental,eval → blocs par types (progression)
// GET /api/mon-plan-travail?rb=<id>&types=ressource                  → podcasts uniquement
//   options : avecChapitre=1, avecQcm=1, limite=N (1 à 500)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rb = searchParams.get("rb");
  const blocId = searchParams.get("bloc");
  const debut = searchParams.get("debut");
  const fin = searchParams.get("fin");
  const types = searchParams.get("types");

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
      .eq("repetibox_eleve_id", rbId)
      .single();

    if (error || !data) {
      return NextResponse.json({ erreur: "Bloc introuvable ou accès refusé" }, { status: 404 });
    }

    return NextResponse.json({ bloc: data });
  }

  // Cas 2 : blocs filtrés (dashboard optimisé)
  // `leger=1` : identifiant, titre, type, date et qcm_id seulement — la carte
  // podcast du tableau de bord n'en lit pas plus, et un bloc podcast complet
  // pèse ~28 Ko. Même forme qu'un bloc (`contenu.qcm_id`), le reste en moins.
  const leger = searchParams.get("leger") === "1";
  let query = admin
    .from("plan_travail")
    .select(leger ? "id, titre, type, statut, date_assignation, qcm_id:contenu->>qcm_id" : "*, chapitres(id, titre, matiere)")
    .eq("repetibox_eleve_id", rbId);

  if (debut) query = query.gte("date_assignation", debut);
  if (fin) query = query.lte("date_assignation", fin);
  if (types) query = query.in("type", types.split(","));

  // Filtres faits par la base plutôt que par la page, qui jetait presque tout :
  // la liste des podcasts (~200 Ko) pour en garder 4, les exercices (~60 Ko)
  // pour ne garder que ceux qui ont un chapitre — aucun à ce jour.
  if (searchParams.get("avecChapitre") === "1") query = query.not("chapitre_id", "is", null);
  if (searchParams.get("avecQcm") === "1") query = query.not("contenu->>qcm_id", "is", null);
  const limite = Math.min(Math.max(parseInt(searchParams.get("limite") ?? "", 10) || 500, 1), 500);

  const { data, error } = await query
    .order("date_assignation", { ascending: false })
    .limit(limite);

  if (error) {
    console.error("[GET /api/mon-plan-travail]", error);
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let blocs: any[] = leger
    ? ((data ?? []) as unknown as Array<{ qcm_id?: string | null; [k: string]: unknown }>)
        .map(({ qcm_id, ...b }) => ({ ...b, contenu: { qcm_id } }))
    : (data ?? []);

  // Report : quand on interroge la semaine (debut+fin sans types), inclure
  // les ressources (podcasts, docs…) des semaines précédentes encore non terminées.
  if (debut && fin && !types) {
    const { data: report } = await admin
      .from("plan_travail")
      .select("*, chapitres(id, titre, matiere)")
      .eq("repetibox_eleve_id", rbId)
      .eq("type", "ressource")
      .lt("date_assignation", debut)
      .neq("statut", "fait")
      .order("date_assignation", { ascending: false })
      .limit(50);
    if (report && report.length > 0) {
      blocs = [...blocs, ...report];
    }
  }

  return NextResponse.json({ blocs });
}

// PATCH /api/mon-plan-travail
// Met à jour le statut (et optionnellement le contenu) d'un bloc
// Vérifie que le bloc appartient bien à l'élève RB
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { blocId, statut, eleveRbId, contenu, dureeSecondes } = body ?? {};

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

  // Horodatage de fin posé côté serveur : c'est le seul instant de confiance.
  // Un bloc qui repasse à « à faire » doit perdre sa durée, sinon elle serait
  // attribuée au travail suivant.
  Object.assign(
    champsMaj,
    statut === "fait" ? champsTerminaison(dureeSecondes) : champsReprise()
  );

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

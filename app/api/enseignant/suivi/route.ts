import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { CEINTURES } from "@/lib/ceintures";
import {
  calculerDomaines,
  scoreMatiereDepuis,
  SOUS_DOMAINES_FR,
  SOUS_DOMAINES_MATHS,
  type CarteDomaines,
  type CibleEleves,
} from "@/lib/suivi-domaines";

/**
 * GET /api/enseignant/suivi?cible=eleve&id=pb_xxx ou rb_N
 * GET /api/enseignant/suivi?cible=classe&niveau=tous|CE2|CM1|CM2
 *   &periode=jour|semaine|mois|trimestre|all
 *
 * Renvoie une page-portrait : Français/Maths agrégés avec les sous-domaines,
 * + ceinture (élève seul), + lecture, + forces/faiblesses IA.
 */

function getDateDebut(periode: string): string | null {
  const d = new Date();
  if (periode === "jour")      { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  if (periode === "semaine")   { d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (periode === "mois")      { d.setMonth(d.getMonth() - 1); return d.toISOString(); }
  if (periode === "trimestre") { d.setMonth(d.getMonth() - 3); return d.toISOString(); }
  return null;
}

/** Récupère le niveau (CE2/CM1/CM2) d'un élève RB via eleve_groupe → groupes.nom */
async function niveauRb(admin: ReturnType<typeof createAdminClient>, rbId: number): Promise<string | null> {
  const { data } = await admin
    .from("eleve_groupe")
    .select("groupes(nom)")
    .eq("repetibox_eleve_id", rbId);
  for (const r of data ?? []) {
    const nom = ((r as unknown as { groupes?: { nom?: string } }).groupes?.nom) ?? null;
    if (nom === "CE2" || nom === "CM1" || nom === "CM2") return nom;
  }
  return null;
}

async function recupererCible(
  admin: ReturnType<typeof createAdminClient>,
  searchParams: URLSearchParams
): Promise<{
  cible: CibleEleves;
  titre: string;
  sousTitre: string | null;
  niveauUnique: string | null;
  inclureCeinture: boolean;
  inclureLecture: boolean;
  cibleId: string | null;
}> {
  const type = searchParams.get("cible") ?? "eleve";

  if (type === "eleve") {
    const id = searchParams.get("id") ?? "";
    const cible: CibleEleves = { pb_ids: [], rb_ids: [] };
    let titre = "Élève";
    let sousTitre: string | null = null;
    let niveau: string | null = null;
    if (id.startsWith("rb_")) {
      const rb = parseInt(id.slice(3), 10);
      cible.rb_ids = [rb];
      const { data } = await admin.from("eleve").select("prenom, nom").eq("id", rb).maybeSingle();
      if (data) {
        titre = `${data.prenom ?? ""} ${data.nom ?? ""}`.trim();
        niveau = await niveauRb(admin, rb);
        sousTitre = niveau;
      }
    } else {
      const pb = id.startsWith("pb_") ? id.slice(3) : id;
      cible.pb_ids = [pb];
      const { data } = await admin.from("eleves").select("prenom, nom, niveaux(nom)").eq("id", pb).maybeSingle();
      if (data) {
        titre = `${data.prenom ?? ""} ${(data as unknown as { nom?: string }).nom ?? ""}`.trim();
        niveau = ((data as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? null;
        sousTitre = niveau;
      }
    }
    return { cible, titre, sousTitre, niveauUnique: niveau, inclureCeinture: true, inclureLecture: true, cibleId: id };
  }

  // type === "classe"
  const niveauFiltre = searchParams.get("niveau") ?? "tous";
  const cible: CibleEleves = { pb_ids: [], rb_ids: [] };

  // PlanBox via eleves.niveau_id → niveaux.nom
  const { data: pbList } = await admin.from("eleves").select("id, niveaux(nom)");
  for (const e of pbList ?? []) {
    const niv = ((e as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? null;
    if (niveauFiltre === "tous" || niv === niveauFiltre) cible.pb_ids.push(e.id as string);
  }

  // Repetibox via eleve_groupe → groupes.nom
  if (niveauFiltre === "tous") {
    const { data: rbList } = await admin.from("eleve").select("id");
    for (const e of rbList ?? []) cible.rb_ids.push(e.id as number);
  } else {
    // 1. trouver les groupe.id correspondant au niveau
    const { data: groupes } = await admin.from("groupes").select("id").eq("nom", niveauFiltre);
    const groupeIds = (groupes ?? []).map((g) => g.id as number);
    if (groupeIds.length > 0) {
      const { data: liens } = await admin
        .from("eleve_groupe")
        .select("repetibox_eleve_id")
        .in("groupe_id", groupeIds);
      const ids = new Set<number>();
      for (const l of liens ?? []) {
        const id = (l as { repetibox_eleve_id?: number }).repetibox_eleve_id;
        if (typeof id === "number") ids.add(id);
      }
      cible.rb_ids = [...ids];
    }
  }

  return {
    cible,
    titre: niveauFiltre === "tous" ? "Toute la classe" : niveauFiltre,
    sousTitre: niveauFiltre === "tous"
      ? `${cible.pb_ids.length + cible.rb_ids.length} élèves`
      : `Niveau ${niveauFiltre} · ${cible.pb_ids.length + cible.rb_ids.length} élèves`,
    niveauUnique: niveauFiltre === "tous" ? null : niveauFiltre,
    inclureCeinture: false,
    inclureLecture: true,
    cibleId: null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const periode = req.nextUrl.searchParams.get("periode") ?? "all";
  const dateDebut = getDateDebut(periode);
  const admin = createAdminClient();

  const { cible, titre, sousTitre, niveauUnique, inclureCeinture, inclureLecture, cibleId } =
    await recupererCible(admin, req.nextUrl.searchParams);

  // Carte des sous-domaines
  const carte: CarteDomaines = await calculerDomaines(admin, cible, dateDebut);

  const fr = scoreMatiereDepuis(carte, SOUS_DOMAINES_FR);
  const maths = scoreMatiereDepuis(carte, SOUS_DOMAINES_MATHS);

  // Ceinture (1 seul élève)
  let ceinture: { index: number; nom: string; couleur: string } | null = null;
  if (inclureCeinture && cibleId) {
    const filtre = cible.rb_ids.length > 0
      ? { col: "rb_eleve_id", val: cible.rb_ids[0] as number | string }
      : { col: "eleve_id", val: cible.pb_ids[0] };
    const { data: c } = await admin
      .from("ceinture_resultat")
      .select("ceinture_index")
      .eq(filtre.col, filtre.val)
      .eq("reussi", true)
      .order("ceinture_index", { ascending: false })
      .limit(1);
    const idx = c?.[0]?.ceinture_index ?? -1;
    if (idx >= 0) {
      const def = CEINTURES[idx] ?? CEINTURES[0];
      ceinture = { index: def.index, nom: def.nom, couleur: def.couleur };
    } else {
      ceinture = { index: -1, nom: "Aucune encore", couleur: "#9CA3AF" };
    }
  }

  // Lecture : nb blocs lecture faits sur la cible
  let nbLectures = 0;
  if (inclureLecture) {
    let qL = admin
      .from("plan_travail")
      .select("id", { count: "exact", head: true })
      .eq("type", "lecture")
      .eq("statut", "fait");
    if (cible.pb_ids.length > 0 && cible.rb_ids.length > 0) {
      qL = qL.or(`eleve_id.in.(${cible.pb_ids.join(",")}),repetibox_eleve_id.in.(${cible.rb_ids.join(",")})`);
    } else if (cible.pb_ids.length > 0) {
      qL = qL.in("eleve_id", cible.pb_ids);
    } else if (cible.rb_ids.length > 0) {
      qL = qL.in("repetibox_eleve_id", cible.rb_ids);
    }
    if (dateDebut) qL = qL.gte("date_assignation", dateDebut.split("T")[0]);
    const { count } = await qL;
    nbLectures = count ?? 0;
  }

  return NextResponse.json({
    titre,
    sousTitre,
    nbEleves: cible.pb_ids.length + cible.rb_ids.length,
    domaines: carte,
    matieres: {
      francais: { score: fr.score, nb_essais: fr.nb_essais },
      maths: { score: maths.score, nb_essais: maths.nb_essais },
    },
    ceinture,
    lecture: { nb_blocs_faits: nbLectures },
    niveau: niveauUnique,
    cibleType: inclureCeinture ? "eleve" : "classe",
  });
}

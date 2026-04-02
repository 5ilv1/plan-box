import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { CEINTURES } from "@/lib/ceintures";

/**
 * GET /api/ceinture-stats?enseignant_id=UUID
 * Retourne les stats ceintures de tous les élèves des groupes activés
 */
export async function GET(req: NextRequest) {
  const enseignantId = req.nextUrl.searchParams.get("enseignant_id");
  if (!enseignantId) {
    return NextResponse.json({ error: "enseignant_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Groupes de l'enseignant
  const { data: groupes } = await admin
    .from("groupes")
    .select("id, nom")
    .order("nom");

  if (!groupes?.length) {
    return NextResponse.json({ groupes: [], eleves: [] });
  }

  // 2. Groupes avec ceintures activées
  const { data: configs } = await admin
    .from("ceinture_config")
    .select("groupe_id")
    .eq("actif", true)
    .in("groupe_id", groupes.map((g) => g.id));

  const groupesActifs = new Set((configs ?? []).map((c) => c.groupe_id));
  if (groupesActifs.size === 0) {
    return NextResponse.json({ groupes: [], eleves: [] });
  }

  const groupesFiltres = groupes.filter((g) => groupesActifs.has(g.id));

  // 3. Membres de ces groupes
  const { data: membres } = await admin
    .from("eleve_groupe")
    .select("groupe_id, planbox_eleve_id, repetibox_eleve_id")
    .in("groupe_id", groupesFiltres.map((g) => g.id));

  if (!membres?.length) {
    return NextResponse.json({ groupes: groupesFiltres, eleves: [] });
  }

  // Collecter les IDs élèves
  const pbIds = new Set<string>();
  const rbIds = new Set<number>();
  for (const m of membres) {
    if (m.planbox_eleve_id) pbIds.add(m.planbox_eleve_id);
    if (m.repetibox_eleve_id) rbIds.add(m.repetibox_eleve_id);
  }

  // 4. Infos élèves
  type EleveInfo = { uid: string; prenom: string; nom: string; groupeId: string };
  const eleves: EleveInfo[] = [];

  if (pbIds.size > 0) {
    const { data: pbEleves } = await admin
      .from("eleves")
      .select("id, prenom, nom")
      .in("id", [...pbIds]);
    const pbMap = new Map((pbEleves ?? []).map((e) => [e.id, e]));
    for (const m of membres) {
      if (m.planbox_eleve_id && pbMap.has(m.planbox_eleve_id)) {
        const e = pbMap.get(m.planbox_eleve_id)!;
        eleves.push({ uid: `pb_${e.id}`, prenom: e.prenom, nom: e.nom, groupeId: m.groupe_id });
      }
    }
  }

  if (rbIds.size > 0) {
    const { data: rbEleves } = await admin
      .from("eleve")
      .select("id, prenom, nom")
      .in("id", [...rbIds]);
    const rbMap = new Map((rbEleves ?? []).map((e) => [e.id, e]));
    for (const m of membres) {
      if (m.repetibox_eleve_id && rbMap.has(m.repetibox_eleve_id)) {
        const e = rbMap.get(m.repetibox_eleve_id)!;
        eleves.push({ uid: `rb_${e.id}`, prenom: e.prenom, nom: e.nom, groupeId: m.groupe_id });
      }
    }
  }

  // 5. Résultats ceintures pour tous ces élèves
  // On fait deux requêtes : une pour PB, une pour RB
  type Resultat = { eleve_id?: string; repetibox_eleve_id?: number; ceinture_index: number; mode: string; reussi: boolean; nb_correct: number; nb_total: number; temps_ms: number; created_at: string };
  const resultats: Resultat[] = [];

  if (pbIds.size > 0) {
    const { data } = await admin
      .from("ceinture_resultat")
      .select("eleve_id, ceinture_index, mode, reussi, nb_correct, nb_total, temps_ms, created_at")
      .in("eleve_id", [...pbIds]);
    if (data) resultats.push(...(data as Resultat[]));
  }

  if (rbIds.size > 0) {
    const { data } = await admin
      .from("ceinture_resultat")
      .select("repetibox_eleve_id, ceinture_index, mode, reussi, nb_correct, nb_total, temps_ms, created_at")
      .in("repetibox_eleve_id", [...rbIds]);
    if (data) resultats.push(...(data as Resultat[]));
  }

  // 6. Agréger par élève
  const eleveStats = eleves.map((el) => {
    const isPb = el.uid.startsWith("pb_");
    const id = isPb ? el.uid.slice(3) : parseInt(el.uid.slice(3), 10);
    const mesResultats = resultats.filter((r) =>
      isPb ? r.eleve_id === id : r.repetibox_eleve_id === id
    );

    // Ceintures obtenues
    const evalReussies = mesResultats.filter((r) => r.mode === "evaluation" && r.reussi);
    const maxReussi = evalReussies.length > 0
      ? Math.max(...evalReussies.map((r) => r.ceinture_index))
      : -1;
    const ceintureIndex = Math.min(maxReussi + 1, CEINTURES.length - 1);
    const nbObtenues = new Set(evalReussies.map((r) => r.ceinture_index)).size;

    // Entraînements
    const entrainements = mesResultats.filter((r) => r.mode === "entrainement");
    const nbEntrainements = entrainements.length;

    // Dernier résultat (tout mode)
    const dernierResultat = mesResultats.length > 0
      ? mesResultats.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      : null;

    return {
      uid: el.uid,
      prenom: el.prenom,
      nom: el.nom,
      groupeId: el.groupeId,
      ceintureIndex,
      ceintureCouleur: CEINTURES[ceintureIndex].couleur,
      ceintureNom: CEINTURES[ceintureIndex].nom,
      nbObtenues,
      nbEntrainements,
      dernierResultat: dernierResultat
        ? { date: dernierResultat.created_at, score: `${dernierResultat.nb_correct}/${dernierResultat.nb_total}` }
        : null,
    };
  });

  // 7. Répartition globale
  const repartition = CEINTURES.map((c) => ({
    index: c.index,
    nom: c.nom,
    couleur: c.couleur,
    count: eleveStats.filter((e) => e.ceintureIndex === c.index).length,
  }));

  return NextResponse.json({
    groupes: groupesFiltres,
    eleves: eleveStats,
    repartition,
    nbTotal: CEINTURES.length,
  });
}

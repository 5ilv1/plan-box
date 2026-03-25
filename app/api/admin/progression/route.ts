import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/admin/progression
//
// Mode 1 (sans params) : tableau de progression tous élèves × chapitres
//   Source de vérité : plan_travail (couvre PB + RB)
//   Enrichit avec pb_progression.statut (valide/remediation) pour les élèves PB
//
// Mode 2 (?eleveId=X&chapitreId=Y) : détail d'un élève pour un chapitre
//   eleveId = "pb_UUID" ou "rb_N"
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const eleveId    = params.get("eleveId");
  const chapitreId = params.get("chapitreId");

  const admin = createAdminClient();

  // ── Mode 2 : détail (eleve, chapitre) ───────────────────────────────────
  if (eleveId && chapitreId) {
    const isPb = eleveId.startsWith("pb_");
    const isRb = eleveId.startsWith("rb_");

    let blocsQ = admin
      .from("plan_travail")
      .select("id, titre, type, statut, contenu, date_assignation, date_limite")
      .eq("chapitre_id", chapitreId)
      .neq("type", "repetibox")
      .order("created_at");

    if (isPb) {
      blocsQ = blocsQ.eq("eleve_id", eleveId.replace("pb_", ""));
    } else if (isRb) {
      blocsQ = blocsQ.eq("repetibox_eleve_id", parseInt(eleveId.replace("rb_", ""), 10));
    }

    const [{ data: blocs, error: blocsError }, progressionResult] = await Promise.all([
      blocsQ,
      isPb
        ? admin
            .from("pb_progression")
            .select("pourcentage, statut, updated_at")
            .eq("eleve_id", eleveId.replace("pb_", ""))
            .eq("chapitre_id", chapitreId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (blocsError) {
      return NextResponse.json({ erreur: blocsError.message }, { status: 500 });
    }

    return NextResponse.json({ blocs: blocs ?? [], progression: progressionResult.data });
  }

  // ── Mode 1 : tableau complet ─────────────────────────────────────────────

  // Requêtes en parallèle
  const [
    { data: planTravailData },
    { data: chapitres },
    { data: pbProgressions },
    { data: groupes },
    { data: memberships },
  ] = await Promise.all([
    admin
      .from("plan_travail")
      .select("eleve_id, repetibox_eleve_id, chapitre_id, statut, type")
      .not("chapitre_id", "is", null)
      .neq("type", "repetibox"),
    admin
      .from("chapitres")
      .select("id, titre, matiere, sous_matiere, niveau_id, ordre")
      .order("matiere")
      .order("ordre"),
    admin
      .from("pb_progression")
      .select("eleve_id, chapitre_id, pourcentage, statut, updated_at"),
    admin.from("groupes").select("id, nom").order("nom"),
    admin
      .from("eleve_groupe")
      .select("groupe_id, planbox_eleve_id, repetibox_eleve_id"),
  ]);

  const lignes = planTravailData ?? [];

  // Collecter les IDs uniques par source
  const pbEleveIds = [...new Set(
    lignes.filter((l) => l.eleve_id).map((l) => l.eleve_id as string)
  )];
  const rbEleveIds = [...new Set(
    lignes
      .filter((l) => l.repetibox_eleve_id != null)
      .map((l) => l.repetibox_eleve_id as number)
  )];

  // Charger les noms des élèves en parallèle
  const [{ data: pbEleves }, { data: rbEleves }] = await Promise.all([
    pbEleveIds.length > 0
      ? admin
          .from("eleves")
          .select("id, prenom, nom, niveau_id, niveaux(nom)")
          .in("id", pbEleveIds)
      : Promise.resolve({ data: [] }),
    rbEleveIds.length > 0
      ? admin.from("eleve").select("id, prenom, nom").in("id", rbEleveIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Construire les maps de lookup
  const pbMap = new Map(((pbEleves ?? []) as any[]).map((e) => [e.id, e]));
  const rbMap = new Map(((rbEleves ?? []) as any[]).map((e) => [e.id, e]));

  // Normaliser les memberships (uid unifié)
  const membershipsNorm = ((memberships ?? []) as any[])
    .map((m) => ({
      groupe_id: m.groupe_id as string,
      eleve_uid: m.planbox_eleve_id
        ? `pb_${m.planbox_eleve_id}`
        : m.repetibox_eleve_id != null
        ? `rb_${m.repetibox_eleve_id}`
        : null,
    }))
    .filter((m) => m.eleve_uid !== null) as { groupe_id: string; eleve_uid: string }[];

  // Liste unifiée des élèves (triée par nom)
  const elevesMap = new Map<string, {
    uid: string;
    prenom: string;
    nom: string;
    source: "planbox" | "repetibox";
    niveaux?: { nom: string } | null;
  }>();

  for (const id of pbEleveIds) {
    const e = pbMap.get(id);
    if (e) {
      elevesMap.set(`pb_${id}`, {
        uid: `pb_${id}`,
        prenom: e.prenom,
        nom: e.nom,
        source: "planbox",
        niveaux: e.niveaux ?? null,
      });
    }
  }
  for (const id of rbEleveIds) {
    const e = rbMap.get(id);
    if (e) {
      elevesMap.set(`rb_${id}`, {
        uid: `rb_${id}`,
        prenom: e.prenom,
        nom: e.nom,
        source: "repetibox",
        niveaux: null,
      });
    }
  }

  const eleves = [...elevesMap.values()].sort(
    (a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom)
  );

  // Calculer la progression par (uid, chapitre_id) depuis plan_travail
  const progCalc = new Map<string, { total: number; faits: number }>();

  for (const l of lignes) {
    if (!l.chapitre_id) continue;
    const uid = l.eleve_id
      ? `pb_${l.eleve_id}`
      : `rb_${l.repetibox_eleve_id}`;
    const key = `${uid}__${l.chapitre_id}`;

    if (!progCalc.has(key)) progCalc.set(key, { total: 0, faits: 0 });
    const s = progCalc.get(key)!;
    // Exclure les blocs eval du calcul de pourcentage
    if (l.type !== "eval") {
      s.total++;
      if (l.statut === "fait") s.faits++;
    }
  }

  // Map pb_progression pour surcharger le statut
  const pbProgMap = new Map<string, any>();
  for (const p of ((pbProgressions ?? []) as any[])) {
    pbProgMap.set(`pb_${p.eleve_id}__${p.chapitre_id}`, p);
  }

  // Construire la liste finale des progressions
  const progressions: Array<{
    eleve_uid: string;
    chapitre_id: string;
    pourcentage: number;
    statut: string;
    updated_at: string;
  }> = [];

  for (const [key, calc] of progCalc) {
    if (calc.total === 0) continue;
    const sepIdx = key.indexOf("__");
    const uid    = key.slice(0, sepIdx);
    const chapId = key.slice(sepIdx + 2);

    const pourcentage = Math.round((calc.faits / calc.total) * 100);
    const pbProg = pbProgMap.get(key);

    progressions.push({
      eleve_uid:   uid,
      chapitre_id: chapId,
      pourcentage: pbProg?.statut === "valide" ? 100 : pourcentage,
      statut:      pbProg?.statut ?? "en_cours",
      updated_at:  pbProg?.updated_at ?? new Date().toISOString(),
    });
  }

  // Ne garder que les chapitres qui ont au moins un élève avec des blocs assignés
  const chapitresAvecEleves = new Set(progressions.map((p) => p.chapitre_id));
  const chapitresFiltres = (chapitres ?? []).filter((c: any) => chapitresAvecEleves.has(c.id));

  return NextResponse.json({
    eleves,
    chapitres:    chapitresFiltres,
    progressions,
    groupes:      groupes ?? [],
    memberships:  membershipsNorm,
  });
}

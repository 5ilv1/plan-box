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
    { data: chapAssign },
    { data: exercices },
    { data: exResultats },
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
    admin
      .from("chapitre_assignation")
      .select("chapitre_id, groupe_id")
      .eq("actif", true),
    admin
      .from("exercice")
      .select("id, chapitre_id"),
    admin
      .from("exercice_resultat")
      .select("exercice_id, eleve_id, rb_eleve_id, valide"),
  ]);

  const lignes = planTravailData ?? [];

  // Collecter les IDs uniques par source — depuis plan_travail ET pb_progression ET groupes
  const pbIdsFromPT = new Set(lignes.filter((l) => l.eleve_id).map((l) => l.eleve_id as string));
  const rbIdsFromPT = new Set(lignes.filter((l) => l.repetibox_eleve_id != null).map((l) => l.repetibox_eleve_id as number));

  // Ajouter les élèves depuis pb_progression (peuvent avoir progression sans plan_travail)
  for (const p of ((pbProgressions ?? []) as any[])) {
    if (p.eleve_id) pbIdsFromPT.add(p.eleve_id);
  }

  // Ajouter les élèves depuis les groupes (pour voir les élèves sans travail)
  for (const m of ((memberships ?? []) as any[])) {
    if (m.planbox_eleve_id) pbIdsFromPT.add(m.planbox_eleve_id);
    if (m.repetibox_eleve_id != null) rbIdsFromPT.add(m.repetibox_eleve_id);
  }

  const pbEleveIds = [...pbIdsFromPT];
  const rbEleveIds = [...rbIdsFromPT];

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

  // Ensemble des clés déjà traitées
  const progressionKeys = new Set<string>();

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
    progressionKeys.add(key);
  }

  // Ajouter les progressions pb_progression sans plan_travail correspondant
  for (const [key, pbProg] of pbProgMap) {
    if (progressionKeys.has(key)) continue;
    const sepIdx = key.indexOf("__");
    const uid    = key.slice(0, sepIdx);
    const chapId = key.slice(sepIdx + 2);
    // Vérifier que l'élève est connu
    if (!elevesMap.has(uid)) continue;
    progressions.push({
      eleve_uid:   uid,
      chapitre_id: chapId,
      pourcentage: pbProg.statut === "valide" ? 100 : pbProg.pourcentage ?? 0,
      statut:      pbProg.statut ?? "en_cours",
      updated_at:  pbProg.updated_at ?? new Date().toISOString(),
    });
    progressionKeys.add(key);
  }

  // ── Parcours chapitres : progression depuis exercice_resultat ─────────────
  // Calculer nb exercices par chapitre
  const exosParChapitre = new Map<string, string[]>();
  for (const ex of (exercices ?? []) as { id: string; chapitre_id: string }[]) {
    const list = exosParChapitre.get(ex.chapitre_id) ?? [];
    list.push(ex.id);
    exosParChapitre.set(ex.chapitre_id, list);
  }

  // Set des exercices validés par élève (uid → Set<exercice_id>)
  const exoValides = new Map<string, Set<string>>();
  for (const r of (exResultats ?? []) as { exercice_id: string; eleve_id: string | null; rb_eleve_id: number | null; valide: boolean }[]) {
    if (!r.valide) continue;
    const uid = r.eleve_id ? `pb_${r.eleve_id}` : r.rb_eleve_id != null ? `rb_${r.rb_eleve_id}` : null;
    if (!uid) continue;
    if (!exoValides.has(uid)) exoValides.set(uid, new Set());
    exoValides.get(uid)!.add(r.exercice_id);
  }

  // Map groupeId → Set<chapitreId> depuis chapitre_assignation
  const groupeChapMap = new Map<string, Set<string>>();
  for (const a of (chapAssign ?? []) as { chapitre_id: string; groupe_id: string }[]) {
    if (!groupeChapMap.has(a.groupe_id)) groupeChapMap.set(a.groupe_id, new Set());
    groupeChapMap.get(a.groupe_id)!.add(a.chapitre_id);
  }

  // Map groupeId → Set<eleveUid> depuis memberships
  const groupeElevesMap = new Map<string, Set<string>>();
  for (const m of (memberships ?? []) as { groupe_id: string; planbox_eleve_id: string | null; repetibox_eleve_id: number | null }[]) {
    const uid = m.planbox_eleve_id ? `pb_${m.planbox_eleve_id}` : m.repetibox_eleve_id != null ? `rb_${m.repetibox_eleve_id}` : null;
    if (!uid) continue;
    if (!groupeElevesMap.has(m.groupe_id)) groupeElevesMap.set(m.groupe_id, new Set());
    groupeElevesMap.get(m.groupe_id)!.add(uid);
  }

  // Pour chaque (groupe → chapitres assignés → élèves du groupe), calculer la progression
  for (const [groupeId, chapIds] of groupeChapMap) {
    const eleveUids = groupeElevesMap.get(groupeId);
    if (!eleveUids) continue;

    for (const chapId of chapIds) {
      const exoIds = exosParChapitre.get(chapId);
      if (!exoIds || exoIds.length === 0) continue;

      for (const uid of eleveUids) {
        if (!elevesMap.has(uid)) continue;
        const key = `${uid}__${chapId}`;

        const validesEleve = exoValides.get(uid);
        const nbValides = validesEleve ? exoIds.filter((id) => validesEleve.has(id)).length : 0;
        const pourcentageParcours = Math.round((nbValides / exoIds.length) * 100);

        if (progressionKeys.has(key)) {
          // Fusionner : prendre le max des pourcentages
          const existing = progressions.find((p) => p.eleve_uid === uid && p.chapitre_id === chapId);
          if (existing && pourcentageParcours > existing.pourcentage) {
            existing.pourcentage = pourcentageParcours;
            if (nbValides === exoIds.length) existing.statut = "valide";
            else if (nbValides > 0) existing.statut = "en_cours";
          }
        } else if (nbValides > 0) {
          progressions.push({
            eleve_uid:   uid,
            chapitre_id: chapId,
            pourcentage: pourcentageParcours,
            statut:      nbValides === exoIds.length ? "valide" : "en_cours",
            updated_at:  new Date().toISOString(),
          });
          progressionKeys.add(key);
        }
      }
    }
  }

  return NextResponse.json({
    eleves,
    chapitres:    chapitres ?? [],
    progressions,
    groupes:      groupes ?? [],
    memberships:  membershipsNorm,
  });
}

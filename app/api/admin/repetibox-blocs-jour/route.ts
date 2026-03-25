import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/admin/repetibox-blocs-jour
 *
 * Retourne un seul objet agrégé pour le tableau de bord enseignant :
 * - groupeLabels : noms des groupes Repetibox activés aujourd'hui
 * - eleves       : liste des élèves actifs avec leur total de cartes dues
 *
 * Logique d'activation (priorité identique à /api/revisions-repetibox-jour) :
 *   override individuel RB > override individuel PB > config groupe > inactif
 */
export async function GET() {
  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // ── 1. Configs + membres ─────────────────────────────────────────────────
  const [{ data: allConfigs }, { data: allMembres }] = await Promise.all([
    admin.from("pb_repetibox_config").select("groupe_id, eleve_id, repetibox_eleve_id, actif"),
    admin.from("eleve_groupe")
      .select("groupe_id, planbox_eleve_id, repetibox_eleve_id")
      .not("repetibox_eleve_id", "is", null),
  ]);

  // Maps de lookup
  const configByGroupeId = new Map<string, boolean>();
  const configByPbId     = new Map<string, boolean>();
  const configByRbId     = new Map<number, boolean>();

  for (const c of allConfigs ?? []) {
    if (c.groupe_id)          configByGroupeId.set(c.groupe_id, c.actif);
    if (c.eleve_id)           configByPbId.set(c.eleve_id, c.actif);
    if (c.repetibox_eleve_id) configByRbId.set(c.repetibox_eleve_id, c.actif);
  }

  // ── 2. Grouper les membres par repetibox_eleve_id ────────────────────────
  const rbToInfo = new Map<number, { groupeIds: string[]; planboxEleveId: string | null }>();
  for (const m of allMembres ?? []) {
    const rbId = m.repetibox_eleve_id as number;
    if (!rbToInfo.has(rbId)) rbToInfo.set(rbId, { groupeIds: [], planboxEleveId: m.planbox_eleve_id });
    rbToInfo.get(rbId)!.groupeIds.push(m.groupe_id);
  }

  // ── 3. Élèves RB actifs + groupes activés ────────────────────────────────
  const activeRbIds       = new Set<number>();
  const activeGroupeIds   = new Set<string>();

  for (const [rbId, info] of rbToInfo) {
    // Override individuel RB ?
    if (configByRbId.has(rbId)) {
      if (configByRbId.get(rbId)) activeRbIds.add(rbId);
      continue;
    }
    // Override individuel PB ?
    if (info.planboxEleveId && configByPbId.has(info.planboxEleveId)) {
      if (configByPbId.get(info.planboxEleveId)) activeRbIds.add(rbId);
      continue;
    }
    // Config groupe : actif si au moins un groupe est actif
    const groupesActifs = info.groupeIds.filter((gId) => configByGroupeId.get(gId) === true);
    if (groupesActifs.length > 0) {
      activeRbIds.add(rbId);
      groupesActifs.forEach((gId) => activeGroupeIds.add(gId));
    }
  }

  // Élèves RB individuellement activés (hors groupe)
  for (const c of allConfigs ?? []) {
    if (c.repetibox_eleve_id && c.actif && !rbToInfo.has(c.repetibox_eleve_id)) {
      activeRbIds.add(c.repetibox_eleve_id);
    }
  }

  if (activeRbIds.size === 0) return NextResponse.json({ groupeLabels: [], eleves: [] });

  const activeRbArr = [...activeRbIds];

  // ── 4. Noms des groupes activés ──────────────────────────────────────────
  let groupeLabels: string[] = [];
  if (activeGroupeIds.size > 0) {
    const { data: groupes } = await admin
      .from("groupes")
      .select("id, nom")
      .in("id", [...activeGroupeIds]);
    groupeLabels = (groupes ?? []).map((g: { nom: string }) => g.nom);
  }

  // ── 5. Noms de TOUS les élèves actifs ────────────────────────────────────
  const { data: elevesData } = await admin
    .from("eleve")
    .select("id, prenom, nom")
    .in("id", activeRbArr);

  const eleveNomMap = new Map<number, { prenom: string; nom: string }>(
    (elevesData ?? []).map((e: { id: number; prenom: string; nom: string }) => [e.id, e])
  );

  // ── 6. Progressions dues aujourd'hui + total progressions par élève ──────
  const [{ data: progDues, error: progError }, { data: progTotales }] = await Promise.all([
    admin.from("progression").select("eleve_id")
      .in("eleve_id", activeRbArr)
      .lte("prochaine_revision", today),
    admin.from("progression").select("eleve_id")
      .in("eleve_id", activeRbArr),
  ]);

  if (progError) return NextResponse.json({ error: progError.message }, { status: 500 });

  // Cartes dues par élève
  const duesParEleve = new Map<number, number>();
  for (const p of (progDues ?? []) as { eleve_id: number }[]) {
    duesParEleve.set(p.eleve_id, (duesParEleve.get(p.eleve_id) ?? 0) + 1);
  }

  // Existence d'au moins une progression par élève (pour détecter "jamais commencé")
  const aCommence = new Set<number>(
    (progTotales ?? []).map((p: { eleve_id: number }) => p.eleve_id)
  );

  // ── 7. Construire la réponse — TOUS les élèves actifs ────────────────────
  // Statut : "due" (cartes à faire) > "nouveau" (jamais commencé) > "a_jour"
  const eleves = activeRbArr
    .map((rbId) => {
      const meta   = eleveNomMap.get(rbId);
      const dues   = duesParEleve.get(rbId) ?? 0;
      const statut = dues > 0 ? "due" : !aCommence.has(rbId) ? "nouveau" : "a_jour";
      return {
        rb_eleve_id:       rbId,
        prenom:            meta?.prenom ?? "—",
        nom:               meta?.nom ?? "",
        total_cartes_dues: dues,
        statut,
      };
    })
    .sort((a, b) => {
      const ordre = { due: 0, nouveau: 1, a_jour: 2 };
      const diff  = ordre[a.statut as keyof typeof ordre] - ordre[b.statut as keyof typeof ordre];
      if (diff !== 0) return diff;
      return a.prenom.localeCompare(b.prenom);
    });

  return NextResponse.json({ groupeLabels, eleves });
}

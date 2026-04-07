import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/podcasts — liste tous les podcasts (QCM) avec scores et config podium
// Inclut aussi les podcasts non-assignés de la bibliothèque
export async function GET(req: NextRequest) {
  const enseignantId = new URL(req.url).searchParams.get("enseignant_id");
  const admin = createAdminClient();

  // 1. Récupérer tous les blocs podcast avec qcm_id (un par qcm_id suffit)
  const { data: blocs, error: errBlocs } = await admin
    .from("plan_travail")
    .select("id, titre, contenu, date_assignation, created_at")
    .eq("type", "ressource")
    .not("contenu->qcm_id", "is", null)
    .order("created_at", { ascending: false });

  if (errBlocs) return NextResponse.json({ erreur: errBlocs.message }, { status: 500 });

  // Dédupliquer par qcm_id
  const parQcm = new Map<string, { qcm_id: string; titre: string; date: string; contenu: Record<string, unknown> }>();
  for (const b of blocs ?? []) {
    const qcmId = (b.contenu as any)?.qcm_id;
    if (!qcmId || parQcm.has(qcmId)) continue;
    parQcm.set(qcmId, { qcm_id: qcmId, titre: b.titre, date: b.date_assignation, contenu: b.contenu as Record<string, unknown> });
  }

  // 1b. Récupérer les podcasts de la bibliothèque (non encore assignés)
  let biblioRes: Array<{ id: string; titre: string; sous_type: string; contenu: Record<string, unknown>; created_at: string }> = [];
  if (enseignantId) {
    const { data } = await admin
      .from("banque_ressources")
      .select("id, titre, sous_type, contenu, created_at")
      .eq("enseignant_id", enseignantId)
      .eq("sous_type", "podcast")
      .order("created_at", { ascending: false });
    biblioRes = (data ?? []) as typeof biblioRes;
  }

  // 2. Récupérer toutes les réponses QCM
  const { data: reponses } = await admin
    .from("qcm_reponse")
    .select("qcm_id, prenom, nom, score, total, eleve_id, repetibox_eleve_id, created_at")
    .order("created_at", { ascending: true });

  // Grouper par qcm_id → par élève (meilleur score)
  const scoresParQcm = new Map<string, Map<string, { prenom: string; nom: string; score: number; total: number; eleve_id: string | null; repetibox_eleve_id: number | null; created_at: string }>>();
  for (const r of reponses ?? []) {
    if (!scoresParQcm.has(r.qcm_id)) scoresParQcm.set(r.qcm_id, new Map());
    const eleves = scoresParQcm.get(r.qcm_id)!;
    const key = r.eleve_id ?? (r.repetibox_eleve_id ? `rb_${r.repetibox_eleve_id}` : `${r.prenom}_${r.nom}`);
    const existing = eleves.get(key);
    if (!existing || r.score > existing.score) {
      eleves.set(key, r);
    }
  }

  // 3. Récupérer la config podium
  const { data: configs } = await admin
    .from("podcast_podium_config")
    .select("qcm_id, dans_podium");

  const podiumMap = new Map<string, boolean>();
  for (const c of configs ?? []) {
    podiumMap.set(c.qcm_id, c.dans_podium);
  }

  // 4. Construire la réponse
  const podcasts = [...parQcm.values()].map((p) => {
    const eleves = scoresParQcm.get(p.qcm_id);
    const scores = eleves
      ? [...eleves.values()]
          .map((e) => ({
            prenom: e.prenom,
            nom: e.nom,
            score: e.score,
            total: e.total,
            pct: e.total > 0 ? Math.round((e.score / e.total) * 100) : 0,
            eleve_id: e.eleve_id,
            repetibox_eleve_id: e.repetibox_eleve_id,
            created_at: e.created_at,
          }))
          .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at))
      : [];

    return {
      qcm_id: p.qcm_id,
      titre: p.titre,
      date: p.date,
      contenu: p.contenu,
      dans_podium: podiumMap.get(p.qcm_id) ?? true, // par défaut dans le podium
      nb_eleves: scores.length,
      scores,
    };
  });

  // 5. Podcasts de la bibliothèque non encore assignés
  const biblio = biblioRes
    .filter((r) => {
      // Vérifier que ce podcast n'est pas déjà dans la liste assignée (par titre)
      return !podcasts.some((p) => p.titre === r.titre);
    })
    .map((r) => ({
      biblio_id: r.id,
      qcm_id: null as string | null,
      titre: r.titre,
      date: null as string | null,
      contenu: r.contenu,
      dans_podium: false,
      nb_eleves: 0,
      scores: [] as typeof podcasts[0]["scores"],
    }));

  return NextResponse.json({ podcasts, biblio });
}

// PATCH /api/podcasts — met à jour la config podium d'un podcast
export async function PATCH(req: NextRequest) {
  const { qcm_id, dans_podium, titre } = await req.json();
  if (!qcm_id) return NextResponse.json({ erreur: "qcm_id requis" }, { status: 400 });

  const admin = createAdminClient();

  const { error } = await admin
    .from("podcast_podium_config")
    .upsert(
      { qcm_id, dans_podium: dans_podium ?? true, titre: titre ?? "" },
      { onConflict: "qcm_id" }
    );

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

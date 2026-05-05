import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/qcm-reponse — enregistre la réponse d'un élève
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    qcm_id,
    plan_travail_id,
    eleve_id,
    repetibox_eleve_id,
    prenom,
    nom,
    score,
    total,
    reponses,
  } = body;

  if (!qcm_id || score === undefined || total === undefined || !prenom) {
    return NextResponse.json(
      { erreur: "Champs requis manquants (qcm_id, score, total, prenom)" },
      { status: 400 }
    );
  }

  // Validation basique des scores pour empêcher la manipulation
  if (typeof score !== "number" || typeof total !== "number" || score < 0 || total <= 0 || score > total) {
    return NextResponse.json(
      { erreur: "score et total invalides" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verrou : un élève ne peut répondre qu'une seule fois à un QCM de podcast
  if (eleve_id || repetibox_eleve_id) {
    let verrou = admin.from("qcm_reponse").select("id").eq("qcm_id", qcm_id).limit(1);
    if (eleve_id) verrou = verrou.eq("eleve_id", eleve_id);
    else verrou = verrou.eq("repetibox_eleve_id", repetibox_eleve_id);
    const { data: dejaRepondu } = await verrou;
    if (dejaRepondu && dejaRepondu.length > 0) {
      return NextResponse.json(
        { erreur: "Tu as déjà répondu à ce questionnaire.", deja_repondu: true },
        { status: 409 }
      );
    }
  }

  const { error } = await admin.from("qcm_reponse").insert({
    qcm_id,
    plan_travail_id: plan_travail_id || null,
    eleve_id: eleve_id || null,
    repetibox_eleve_id: repetibox_eleve_id || null,
    prenom,
    nom: nom || "",
    score,
    total,
    reponses: reponses ?? null,
  });

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// GET /api/qcm-reponse?qcm_id=...  — classement d'un QCM
// GET /api/qcm-reponse?global=true  — classement global cumulé
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qcm_id = searchParams.get("qcm_id");
  const global = searchParams.get("global");

  const admin = createAdminClient();

  // ── Classement global ────────────────────────────────────────────────────
  if (global === "true") {
    const [{ data, error }, { data: podiumConfigs }] = await Promise.all([
      admin
        .from("qcm_reponse")
        .select("qcm_id, prenom, nom, score, total, eleve_id, repetibox_eleve_id, created_at")
        .order("created_at", { ascending: true }),
      admin
        .from("podcast_podium_config")
        .select("qcm_id, dans_podium")
        .eq("dans_podium", false),
    ]);

    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

    // QCM exclus du podium
    const exclus = new Set((podiumConfigs ?? []).map((c) => c.qcm_id));

    // Pour chaque élève, meilleur score par QCM, puis somme
    type EleveAgg = {
      prenom: string; nom: string;
      scoresParQcm: Map<string, { score: number; total: number }>;
    };
    const elevesMap = new Map<string, EleveAgg>();

    for (const r of data ?? []) {
      if (exclus.has(r.qcm_id)) continue; // exclure les podcasts hors podium
      const key = r.eleve_id ?? (r.repetibox_eleve_id ? `rb_${r.repetibox_eleve_id}` : `${r.prenom}_${r.nom}`);
      if (!elevesMap.has(key)) {
        elevesMap.set(key, { prenom: r.prenom, nom: r.nom, scoresParQcm: new Map() });
      }
      const eleve = elevesMap.get(key)!;
      // Garder uniquement la première réponse (data trié par created_at ASC)
      if (!eleve.scoresParQcm.has(r.qcm_id)) {
        eleve.scoresParQcm.set(r.qcm_id, { score: r.score, total: r.total });
      }
    }

    const classementGlobal = [...elevesMap.values()]
      .map((e) => {
        let scoreTotal = 0;
        let questionsTotal = 0;
        let nbQcm = 0;
        for (const { score, total } of e.scoresParQcm.values()) {
          scoreTotal += score;
          questionsTotal += total;
          nbQcm++;
        }
        return {
          prenom: e.prenom,
          nom: e.nom,
          score_total: scoreTotal,
          questions_total: questionsTotal,
          nb_qcm: nbQcm,
          pct: questionsTotal > 0 ? Math.round((scoreTotal / questionsTotal) * 100) : 0,
        };
      })
      .sort((a, b) => b.score_total - a.score_total || b.pct - a.pct);

    return NextResponse.json({ classement: classementGlobal });
  }

  // ── Classement d'un QCM spécifique ──────────────────────────────────────
  if (!qcm_id) {
    return NextResponse.json({ erreur: "qcm_id ou global=true requis" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("qcm_reponse")
    .select("prenom, nom, score, total, eleve_id, repetibox_eleve_id, created_at")
    .eq("qcm_id", qcm_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  // Dédupliquer : garder la première réponse de chaque élève
  const seen = new Map<string, typeof data[0]>();
  for (const r of data ?? []) {
    const key = r.eleve_id ?? (r.repetibox_eleve_id ? `rb_${r.repetibox_eleve_id}` : `${r.prenom}_${r.nom}`);
    if (!seen.has(key)) seen.set(key, r);
  }

  const classement = [...seen.values()].sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));

  return NextResponse.json({ classement });
}

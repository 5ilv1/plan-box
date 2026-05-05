import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/enseignant/eleves/[id]/exercices
 * [id] = "pb_UUID" (PlanBox) ou "rb_N" (Repetibox)
 *
 * Retourne la liste des exercices tentés par cet élève, groupés par
 * chapitre, avec leur dernier résultat (score, validé, force_par_enseignant).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { id: uid } = await context.params;
  if (!uid) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const isPb = uid.startsWith("pb_");
  const isRb = uid.startsWith("rb_");
  if (!isPb && !isRb) {
    return NextResponse.json({ erreur: "Format d'id invalide (pb_UUID ou rb_N)" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── 1. Identité élève ───────────────────────────────────────────────────
  let prenom: string | null = null;
  let nom: string | null = null;
  let niveau: string | null = null;

  if (isPb) {
    const pbId = uid.slice(3);
    const { data } = await admin
      .from("eleves")
      .select("prenom, nom, niveaux(nom)")
      .eq("id", pbId)
      .maybeSingle();
    prenom = data?.prenom ?? null;
    nom = data?.nom ?? null;
    niveau = (data as unknown as { niveaux?: { nom?: string } })?.niveaux?.nom ?? null;
  } else {
    const rbId = parseInt(uid.slice(3), 10);
    const { data } = await admin
      .from("eleve")
      .select("prenom, nom")
      .eq("id", rbId)
      .maybeSingle();
    prenom = data?.prenom ?? null;
    nom = data?.nom ?? null;
  }

  if (!prenom) {
    return NextResponse.json({ erreur: "Élève introuvable" }, { status: 404 });
  }

  // ── 2. Tous les résultats de l'élève ────────────────────────────────────
  let resultatsQ = admin
    .from("exercice_resultat")
    .select("id, exercice_id, score, total, valide, force_par_enseignant, created_at")
    .order("created_at", { ascending: false });

  if (isPb) {
    resultatsQ = resultatsQ.eq("eleve_id", uid.slice(3));
  } else {
    resultatsQ = resultatsQ.eq("rb_eleve_id", parseInt(uid.slice(3), 10));
  }

  const { data: resultats, error: errR } = await resultatsQ;
  if (errR) {
    console.error("[eleves/exercices][GET][resultats]", errR);
    return NextResponse.json({ erreur: "Erreur lecture résultats" }, { status: 500 });
  }

  type ResRow = {
    id: string;
    exercice_id: string;
    score: number;
    total: number;
    valide: boolean;
    force_par_enseignant: boolean;
    created_at: string;
  };
  const rResultats = (resultats ?? []) as ResRow[];

  // Garder UNIQUEMENT le résultat le plus récent par exercice
  const dernierParExercice = new Map<string, ResRow>();
  for (const r of rResultats) {
    if (!dernierParExercice.has(r.exercice_id)) dernierParExercice.set(r.exercice_id, r);
  }
  const exerciceIds = [...dernierParExercice.keys()];

  if (exerciceIds.length === 0) {
    return NextResponse.json({
      eleve: { uid, prenom, nom, niveau },
      chapitres: [],
    });
  }

  // ── 3. Métadonnées des exercices + chapitres ────────────────────────────
  const { data: exercices, error: errE } = await admin
    .from("exercice")
    .select("id, ordre, type, titre, contenu, chapitre_id")
    .in("id", exerciceIds);

  if (errE) {
    console.error("[eleves/exercices][GET][exercices]", errE);
    return NextResponse.json({ erreur: "Erreur lecture exercices" }, { status: 500 });
  }

  type ExoRow = {
    id: string;
    ordre: number | null;
    type: string;
    titre: string | null;
    contenu: { titre?: string; consigne?: string } | null;
    chapitre_id: string | null;
  };
  const rExos = (exercices ?? []) as ExoRow[];

  const chapitreIds = [...new Set(rExos.map((e) => e.chapitre_id).filter((c): c is string => !!c))];

  let mapChapitres = new Map<string, { id: string; titre: string; matiere: string | null; sous_matiere: string | null }>();
  if (chapitreIds.length > 0) {
    const { data: chaps } = await admin
      .from("chapitres")
      .select("id, titre, matiere, sous_matiere")
      .in("id", chapitreIds);
    for (const c of (chaps ?? []) as { id: string; titre: string; matiere: string | null; sous_matiere: string | null }[]) {
      mapChapitres.set(c.id, c);
    }
  }

  // ── 4. Regroupement par chapitre ────────────────────────────────────────
  type ExerciceLigne = {
    exercice_id: string;
    type: string;
    ordre: number | null;
    titre: string;
    consigne: string | null;
    resultat_id: string;
    score: number;
    total: number;
    pourcentage: number;
    valide: boolean;
    force_par_enseignant: boolean;
    created_at: string;
  };

  const groupes = new Map<string, {
    chapitre_id: string;
    titre: string;
    matiere: string | null;
    sous_matiere: string | null;
    exercices: ExerciceLigne[];
  }>();

  for (const e of rExos) {
    if (!e.chapitre_id) continue;
    const r = dernierParExercice.get(e.id);
    if (!r) continue;
    const chap = mapChapitres.get(e.chapitre_id);
    const key = e.chapitre_id;
    let g = groupes.get(key);
    if (!g) {
      g = {
        chapitre_id: e.chapitre_id,
        titre: chap?.titre ?? "(chapitre supprimé)",
        matiere: chap?.matiere ?? null,
        sous_matiere: chap?.sous_matiere ?? null,
        exercices: [],
      };
      groupes.set(key, g);
    }
    const titre = e.contenu?.titre ?? e.titre ?? `Exercice ${e.ordre ?? ""}`.trim();
    const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
    g.exercices.push({
      exercice_id: e.id,
      type: e.type,
      ordre: e.ordre,
      titre,
      consigne: e.contenu?.consigne ?? null,
      resultat_id: r.id,
      score: r.score,
      total: r.total,
      pourcentage: pct,
      valide: r.valide,
      force_par_enseignant: r.force_par_enseignant,
      created_at: r.created_at,
    });
  }

  // Tri : exercices par ordre dans chaque chapitre, chapitres par titre
  const chapitres = [...groupes.values()]
    .map((g) => ({
      ...g,
      exercices: g.exercices.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    }))
    .sort((a, b) => a.titre.localeCompare(b.titre, "fr"));

  return NextResponse.json({
    eleve: { uid, prenom, nom, niveau },
    chapitres,
  });
}

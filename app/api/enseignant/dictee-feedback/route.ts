import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/enseignant/dictee-feedback
 * Query params:
 *  - statut: "pending" (défaut) | "valide" | "corrige" | "rejete" | "all"
 *  - limit:  nombre max de lignes (défaut 50, max 200)
 *
 * Retourne les entrées de feedback avec métadonnées élève (prénom/nom) et
 * infos du bloc (type, dictée titre si présent) pour l'écran de revue.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const statut = url.searchParams.get("statut") ?? "pending";
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 50 : limitRaw, 1), 200);

  const admin = createAdminClient();
  let q = admin
    .from("dictee_correction_feedback")
    .select(
      "id, created_at, bloc_id, eleve_id, repetibox_eleve_id, niveau, mot_attendu, mot_eleve, contexte, kind, type_erreur_ia, indice_ia, statut, type_erreur_corrige, indice_corrige, commentaire_enseignant, decide_le",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statut === "pending") q = q.is("statut", null);
  else if (statut !== "all") q = q.eq("statut", statut);

  const { data, error } = await q;
  if (error) {
    console.error("[dictee-feedback][GET]", error);
    return NextResponse.json({ erreur: "Erreur base de données" }, { status: 500 });
  }

  // Enrichir : prénom/nom élève + infos bloc
  type Row = {
    id: string;
    bloc_id: string | null;
    eleve_id: string | null;
    repetibox_eleve_id: number | null;
  } & Record<string, unknown>;
  const rows = (data ?? []) as Row[];

  const eleveIds = [...new Set(rows.map((r) => r.eleve_id).filter((v): v is string => !!v))];
  const repIds   = [...new Set(rows.map((r) => r.repetibox_eleve_id).filter((v): v is number => v != null))];
  const blocIds  = [...new Set(rows.map((r) => r.bloc_id).filter((v): v is string => !!v))];

  const [elevesR, eleveR, blocsR] = await Promise.all([
    eleveIds.length
      ? admin.from("eleves").select("id, prenom, nom").in("id", eleveIds)
      : Promise.resolve({ data: [] }),
    repIds.length
      ? admin.from("eleve").select("id, prenom, nom").in("id", repIds)
      : Promise.resolve({ data: [] }),
    blocIds.length
      ? admin.from("plan_travail").select("id, type, contenu").in("id", blocIds)
      : Promise.resolve({ data: [] }),
  ]);

  const mapEleves = new Map<string, { prenom: string; nom: string }>();
  for (const e of (elevesR.data ?? []) as { id: string; prenom: string; nom: string }[]) {
    mapEleves.set(e.id, { prenom: e.prenom, nom: e.nom });
  }
  const mapRepetibox = new Map<number, { prenom: string; nom: string }>();
  for (const e of (eleveR.data ?? []) as { id: number; prenom: string; nom: string }[]) {
    mapRepetibox.set(e.id, { prenom: e.prenom, nom: e.nom });
  }
  const mapBlocs = new Map<string, { type: string; titre?: string; niveau_etoiles?: number }>();
  for (const b of (blocsR.data ?? []) as { id: string; type: string; contenu: { titre?: string; niveau_etoiles?: number } }[]) {
    mapBlocs.set(b.id, { type: b.type, titre: b.contenu?.titre, niveau_etoiles: b.contenu?.niveau_etoiles });
  }

  const enriched = rows.map((r) => {
    const eleve = r.eleve_id
      ? mapEleves.get(r.eleve_id)
      : r.repetibox_eleve_id != null
        ? mapRepetibox.get(r.repetibox_eleve_id)
        : null;
    const bloc = r.bloc_id ? mapBlocs.get(r.bloc_id) : null;
    return {
      ...r,
      eleve_prenom: eleve?.prenom ?? null,
      eleve_nom: eleve?.nom ?? null,
      bloc_type: bloc?.type ?? null,
      bloc_titre: bloc?.titre ?? null,
      bloc_etoiles: bloc?.niveau_etoiles ?? null,
    };
  });

  return NextResponse.json({ rows: enriched });
}

/**
 * PATCH /api/enseignant/dictee-feedback
 * Body: { id, statut, type_erreur_corrige?, indice_corrige?, commentaire_enseignant? }
 * Met à jour une décision enseignante (valider / corriger / rejeter).
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json();
  const id: string | undefined = body.id;
  const statut: string | undefined = body.statut;

  if (!id || !statut || !["valide", "corrige", "rejete"].includes(statut)) {
    return NextResponse.json({ erreur: "id et statut (valide|corrige|rejete) requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    statut,
    decide_le: new Date().toISOString(),
    decide_par: auth.user.id,
  };
  if (statut === "corrige") {
    update.type_erreur_corrige = body.type_erreur_corrige ?? null;
    update.indice_corrige = body.indice_corrige ?? null;
  } else {
    // reset en cas de changement d'avis
    update.type_erreur_corrige = null;
    update.indice_corrige = null;
  }
  if (body.commentaire_enseignant !== undefined) {
    update.commentaire_enseignant = body.commentaire_enseignant || null;
  }

  const { error } = await admin
    .from("dictee_correction_feedback")
    .update(update)
    .eq("id", id);

  if (error) {
    console.error("[dictee-feedback][PATCH]", error);
    return NextResponse.json({ erreur: "Échec mise à jour" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

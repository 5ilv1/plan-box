import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/admin/groupes/[id]/membres
// Ajoute un membre au groupe ET lui assigne les exercices futurs du groupe
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupeId } = await params;
  const body = await req.json().catch(() => null);
  const { eleveUid } = body ?? {};

  if (!groupeId || !eleveUid) {
    return NextResponse.json({ erreur: "groupeId et eleveUid requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Insérer dans eleve_groupe
  let ligne: Record<string, unknown>;
  if (eleveUid.startsWith("pb_")) {
    ligne = { groupe_id: groupeId, planbox_eleve_id: eleveUid.replace("pb_", ""), repetibox_eleve_id: null };
  } else {
    ligne = { groupe_id: groupeId, planbox_eleve_id: null, repetibox_eleve_id: parseInt(eleveUid.replace("rb_", ""), 10) };
  }

  const { error: errInsertion } = await admin.from("eleve_groupe").insert(ligne);
  if (errInsertion) return NextResponse.json({ erreur: errInsertion.message }, { status: 500 });

  // 2. Retrouver le nom du groupe
  const { data: groupe } = await admin
    .from("groupes")
    .select("nom")
    .eq("id", groupeId)
    .single();

  if (!groupe) {
    return NextResponse.json({ ok: true, exercicesAssignes: 0 }, { status: 201 });
  }

  // 3. Trouver tous les plan_travail du groupe à partir d'aujourd'hui (dédupliqués)
  const today = new Date().toISOString().split("T")[0];
  const { data: existants } = await admin
    .from("plan_travail")
    .select("type, titre, date_assignation, date_limite, periodicite, chapitre_id, contenu, groupe_label")
    .eq("groupe_label", groupe.nom)
    .gte("date_assignation", today);

  if (!existants || existants.length === 0) {
    return NextResponse.json({ ok: true, exercicesAssignes: 0 }, { status: 201 });
  }

  // 4. Déduplication et sélection du bon niveau de dictée
  const eleve_id = eleveUid.startsWith("pb_") ? eleveUid.replace("pb_", "") : null;
  const rb_id    = eleveUid.startsWith("rb_") ? parseInt(eleveUid.replace("rb_", ""), 10) : null;

  // Inférer le niveau de dictée (étoiles) de l'élève depuis son historique
  // Les étoiles sont indépendantes du groupe : on regarde les dictées déjà assignées à cet élève
  let etoilesEleve: 1 | 2 | 3 | 4 = 2; // défaut ⭐⭐
  {
    const q = admin.from("plan_travail")
      .select("contenu")
      .eq("type", "dictee")
      .not("contenu", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: lastDictee } = rb_id !== null
      ? await q.eq("repetibox_eleve_id", rb_id)
      : await q.eq("eleve_id", eleve_id!);
    const niveauHistorique = (lastDictee?.[0]?.contenu as Record<string, unknown> | null)?.niveau_etoiles;
    if (niveauHistorique === 1 || niveauHistorique === 2 || niveauHistorique === 3 || niveauHistorique === 4) {
      etoilesEleve = niveauHistorique;
    }
  }

  // Grouper les templates par (date_assignation, type, titre)
  // Pour les dictées : sélectionner le template dont niveau_etoiles correspond à l'élève
  // Pour les autres types : prendre le premier trouvé
  const parCle = new Map<string, (typeof existants)[0]>();
  for (const r of existants) {
    const cle = `${r.date_assignation}||${r.type}||${r.titre ?? ""}`;
    if (r.type === "dictee") {
      const etoilesTemplate = (r.contenu as Record<string, unknown> | null)?.niveau_etoiles;
      // Priorité au template qui correspond aux étoiles de l'élève
      if (etoilesTemplate === etoilesEleve) {
        parCle.set(cle, r); // écrase les éventuels templates moins bien adaptés
      } else if (!parCle.has(cle)) {
        parCle.set(cle, r); // fallback si aucun template au bon niveau n'existe
      }
    } else {
      if (!parCle.has(cle)) parCle.set(cle, r);
    }
  }

  const nouvelles: Record<string, unknown>[] = [...parCle.values()].map((r) => ({
    type:               r.type,
    titre:              r.titre,
    date_assignation:   r.date_assignation,
    date_limite:        r.date_limite,
    periodicite:        r.periodicite,
    chapitre_id:        r.chapitre_id,
    contenu:            r.contenu,
    groupe_label:       r.groupe_label,
    statut:             "a_faire",
    eleve_id,
    repetibox_eleve_id: rb_id,
  }));

  let nbInseres = 0;
  for (const row of nouvelles) {
    const { error } = await admin.from("plan_travail").insert(row);
    if (!error) {
      nbInseres++;
    } else if (error.code !== "23505") {
      // 23505 = unique_violation → l'élève a déjà cet exercice, on skip silencieusement
      console.error("Erreur insert plan_travail:", error.message);
    }
  }

  return NextResponse.json({ ok: true, exercicesAssignes: nbInseres }, { status: 201 });
}

// DELETE /api/admin/groupes/[id]/membres?uid=<pb_xxx|rb_xxx>
// Retire un membre du groupe ET supprime ses exercices futurs du groupe (non terminés)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupeId } = await params;
  const eleveUid = new URL(req.url).searchParams.get("uid");

  if (!groupeId || !eleveUid) {
    return NextResponse.json({ erreur: "groupeId et uid requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Retrouver le nom du groupe avant de supprimer le membre
  const { data: groupe } = await admin
    .from("groupes")
    .select("nom")
    .eq("id", groupeId)
    .single();

  // 2. Retirer de eleve_groupe
  let query = admin.from("eleve_groupe").delete().eq("groupe_id", groupeId);
  if (eleveUid.startsWith("pb_")) {
    query = query.eq("planbox_eleve_id", eleveUid.replace("pb_", ""));
  } else {
    query = query.eq("repetibox_eleve_id", parseInt(eleveUid.replace("rb_", ""), 10));
  }
  const { error } = await query;
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // 3. Supprimer les exercices futurs du groupe pour cet élève (non terminés)
  if (groupe) {
    const today = new Date().toISOString().split("T")[0];

    let planQuery = admin
      .from("plan_travail")
      .delete()
      .eq("groupe_label", groupe.nom)
      .gte("date_assignation", today)
      .neq("statut", "fait");

    if (eleveUid.startsWith("pb_")) {
      planQuery = planQuery.eq("eleve_id", eleveUid.replace("pb_", ""));
    } else {
      planQuery = planQuery.eq("repetibox_eleve_id", parseInt(eleveUid.replace("rb_", ""), 10));
    }

    const { error: errPlan } = await planQuery;
    if (errPlan) console.error("Erreur suppression exercices groupe:", errPlan.message);
  }

  return NextResponse.json({ ok: true });
}

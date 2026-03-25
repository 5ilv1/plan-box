import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/admin/eleves
// Retourne tous les élèves : Plan Box (eleves + niveaux) ET Repetibox (eleve + meta)
export async function GET() {
  const admin = createAdminClient();

  const [
    { data: pbEleves },
    { data: rbEleves },
    { data: metas },
    { data: groupes },
    { data: liaisons },
  ] = await Promise.all([
    admin.from("eleves").select("*, niveaux(*)").order("nom"),
    admin.from("eleve").select("id, prenom, nom, identifiant, classe_id").order("prenom"),
    admin.from("eleves_planbox_meta").select("*"),
    admin.from("groupes").select("id, nom"),
    admin.from("eleve_groupe").select("groupe_id, planbox_eleve_id, repetibox_eleve_id"),
  ]);

  // Enrichir les élèves RB avec leur meta + groupes
  const metaMap = new Map((metas ?? []).map((m: any) => [m.repetibox_eleve_id, m]));
  const groupeMap = new Map((groupes ?? []).map((g: any) => [g.id, g.nom]));

  const pbWithGroupes = (pbEleves ?? []).map((e: any) => {
    const groupeIds = (liaisons ?? [])
      .filter((l: any) => l.planbox_eleve_id === e.id)
      .map((l: any) => ({ id: l.groupe_id, nom: groupeMap.get(l.groupe_id) ?? "" }));
    return { ...e, source: "planbox", groupes: groupeIds };
  });

  const rbWithMeta = (rbEleves ?? []).map((e: any) => {
    const meta = metaMap.get(e.id) ?? {};
    const groupeIds = (liaisons ?? [])
      .filter((l: any) => l.repetibox_eleve_id === e.id)
      .map((l: any) => ({ id: l.groupe_id, nom: groupeMap.get(l.groupe_id) ?? "" }));
    return {
      ...e,
      source: "repetibox",
      niveau_etoiles: meta.niveau_etoiles ?? null,
      groupes: groupeIds,
    };
  });

  return NextResponse.json({
    planbox: pbWithGroupes,
    repetibox: rbWithMeta,
    groupes: groupes ?? [],
  });
}

// POST /api/admin/eleves
// Crée un élève Plan Box (compte Supabase Auth + entrée eleves)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { prenom, nom, email, password, niveau_id, groupeIds } = body ?? {};

  if (!prenom?.trim() || !nom?.trim() || !email?.trim() || !password || !niveau_id) {
    return NextResponse.json(
      { erreur: "Champs requis : prenom, nom, email, password, niveau_id" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Créer le compte Supabase Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { erreur: authError?.message ?? "Échec de création du compte" },
      { status: 500 }
    );
  }

  const userId = authData.user.id;

  // Insérer dans la table eleves
  const { error: elevesError } = await admin.from("eleves").insert({
    id: userId,
    prenom: prenom.trim(),
    nom: nom.trim(),
    niveau_id,
  });

  if (elevesError) {
    // Rollback : supprimer le compte auth créé
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ erreur: elevesError.message }, { status: 500 });
  }

  // Ajouter aux groupes si fournis
  if (Array.isArray(groupeIds) && groupeIds.length > 0) {
    const lignes = groupeIds.map((gId: string) => ({
      groupe_id: gId,
      planbox_eleve_id: userId,
      repetibox_eleve_id: null,
    }));
    await admin.from("eleve_groupe").insert(lignes);
  }

  return NextResponse.json({ ok: true, id: userId }, { status: 201 });
}

// PATCH /api/admin/eleves
// Met à jour un élève PB (champs) ou un élève RB (meta + groupes)
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { id, source, niveau_id, groupeIds, niveau_etoiles } = body ?? {};

  if (!id || !source) {
    return NextResponse.json({ erreur: "id et source requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (source === "planbox") {
    // Mise à jour champs Plan Box
    const champsAutorisés = ["prenom", "nom", "niveau_id", "niveau_etoiles"];
    const champsMaj: Record<string, unknown> = {};
    for (const k of champsAutorisés) {
      if (k in body && body[k] !== undefined) champsMaj[k] = body[k];
    }

    if (niveau_id) champsMaj.niveau_id = niveau_id;
    // niveau_etoiles peut être null (réinitialisation)
    if ("niveau_etoiles" in body) champsMaj.niveau_etoiles = body.niveau_etoiles ?? null;

    if (Object.keys(champsMaj).length > 0) {
      const { error } = await admin.from("eleves").update(champsMaj).eq("id", id);
      if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
    }

    // Mise à jour groupes
    if (Array.isArray(groupeIds)) {
      await admin.from("eleve_groupe").delete().eq("planbox_eleve_id", id);
      if (groupeIds.length > 0) {
        const lignes = groupeIds.map((gId: string) => ({
          groupe_id: gId,
          planbox_eleve_id: id,
          repetibox_eleve_id: null,
        }));
        await admin.from("eleve_groupe").insert(lignes);
      }
    }

  } else if (source === "repetibox") {
    const rbId = parseInt(String(id), 10);
    if (isNaN(rbId)) return NextResponse.json({ erreur: "ID RB invalide" }, { status: 400 });

    // Upsert niveau_etoiles dans eleves_planbox_meta
    if (niveau_etoiles !== undefined) {
      await admin.from("eleves_planbox_meta").upsert({
        repetibox_eleve_id: rbId,
        niveau_etoiles,
        updated_at: new Date().toISOString(),
      });
    }

    // Mise à jour groupes
    if (Array.isArray(groupeIds)) {
      await admin.from("eleve_groupe").delete().eq("repetibox_eleve_id", rbId);
      if (groupeIds.length > 0) {
        const lignes = groupeIds.map((gId: string) => ({
          groupe_id: gId,
          planbox_eleve_id: null,
          repetibox_eleve_id: rbId,
        }));
        await admin.from("eleve_groupe").insert(lignes);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/eleves?id=<id>&source=<planbox|repetibox>
export async function DELETE(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const source = params.get("source");

  if (!id || !source) {
    return NextResponse.json({ erreur: "id et source requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (source === "planbox") {
    // Supprimer le compte Supabase Auth (cascade sur eleves + plan_travail + pb_progression)
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  } else if (source === "repetibox") {
    const rbId = parseInt(String(id), 10);
    if (isNaN(rbId)) return NextResponse.json({ erreur: "ID RB invalide" }, { status: 400 });
    // Détacher uniquement : supprimer la meta Plan Box (ne jamais toucher à la table eleve de Repetibox)
    await admin.from("eleves_planbox_meta").delete().eq("repetibox_eleve_id", rbId);
    await admin.from("eleve_groupe").delete().eq("repetibox_eleve_id", rbId);
    await admin.from("plan_travail").delete().eq("repetibox_eleve_id", rbId);
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/affecter-lecon-copier
// Retourne l'historique des leçons à copier assignées
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("plan_travail")
    .select("date_assignation, groupe_label, titre, contenu")
    .eq("type", "lecon_copier")
    .order("date_assignation", { ascending: false })
    .order("groupe_label", { ascending: true });

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Dédoublonnage par (date, groupe, titre)
  const seen = new Set<string>();
  const lignes: { date: string; groupe: string; titre: string; url: string }[] = [];

  for (const row of (data ?? []) as {
    date_assignation: string;
    groupe_label: string | null;
    titre: string;
    contenu: { url?: string } | null;
  }[]) {
    const key = `${row.date_assignation}__${row.groupe_label}__${row.titre}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lignes.push({
      date: row.date_assignation,
      groupe: row.groupe_label ?? "",
      titre: row.titre,
      url: row.contenu?.url ?? "",
    });
  }

  return NextResponse.json({ historique: lignes });
}

// POST /api/affecter-lecon-copier
// Body :
// {
//   titre: string;
//   url: string;                      // lien Google Drive
//   dateAssignation: string;          // "YYYY-MM-DD"
//   groupes: Array<{ groupeId: string; groupeNom: string }>;
// }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { titre, url, dateAssignation, groupes } = body as {
    titre: string;
    url: string;
    dateAssignation: string;
    groupes: Array<{ groupeId: string; groupeNom: string }>;
  };

  if (!titre?.trim()) return NextResponse.json({ erreur: "titre requis" }, { status: 400 });
  if (!url?.trim()) return NextResponse.json({ erreur: "url requis" }, { status: 400 });
  if (!dateAssignation) return NextResponse.json({ erreur: "dateAssignation requis" }, { status: 400 });
  if (!Array.isArray(groupes) || groupes.length === 0)
    return NextResponse.json({ erreur: "groupes[] requis" }, { status: 400 });

  const admin = createAdminClient();

  const groupeIds = groupes.map((g) => g.groupeId);

  // Membres des groupes sélectionnés
  const { data: liaisons, error: liaisonsErr } = await admin
    .from("eleve_groupe")
    .select("groupe_id, planbox_eleve_id, repetibox_eleve_id")
    .in("groupe_id", groupeIds);

  if (liaisonsErr) return NextResponse.json({ erreur: liaisonsErr.message }, { status: 500 });

  // Index : groupeId → membres
  const membresByGroupe = new Map<
    string,
    Array<{ planbox_eleve_id: string | null; repetibox_eleve_id: number | null }>
  >();
  for (const l of (liaisons ?? []) as {
    groupe_id: string;
    planbox_eleve_id: string | null;
    repetibox_eleve_id: number | null;
  }[]) {
    if (!membresByGroupe.has(l.groupe_id)) membresByGroupe.set(l.groupe_id, []);
    membresByGroupe.get(l.groupe_id)!.push({
      planbox_eleve_id: l.planbox_eleve_id,
      repetibox_eleve_id: l.repetibox_eleve_id,
    });
  }

  // Construit les lignes plan_travail
  const lignes: Record<string, unknown>[] = [];

  for (const groupe of groupes) {
    const membres = membresByGroupe.get(groupe.groupeId) ?? [];
    for (const m of membres) {
      lignes.push({
        type: "lecon_copier",
        titre: titre.trim(),
        contenu: { url: url.trim() },
        statut: "a_faire",
        date_assignation: dateAssignation,
        date_limite: null,
        periodicite: "jour",
        groupe_label: groupe.groupeNom,
        eleve_id: m.planbox_eleve_id ?? null,
        repetibox_eleve_id: m.repetibox_eleve_id ?? null,
        chapitre_id: null,
      });
    }
  }

  if (lignes.length === 0) {
    return NextResponse.json({ ok: true, nb: 0, message: "Aucun élève trouvé dans les groupes sélectionnés." });
  }

  const { error: insertErr } = await admin.from("plan_travail").insert(lignes);
  if (insertErr) return NextResponse.json({ erreur: insertErr.message }, { status: 500 });

  console.log(`[affecter-lecon-copier] ${lignes.length} blocs insérés`);
  return NextResponse.json({ ok: true, nb: lignes.length });
}

// DELETE /api/affecter-lecon-copier
// Supprime toutes les lignes plan_travail correspondant à (date, groupe, titre)
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe, titre } = body as { date: string; groupe: string; titre: string };
  if (!date || !titre) return NextResponse.json({ erreur: "date et titre requis" }, { status: 400 });

  const admin = createAdminClient();

  let query = admin
    .from("plan_travail")
    .delete()
    .eq("type", "lecon_copier")
    .eq("date_assignation", date)
    .eq("titre", titre);

  if (groupe) query = query.eq("groupe_label", groupe);

  const { error } = await query;
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PATCH /api/affecter-lecon-copier
// Modifie le titre et/ou l'URL de toutes les lignes plan_travail correspondant
// à une assignation (date + groupe + ancien titre)
// Body : { date, groupe, ancienTitre, titre, url }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { date, groupe, ancienTitre, titre, url } = body as {
    date: string;
    groupe: string;
    ancienTitre: string;
    titre: string;
    url: string;
  };

  if (!date || !ancienTitre) return NextResponse.json({ erreur: "date et ancienTitre requis" }, { status: 400 });
  if (!titre?.trim()) return NextResponse.json({ erreur: "titre requis" }, { status: 400 });
  if (!url?.trim()) return NextResponse.json({ erreur: "url requise" }, { status: 400 });

  const admin = createAdminClient();

  let query = admin
    .from("plan_travail")
    .update({ titre: titre.trim(), contenu: { url: url.trim() } })
    .eq("type", "lecon_copier")
    .eq("date_assignation", date)
    .eq("titre", ancienTitre);

  if (groupe) query = query.eq("groupe_label", groupe);

  const { error } = await query;
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

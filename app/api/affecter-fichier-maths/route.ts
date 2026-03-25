import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/affecter-fichier-maths
// Retourne l'historique des affectations fichier de maths,
// dédoublonné par (date_assignation, groupe_label, numero_page)
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("plan_travail")
    .select("date_assignation, groupe_label, contenu")
    .eq("type", "fichier_maths")
    .order("date_assignation", { ascending: false })
    .order("groupe_label", { ascending: true });

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Dédoublonnage : une ligne par (date, groupe)
  const seen = new Set<string>();
  const lignes: { date: string; groupe: string; page: number }[] = [];

  for (const row of (data ?? []) as {
    date_assignation: string;
    groupe_label: string | null;
    contenu: { numero_page?: number } | null;
  }[]) {
    const page = row.contenu?.numero_page ?? 0;
    const key = `${row.date_assignation}__${row.groupe_label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lignes.push({ date: row.date_assignation, groupe: row.groupe_label ?? "", page });
  }

  return NextResponse.json({ historique: lignes });
}

// POST /api/affecter-fichier-maths
// Body :
// {
//   jours: Array<{
//     dateAssignation: string;          // "YYYY-MM-DD"
//     groupes: Array<{
//       groupeId: string;
//       groupeNom: string;
//       page: number | null;            // null ou undefined → groupe ignoré ce jour
//     }>;
//   }>;
// }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { jours } = body as {
    jours: Array<{
      dateAssignation: string;
      groupes: Array<{ groupeId: string; groupeNom: string; page: number | null }>;
    }>;
  };

  if (!Array.isArray(jours) || jours.length === 0) {
    return NextResponse.json({ erreur: "jours[] requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Collecte des groupeIds à résoudre
  const groupeIdsNeeded = new Set<string>();
  for (const jour of jours) {
    for (const g of jour.groupes) {
      if (g.page != null) groupeIdsNeeded.add(g.groupeId);
    }
  }

  if (groupeIdsNeeded.size === 0) {
    return NextResponse.json({ ok: true, nb: 0, message: "Aucun groupe avec une page renseignée." });
  }

  // Récupère les membres de ces groupes en une seule requête
  const { data: liaisons, error: liaisonsErr } = await admin
    .from("eleve_groupe")
    .select("groupe_id, planbox_eleve_id, repetibox_eleve_id")
    .in("groupe_id", Array.from(groupeIdsNeeded));

  if (liaisonsErr) return NextResponse.json({ erreur: liaisonsErr.message }, { status: 500 });

  // Index : groupeId → liste de membres
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

  for (const jour of jours) {
    for (const groupe of jour.groupes) {
      if (groupe.page == null) continue;

      const membres = membresByGroupe.get(groupe.groupeId) ?? [];
      for (const m of membres) {
        lignes.push({
          type: "fichier_maths",
          titre: `Fichier de maths — Page ${groupe.page}`,
          contenu: { numero_page: groupe.page, niveau: groupe.groupeNom },
          statut: "a_faire",
          date_assignation: jour.dateAssignation,
          date_limite: null,
          periodicite: "jour",
          groupe_label: groupe.groupeNom,
          eleve_id: m.planbox_eleve_id ?? null,
          repetibox_eleve_id: m.repetibox_eleve_id ?? null,
          chapitre_id: null,
        });
      }
    }
  }

  if (lignes.length === 0) {
    return NextResponse.json({
      ok: true, nb: 0,
      message: "Aucun élève trouvé dans les groupes renseignés.",
    });
  }

  const { error: insertErr } = await admin.from("plan_travail").insert(lignes);
  if (insertErr) return NextResponse.json({ erreur: insertErr.message }, { status: 500 });

  console.log(`[affecter-fichier-maths] ${lignes.length} blocs insérés`);
  return NextResponse.json({ ok: true, nb: lignes.length });
}

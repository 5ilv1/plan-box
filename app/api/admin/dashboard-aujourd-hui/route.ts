import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/admin/dashboard-aujourd-hui
 *
 * Retourne les données du tableau de bord enseignant pour aujourd'hui :
 * - blocs : entrées plan_travail du jour avec infos élèves
 * - elevesConnectesAujourdhui : nb d'élèves (PB + RB) connectés dans la journée
 */
export async function GET() {
  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const debutJour = `${today}T00:00:00.000Z`;

  const { data: ptData, error } = await admin
    .from("plan_travail")
    .select("id, type, titre, statut, date_assignation, date_limite, periodicite, eleve_id, repetibox_eleve_id, chapitre_id, groupe_label")
    .eq("date_assignation", today)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lignes = ptData ?? [];

  // Enrichir avec les noms des élèves
  const pbIds = [...new Set(lignes.map((l: any) => l.eleve_id).filter(Boolean))] as string[];
  const rbIds = [...new Set(lignes.map((l: any) => l.repetibox_eleve_id).filter((id: any) => id != null))] as number[];

  const [pbRes, rbRes] = await Promise.all([
    pbIds.length > 0
      ? admin.from("eleves").select("id, prenom, nom").in("id", pbIds)
      : Promise.resolve({ data: [] }),
    rbIds.length > 0
      ? admin.from("eleve").select("id, prenom, nom").in("id", rbIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pbMap = new Map<string, { prenom: string; nom: string }>();
  (pbRes.data ?? []).forEach((e: any) => pbMap.set(e.id, e));
  const rbMap = new Map<number, { prenom: string; nom: string }>();
  (rbRes.data ?? []).forEach((e: any) => rbMap.set(e.id, e));

  const blocsEnrichis = lignes.map((l: any) => ({
    ...l,
    eleve_prenom: l.eleve_id ? (pbMap.get(l.eleve_id)?.prenom ?? "—") : (rbMap.get(l.repetibox_eleve_id)?.prenom ?? "—"),
    eleve_nom:    l.eleve_id ? (pbMap.get(l.eleve_id)?.nom ?? "")    : (rbMap.get(l.repetibox_eleve_id)?.nom ?? ""),
  }));

  // Élèves connectés aujourd'hui (PB + RB)
  const [{ count: nbPb }, { count: nbRb }] = await Promise.all([
    admin.from("eleves").select("id", { count: "exact", head: true }).gte("derniere_connexion", debutJour),
    admin.from("eleves_planbox_meta").select("repetibox_eleve_id", { count: "exact", head: true }).gte("derniere_connexion", debutJour),
  ]);

  return NextResponse.json({
    blocs: blocsEnrichis,
    elevesConnectesAujourdhui: (nbPb ?? 0) + (nbRb ?? 0),
  });
}

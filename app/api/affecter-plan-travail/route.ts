import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * POST /api/affecter-plan-travail
 * Insère les lignes plan_travail pour chaque élève résolu.
 * Utilise le client admin pour bypasser les RLS.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { elevesResolus, titre, type, contenu, dateAssignation, dateLimite, periodicite, chapitreId, groupeLabel } = body;

  if (!elevesResolus || !titre || !type) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Vérifier les doublons
  const pbIds = elevesResolus.filter((e: any) => e.eleve_id).map((e: any) => e.eleve_id);
  const rbIds = elevesResolus.filter((e: any) => e.repetibox_eleve_id != null).map((e: any) => e.repetibox_eleve_id);

  const [{ data: dejaPb }, { data: dejaRb }] = await Promise.all([
    pbIds.length > 0
      ? admin.from("plan_travail").select("eleve_id")
          .in("eleve_id", pbIds).eq("titre", titre).eq("type", type).eq("date_assignation", dateAssignation)
      : Promise.resolve({ data: [] as { eleve_id: string }[] }),
    rbIds.length > 0
      ? admin.from("plan_travail").select("repetibox_eleve_id")
          .in("repetibox_eleve_id", rbIds).eq("titre", titre).eq("type", type).eq("date_assignation", dateAssignation)
      : Promise.resolve({ data: [] as { repetibox_eleve_id: number }[] }),
  ]);

  const dejaEleveIds = new Set((dejaPb ?? []).map((r: any) => r.eleve_id));
  const dejaRbIds = new Set((dejaRb ?? []).map((r: any) => r.repetibox_eleve_id));

  const aInserer = elevesResolus.filter((e: any) => {
    if (e.eleve_id) return !dejaEleveIds.has(e.eleve_id);
    if (e.repetibox_eleve_id != null) return !dejaRbIds.has(e.repetibox_eleve_id);
    return false;
  });

  if (aInserer.length === 0) {
    return NextResponse.json({ ok: true, nb: 0, message: "Tous les élèves ont déjà cet exercice." });
  }

  const lignes = aInserer.map((eleve: any) => ({
    eleve_id: eleve.eleve_id,
    repetibox_eleve_id: eleve.repetibox_eleve_id,
    titre,
    type,
    contenu,
    date_assignation: dateAssignation,
    date_limite: dateLimite || null,
    periodicite: periodicite ?? "jour",
    statut: "a_faire",
    chapitre_id: chapitreId || null,
    groupe_label: groupeLabel || null,
  }));

  const { error } = await admin.from("plan_travail").insert(lignes);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nb: aInserer.length });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/ecriture/textes-finaux
 *
 * Retourne les textes d'écriture de la semaine (mode semaine),
 * avec le texte final, le prénom, le nom et la classe de chaque élève.
 */
export async function GET() {
  const admin = createAdminClient();

  // Bornes de la semaine courante
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayStr = monday.toISOString().split("T")[0];
  const sundayStr = sunday.toISOString().split("T")[0];

  // Récupérer les blocs écriture mode semaine de cette semaine
  const { data: blocs } = await admin
    .from("plan_travail")
    .select("id, titre, contenu, statut, repetibox_eleve_id, eleve_id")
    .eq("type", "ecriture")
    .gte("date_assignation", mondayStr)
    .lte("date_assignation", sundayStr);

  if (!blocs || blocs.length === 0) {
    return NextResponse.json({ textes: [], sujet: null });
  }

  // Filtrer les blocs mode semaine
  const blocsSemaine = blocs.filter((b: any) => (b.contenu as any)?.mode === "semaine");
  if (blocsSemaine.length === 0) {
    return NextResponse.json({ textes: [], sujet: null });
  }

  const sujet = (blocsSemaine[0].contenu as any)?.sujet ?? "";
  const contrainte = (blocsSemaine[0].contenu as any)?.contrainte ?? "";

  // Enrichir avec noms et classes
  const rbIds = blocsSemaine.map((b: any) => b.repetibox_eleve_id).filter(Boolean) as number[];
  const pbIds = blocsSemaine.map((b: any) => b.eleve_id).filter(Boolean) as string[];

  // Élèves Repetibox : prenom, nom, classe
  let rbMap = new Map<number, { prenom: string; nom: string; classe: string }>();
  if (rbIds.length > 0) {
    const { data: eleves } = await admin
      .from("eleve")
      .select("id, prenom, nom, classe_id")
      .in("id", rbIds);

    const classeIds = [...new Set((eleves ?? []).map((e: any) => e.classe_id).filter(Boolean))];
    let classeMap = new Map<number, string>();
    if (classeIds.length > 0) {
      const { data: classes } = await admin.from("classe").select("id, nom").in("id", classeIds);
      classeMap = new Map((classes ?? []).map((c: any) => [c.id, c.nom]));
    }

    for (const e of eleves ?? []) {
      rbMap.set(e.id, {
        prenom: e.prenom,
        nom: e.nom ?? "",
        classe: classeMap.get(e.classe_id) ?? "",
      });
    }
  }

  // Élèves Plan Box
  let pbMap = new Map<string, { prenom: string; nom: string; classe: string }>();
  if (pbIds.length > 0) {
    const { data: eleves } = await admin
      .from("eleves")
      .select("id, prenom, nom, niveaux(nom)")
      .in("id", pbIds);

    for (const e of eleves ?? []) {
      pbMap.set(e.id, {
        prenom: e.prenom,
        nom: (e as any).nom ?? "",
        classe: (e as any).niveaux?.nom ?? "",
      });
    }
  }

  // Construire la réponse
  const textes = blocsSemaine.map((b: any) => {
    const contenu = b.contenu as any;
    const eleveInfo = b.repetibox_eleve_id
      ? rbMap.get(b.repetibox_eleve_id)
      : pbMap.get(b.eleve_id);

    return {
      id: b.id,
      prenom: eleveInfo?.prenom ?? "—",
      nom: eleveInfo?.nom ?? "",
      classe: eleveInfo?.classe ?? "",
      statut: b.statut,
      texteJour1: contenu?.texte_jour1 ?? "",
      texteJour2: contenu?.texte_jour2 ?? "",
      texteJour3: contenu?.texte_jour3 ?? "",
      texteFinal: contenu?.texte_final ?? "",
      nbErreursJour2: (contenu?.erreurs_jour2 as any[])?.length ?? 0,
      nbErreursJour3: (contenu?.erreurs_jour3 as any[])?.length ?? 0,
      nbErreursJour4: (contenu?.erreurs_jour4 as any[])?.length ?? 0,
    };
  }).sort((a: any, b: any) => a.prenom.localeCompare(b.prenom));

  return NextResponse.json({
    sujet,
    contrainte,
    semaine: `${monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — ${sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`,
    textes,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

// POST /api/affecter-exercice
// Body : { type, titre, contenu, chapitreId?, groupeIds?, eleveUids?, dateAssignation, dateLimite?, periodicite? }
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { type, titre, contenu, chapitreId, groupeIds, eleveUids, dateAssignation, dateLimite, periodicite } = body;

  if (!type || !titre || !dateAssignation) {
    return NextResponse.json({ erreur: "type, titre, dateAssignation requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Construire la liste des lignes à insérer
  const lignes: Record<string, unknown>[] = [];

  if (Array.isArray(groupeIds) && groupeIds.length > 0) {
    // Récupérer les groupes et leurs membres
    const [{ data: groupesData }, { data: liaisons }] = await Promise.all([
      admin.from("groupes").select("id, nom").in("id", groupeIds),
      admin.from("eleve_groupe").select("groupe_id, planbox_eleve_id, repetibox_eleve_id").in("groupe_id", groupeIds),
    ]);

    if (!groupesData || groupesData.length === 0) {
      return NextResponse.json({ erreur: "Groupes introuvables" }, { status: 404 });
    }

    const groupeNomMap = new Map((groupesData as { id: string; nom: string }[]).map((g) => [g.id, g.nom]));

    // Dédupliquer les élèves (un élève peut être dans plusieurs groupes sélectionnés)
    const elevesSeen = new Set<string>();

    for (const l of (liaisons ?? []) as { groupe_id: string; planbox_eleve_id: string | null; repetibox_eleve_id: number | null }[]) {
      const groupeNom = groupeNomMap.get(l.groupe_id) ?? "";
      const eleveKey = l.planbox_eleve_id ? `pb_${l.planbox_eleve_id}` : `rb_${l.repetibox_eleve_id}`;

      if (elevesSeen.has(eleveKey)) continue;
      elevesSeen.add(eleveKey);

      lignes.push({
        type, titre, contenu,
        chapitre_id: chapitreId ?? null,
        statut: "a_faire",
        date_assignation: dateAssignation,
        date_limite: dateLimite ?? null,
        periodicite: periodicite ?? "jour",
        groupe_label: groupeNom,
        eleve_id: l.planbox_eleve_id ?? null,
        repetibox_eleve_id: l.repetibox_eleve_id ?? null,
      });
    }
  } else if (Array.isArray(eleveUids) && eleveUids.length > 0) {
    for (const uid of eleveUids as string[]) {
      if (uid.startsWith("pb_")) {
        lignes.push({
          type, titre, contenu,
          chapitre_id: chapitreId ?? null,
          statut: "a_faire",
          date_assignation: dateAssignation,
          date_limite: dateLimite ?? null,
          periodicite: periodicite ?? "jour",
          groupe_label: null,
          eleve_id: uid.replace("pb_", ""),
          repetibox_eleve_id: null,
        });
      } else if (uid.startsWith("rb_")) {
        lignes.push({
          type, titre, contenu,
          chapitre_id: chapitreId ?? null,
          statut: "a_faire",
          date_assignation: dateAssignation,
          date_limite: dateLimite ?? null,
          periodicite: periodicite ?? "jour",
          groupe_label: null,
          eleve_id: null,
          repetibox_eleve_id: parseInt(uid.replace("rb_", ""), 10),
        });
      }
    }
  } else {
    return NextResponse.json({ erreur: "groupeIds ou eleveUids requis" }, { status: 400 });
  }

  if (lignes.length === 0) {
    return NextResponse.json({ erreur: "Aucun élève trouvé" }, { status: 400 });
  }

  // Réaffecter le même contenu à la même date ne doit pas échouer : c'est le
  // geste normal quand on régénère un QCM ou qu'on corrige une ressource. Les
  // index d'unicité (`plan_travail_rb_unique` / `_pb_unique`) sont PARTIELS,
  // et `upsert` ne sait pas viser un index partiel — on sépare donc à la main
  // ce qui existe déjà de ce qui est nouveau.
  const { data: existantes } = await admin
    .from("plan_travail")
    .select("id, eleve_id, repetibox_eleve_id")
    .eq("titre", titre)
    .eq("type", type)
    .eq("date_assignation", dateAssignation);

  const cleEleve = (eleveId: unknown, rbId: unknown) =>
    eleveId ? `pb_${eleveId}` : `rb_${rbId}`;

  const dejaLa = new Map(
    (existantes ?? []).map((r) => [cleEleve(r.eleve_id, r.repetibox_eleve_id), r.id as string]),
  );

  const aInserer: Record<string, unknown>[] = [];
  const aMettreAJour: { id: string; ligne: Record<string, unknown> }[] = [];

  for (const l of lignes) {
    const id = dejaLa.get(cleEleve(l.eleve_id, l.repetibox_eleve_id));
    if (id) aMettreAJour.push({ id, ligne: l });
    else aInserer.push(l);
  }

  if (aInserer.length > 0) {
    const { error } = await admin.from("plan_travail").insert(aInserer);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  // Le statut n'est jamais réécrit : un élève qui a déjà fait l'activité ne la
  // retrouve pas « à faire » parce que l'enseignant a réaffecté.
  // Seul `groupe_label` varie d'une ligne à l'autre : on regroupe par lui pour
  // faire une requête par groupe plutôt qu'une par élève.
  const parGroupe = new Map<string, string[]>();
  for (const { id, ligne } of aMettreAJour) {
    const cle = String(ligne.groupe_label ?? "");
    const liste = parGroupe.get(cle) ?? [];
    liste.push(id);
    parGroupe.set(cle, liste);
  }

  for (const [groupeLabel, ids] of parGroupe) {
    const { error } = await admin
      .from("plan_travail")
      .update({
        contenu,
        chapitre_id: chapitreId ?? null,
        date_limite: dateLimite ?? null,
        periodicite: periodicite ?? "jour",
        groupe_label: groupeLabel || null,
      })
      .in("id", ids);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    nb: lignes.length,
    nbCrees: aInserer.length,
    nbMisAJour: aMettreAJour.length,
  });
}

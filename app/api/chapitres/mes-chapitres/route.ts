import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/chapitres/mes-chapitres?eleve_id=UUID ou ?rb_id=NUMBER
 * Retourne les chapitres assignés aux groupes de l'élève, avec progression.
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ error: "eleve_id ou rb_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Trouver les groupes de l'élève
  let query = admin.from("eleve_groupe").select("groupe_id");
  if (eleveId) query = query.eq("planbox_eleve_id", eleveId);
  else query = query.eq("repetibox_eleve_id", parseInt(rbId!, 10));

  const { data: groupes } = await query;
  if (!groupes?.length) {
    return NextResponse.json({ chapitres: [] });
  }

  const groupeIds = groupes.map((g) => g.groupe_id);

  // 2. Chapitres activés pour ces groupes
  const { data: assignations } = await admin
    .from("chapitre_assignation")
    .select("chapitre_id")
    .in("groupe_id", groupeIds)
    .eq("actif", true);

  // 2b. Livres choisis par l'élève dans la bibliothèque (auto-assignation)
  let choixQuery = admin.from("eleve_bibliotheque_choix").select("chapitre_id");
  if (eleveId) choixQuery = choixQuery.eq("eleve_id", eleveId);
  else choixQuery = choixQuery.eq("rb_eleve_id", parseInt(rbId!, 10));
  const { data: choixBiblio } = await choixQuery;

  const chapitreIds = [...new Set([
    ...(assignations ?? []).map((a) => a.chapitre_id),
    ...(choixBiblio ?? []).map((c) => c.chapitre_id),
  ])];

  if (!chapitreIds.length) {
    return NextResponse.json({ chapitres: [] });
  }

  // 3. Infos chapitres + nb exercices (filtrer par date_debut si définie)
  const today = new Date().toISOString().split("T")[0];
  const { data: chapitres } = await admin
    .from("chapitres")
    .select("id, titre, matiere, sous_matiere, seuil_evaluation, date_debut, niveaux(nom)")
    .in("id", chapitreIds)
    .or(`date_debut.is.null,date_debut.lte.${today}`);

  if (!chapitres?.length) {
    return NextResponse.json({ chapitres: [] });
  }

  // 4. Exercices par chapitre
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, chapitre_id, ordre")
    .in("chapitre_id", chapitreIds)
    .order("ordre");

  // 5. Résultats de l'élève
  let resQuery = admin.from("exercice_resultat").select("exercice_id, valide, score, total");
  if (eleveId) resQuery = resQuery.eq("eleve_id", eleveId);
  else resQuery = resQuery.eq("rb_eleve_id", parseInt(rbId!, 10));

  const { data: resultats } = await resQuery;

  // 6. Agréger
  const exercicesParChapitre = new Map<string, typeof exercices>();
  for (const ex of exercices ?? []) {
    const list = exercicesParChapitre.get(ex.chapitre_id) ?? [];
    list.push(ex);
    exercicesParChapitre.set(ex.chapitre_id, list);
  }

  const resultatsValides = new Set(
    (resultats ?? []).filter((r) => r.valide).map((r) => r.exercice_id)
  );

  const result = chapitres.map((ch) => {
    const exos = exercicesParChapitre.get(ch.id) ?? [];
    const nbExercices = exos.length;
    const nbValides = exos.filter((e) => resultatsValides.has(e.id)).length;
    const pourcentage = nbExercices > 0 ? Math.round((nbValides / nbExercices) * 100) : 0;

    // Déterminer l'exercice en cours (premier non validé)
    const exerciceEnCours = exos.find((e) => !resultatsValides.has(e.id));
    const tousValides = nbExercices > 0 && nbValides === nbExercices;

    return {
      id: ch.id,
      titre: ch.titre,
      matiere: ch.matiere,
      sous_matiere: ch.sous_matiere,
      niveau: (ch as Record<string, unknown>).niveaux,
      seuil_evaluation: ch.seuil_evaluation ?? 90,
      nbExercices,
      nbValides,
      pourcentage,
      tousValides,
      exerciceEnCoursId: exerciceEnCours?.id ?? null,
      exerciceEnCoursOrdre: exerciceEnCours?.ordre ?? null,
    };
  });

  return NextResponse.json({ chapitres: result });
}

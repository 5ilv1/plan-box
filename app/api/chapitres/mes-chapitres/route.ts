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
    // Les chapitres-ceintures ont leur propre parcours (/eleve/ceintures) :
    // sans ce filtre, les 9 ceintures apparaîtraient comme 9 chapitres ordinaires.
    .not("sous_matiere", "like", "ceinture-%")
    .or(`date_debut.is.null,date_debut.lte.${today}`);

  if (!chapitres?.length) {
    return NextResponse.json({ chapitres: [] });
  }

  // 4. Exercices par chapitre
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, chapitre_id, ordre, titre, type, nb_questions")
    .in("chapitre_id", chapitreIds)
    .order("ordre");

  // 5. Résultats de l'élève
  let resQuery = admin.from("exercice_resultat").select("exercice_id, valide, score, total, created_at");
  if (eleveId) resQuery = resQuery.eq("eleve_id", eleveId);
  else resQuery = resQuery.eq("rb_eleve_id", parseInt(rbId!, 10));

  const { data: resultats } = await resQuery;

  // Durée estimée par type d'exercice (en minutes)
  const DUREE_PAR_TYPE: Record<string, number> = {
    revision: 3,
    exercice: 5,
    texte_a_trous: 4,
    qcm: 4,
    ecriture_contrainte: 8,
    calcul_mental: 3,
    analyse_phrase: 6,
  };
  function estimerMinutes(type?: string | null, nbQuestions?: number | null): number {
    const base = DUREE_PAR_TYPE[type ?? ""] ?? 5;
    if (nbQuestions && nbQuestions > 0) {
      // ~30s par question, borné, sinon retombe sur la base par type
      return Math.max(base, Math.round((nbQuestions * 0.5) / 1) || base);
    }
    return base;
  }

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

  // Dernière activité par chapitre (max created_at des résultats)
  const exerciceVersChapitre = new Map<string, string>();
  for (const ex of exercices ?? []) exerciceVersChapitre.set(ex.id, ex.chapitre_id);
  const derniereActiviteParChapitre = new Map<string, string>();
  for (const r of resultats ?? []) {
    const chId = exerciceVersChapitre.get(r.exercice_id);
    if (!chId || !r.created_at) continue;
    const prev = derniereActiviteParChapitre.get(chId);
    if (!prev || r.created_at > prev) derniereActiviteParChapitre.set(chId, r.created_at);
  }

  // Série (streak) : nombre de jours consécutifs (finissant aujourd'hui ou hier)
  // avec au moins un résultat de parcours.
  const joursActifs = new Set(
    (resultats ?? [])
      .filter((r) => r.created_at)
      .map((r) => new Date(r.created_at!).toISOString().split("T")[0])
  );
  let serie = 0;
  {
    const curseur = new Date();
    // Tolérance : si rien aujourd'hui mais quelque chose hier, la série court depuis hier.
    const todayStr = curseur.toISOString().split("T")[0];
    if (!joursActifs.has(todayStr)) curseur.setDate(curseur.getDate() - 1);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const jour = curseur.toISOString().split("T")[0];
      if (joursActifs.has(jour)) {
        serie += 1;
        curseur.setDate(curseur.getDate() - 1);
      } else {
        break;
      }
    }
  }

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
      prochainExerciceTitre: exerciceEnCours?.titre ?? null,
      prochainExerciceType: exerciceEnCours?.type ?? null,
      prochainExerciceMinutes: exerciceEnCours
        ? estimerMinutes(exerciceEnCours.type, exerciceEnCours.nb_questions)
        : null,
      derniereActivite: derniereActiviteParChapitre.get(ch.id) ?? null,
    };
  });

  return NextResponse.json({ chapitres: result, serie });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { dureeLectureLisible } from "@/lib/duree-lecture";

/**
 * GET /api/bibliotheque?eleve_id=UUID ou ?rb_id=NUMBER
 * Retourne les livres disponibles dans la bibliothèque :
 *  - chapitres avec disponible_bibliotheque=true
 *  - filtrés par le niveau de l'élève (Planbox)
 *  - enrichis avec nb_exercices et flag dejaChoisi
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ error: "eleve_id ou rb_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Niveau de l'élève (Planbox uniquement)
  let niveauId: string | null = null;
  let niveauNom: string | null = null;
  if (eleveId) {
    const { data: el } = await admin
      .from("eleves")
      .select("niveau_id, niveaux(nom)")
      .eq("id", eleveId)
      .maybeSingle();
    niveauId = (el as { niveau_id?: string })?.niveau_id ?? null;
    niveauNom = (el as { niveaux?: { nom?: string } })?.niveaux?.nom ?? null;
  }

  // Chapitres disponibles
  const { data: chapitres, error } = await admin
    .from("chapitres")
    .select("id, titre, matiere, couverture_url, resume, auteur, niveau_id, niveaux_cibles, niveaux(nom)")
    .eq("disponible_bibliotheque", true)
    .eq("matiere", "lecture");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filtre par niveau :
  //  - si niveaux_cibles est défini et non vide → le nom du niveau élève doit y figurer
  //  - sinon fallback rétro-compat sur niveau_id (livre mono-niveau)
  //  - si l'élève n'a pas de niveau (Repetibox), on retourne tout
  const chapitresFiltres = (chapitres ?? []).filter((ch) => {
    if (!niveauId && !niveauNom) return true;
    const cibles = (ch as { niveaux_cibles?: string[] | null }).niveaux_cibles;
    if (cibles && cibles.length > 0) {
      return niveauNom ? cibles.includes(niveauNom) : false;
    }
    return niveauId ? ch.niveau_id === niveauId : true;
  });

  if (!chapitresFiltres.length) {
    return NextResponse.json({ livres: [] });
  }

  const chapIds = chapitresFiltres.map((c) => c.id);

  // Compte d'exercices par chapitre (hors évaluation finale)
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, chapitre_id, contenu")
    .in("chapitre_id", chapIds);

  const nbExosMap: Record<string, number> = {};
  // Mots du livre, pour en estimer le temps de lecture. L'évaluation finale est
  // exclue des deux comptes : ce sont des questions, pas le texte du livre.
  const nbMotsMap: Record<string, number> = {};

  for (const e of exercices ?? []) {
    const contenu = (e.contenu ?? {}) as Record<string, unknown>;
    if (contenu.est_evaluation_finale === true) continue;

    nbExosMap[e.chapitre_id] = (nbExosMap[e.chapitre_id] ?? 0) + 1;

    const texte = typeof contenu.texte === "string" ? contenu.texte : "";
    if (texte) {
      const mots = texte.split(/\s+/).filter(Boolean).length;
      nbMotsMap[e.chapitre_id] = (nbMotsMap[e.chapitre_id] ?? 0) + mots;
    }
  }

  // Livres déjà choisis par l'élève
  let choixQuery = admin.from("eleve_bibliotheque_choix").select("chapitre_id");
  if (eleveId) choixQuery = choixQuery.eq("eleve_id", eleveId);
  else choixQuery = choixQuery.eq("rb_eleve_id", parseInt(rbId!, 10));
  const { data: choix } = await choixQuery;
  const choisIds = new Set((choix ?? []).map((c) => c.chapitre_id));

  // Livres terminés (éval finale validée) : on les exclut de la liste à choisir.
  // Ils apparaîtront séparément dans la section "Mes livres lus".
  let evalQuery = admin.from("evaluation_resultat").select("chapitre_id, reussi");
  if (eleveId) evalQuery = evalQuery.eq("eleve_id", eleveId);
  else evalQuery = evalQuery.eq("rb_eleve_id", parseInt(rbId!, 10));
  const { data: evals } = await evalQuery;
  const termines = new Set(
    (evals ?? []).filter((e) => e.reussi).map((e) => e.chapitre_id)
  );

  const livres = chapitresFiltres
    .filter((ch) => !termines.has(ch.id))
    .map((ch) => ({
      id: ch.id,
      titre: ch.titre,
      auteur: (ch as Record<string, unknown>).auteur ?? null,
      resume: (ch as Record<string, unknown>).resume ?? null,
      couverture_url: (ch as Record<string, unknown>).couverture_url ?? null,
      niveau: (ch as Record<string, unknown>).niveaux,
      nb_chapitres: nbExosMap[ch.id] ?? 0,
      duree_lecture: dureeLectureLisible(nbMotsMap[ch.id] ?? 0),
      deja_choisi: choisIds.has(ch.id),
    }));

  return NextResponse.json({ livres });
}

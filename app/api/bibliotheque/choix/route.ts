import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * GET /api/bibliotheque/choix
 * Retourne tous les choix de livres par les élèves, enrichis avec
 * les infos du livre (titre, couverture) et de l'élève (prénom, nom).
 */
export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();

  const { data: choix, error } = await admin
    .from("eleve_bibliotheque_choix")
    .select("id, chapitre_id, eleve_id, rb_eleve_id, choisi_le")
    .order("choisi_le", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!choix?.length) {
    return NextResponse.json({ choix: [] });
  }

  const chapitreIds = [...new Set(choix.map((c) => c.chapitre_id))];
  const eleveIds = [...new Set(choix.map((c) => c.eleve_id).filter(Boolean))] as string[];
  const rbIds = [...new Set(choix.map((c) => c.rb_eleve_id).filter(Boolean))] as number[];

  const [chapRes, elevesRes, rbRes] = await Promise.all([
    admin.from("chapitres").select("id, titre, auteur, couverture_url").in("id", chapitreIds),
    eleveIds.length
      ? admin.from("eleves").select("id, prenom, nom, niveaux(nom)").in("id", eleveIds)
      : Promise.resolve({ data: [] }),
    rbIds.length
      ? admin.from("eleve").select("id, prenom, nom").in("id", rbIds)
      : Promise.resolve({ data: [] }),
  ]);

  const chapMap = new Map((chapRes.data ?? []).map((c) => [c.id, c]));
  const eleveMap = new Map(((elevesRes.data ?? []) as unknown[]).map((e) => [(e as { id: string }).id, e]));
  const rbMap = new Map(((rbRes.data ?? []) as unknown[]).map((e) => [(e as { id: number }).id, e]));

  // Récupérer les chapitres exercices + résultats pour calculer la progression
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, chapitre_id, contenu")
    .in("chapitre_id", chapitreIds);

  const nbExosParChap = new Map<string, number>();
  for (const ex of exercices ?? []) {
    const c = ex.contenu as { est_evaluation_finale?: boolean };
    if (c?.est_evaluation_finale) continue;
    nbExosParChap.set(ex.chapitre_id, (nbExosParChap.get(ex.chapitre_id) ?? 0) + 1);
  }

  const exerciceIds = (exercices ?? []).map((e) => e.id);
  const { data: resultats } = exerciceIds.length
    ? await admin
        .from("exercice_resultat")
        .select("exercice_id, eleve_id, rb_eleve_id, valide")
        .in("exercice_id", exerciceIds)
    : { data: [] };

  const exToChap = new Map((exercices ?? []).map((e) => [e.id, e.chapitre_id]));

  function nbValides(chapId: string, eleveId: string | null, rbId: number | null): number {
    let n = 0;
    for (const r of resultats ?? []) {
      if (!r.valide) continue;
      if (exToChap.get(r.exercice_id) !== chapId) continue;
      if (eleveId && r.eleve_id === eleveId) n++;
      else if (rbId !== null && r.rb_eleve_id === rbId) n++;
    }
    return n;
  }

  const result = choix.map((c) => {
    const chap = chapMap.get(c.chapitre_id);
    const eleve = c.eleve_id
      ? (eleveMap.get(c.eleve_id) as { prenom?: string; nom?: string; niveaux?: { nom?: string } } | undefined)
      : c.rb_eleve_id
        ? (rbMap.get(c.rb_eleve_id) as { prenom?: string; nom?: string } | undefined)
        : null;

    const nbExos = nbExosParChap.get(c.chapitre_id) ?? 0;
    const valides = nbValides(c.chapitre_id, c.eleve_id ?? null, c.rb_eleve_id ?? null);
    const pct = nbExos > 0 ? Math.round((valides / nbExos) * 100) : 0;

    return {
      id: c.id,
      choisi_le: c.choisi_le,
      source: c.eleve_id ? "planbox" : "repetibox",
      eleve: eleve
        ? {
            prenom: eleve.prenom ?? null,
            nom: eleve.nom ?? null,
            niveau: (eleve as { niveaux?: { nom?: string } }).niveaux?.nom ?? null,
          }
        : null,
      livre: chap
        ? {
            id: chap.id,
            titre: chap.titre,
            auteur: (chap as { auteur?: string }).auteur ?? null,
            couverture_url: (chap as { couverture_url?: string }).couverture_url ?? null,
          }
        : null,
      progression: { nbValides: valides, nbExos, pct },
    };
  });

  return NextResponse.json({ choix: result });
}

/**
 * DELETE /api/bibliotheque/choix?id=UUID
 * Désaffecte un livre d'un élève (utilisé par l'enseignant en cas d'erreur).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("eleve_bibliotheque_choix").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

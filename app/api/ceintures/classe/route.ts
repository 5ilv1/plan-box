import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { etatClasse } from "@/lib/ceintures-serveur";
import { COULEURS, DOMAINES } from "@/lib/ceintures-competences";

/**
 * GET /api/ceintures/classe?niveau=tous|CE2|CM1|CM2
 *
 * L'état de toute la classe sur les sept domaines : la couleur en cours de
 * chaque élève, ses ceintures validées, ses tests de départ passés.
 *
 * Réservé à l'enseignant. La liste d'élèves suit le même montage que
 * `/api/enseignant/classe/eleves-scores` : les deux sources coexistent, PlanBox
 * par `eleves.niveau_id` et Repetibox par `eleve_groupe → groupes.nom`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const niveau = req.nextUrl.searchParams.get("niveau") ?? "tous";
  const admin = createAdminClient();

  type Ligne = {
    uid: string; eleveId: string | null; rbEleveId: number | null;
    prenom: string; nom: string; niveau: string | null;
    source: "planbox" | "repetibox";
  };
  const eleves: Ligne[] = [];

  // ── Élèves PlanBox ────────────────────────────────────────────────────
  const { data: pb } = await admin.from("eleves").select("id, prenom, nom, niveaux(nom)");
  for (const e of pb ?? []) {
    const niv = (e as unknown as { niveaux?: { nom?: string } }).niveaux?.nom ?? null;
    if (niveau !== "tous" && niv !== niveau) continue;
    eleves.push({
      uid: `pb_${e.id}`,
      eleveId: e.id as string,
      rbEleveId: null,
      prenom: (e.prenom as string) ?? "",
      nom: (e.nom as string) ?? "",
      niveau: niv,
      source: "planbox",
    });
  }

  // ── Élèves Repetibox, dont le niveau vient du groupe ──────────────────
  const { data: groupes } = await admin
    .from("groupes").select("id, nom").in("nom", ["CE2", "CM1", "CM2"]);
  const nomDuGroupe = new Map((groupes ?? []).map((g) => [g.id as string, g.nom as string]));

  if (nomDuGroupe.size) {
    const { data: liens } = await admin
      .from("eleve_groupe")
      .select("repetibox_eleve_id, groupe_id")
      .in("groupe_id", [...nomDuGroupe.keys()]);

    const niveauParRb = new Map<number, string>();
    for (const l of liens ?? []) {
      const rb = l.repetibox_eleve_id as number | null;
      const niv = nomDuGroupe.get(l.groupe_id as string);
      if (rb != null && niv) niveauParRb.set(rb, niv);
    }

    if (niveauParRb.size) {
      const { data: rbEleves } = await admin
        .from("eleve").select("id, prenom, nom").in("id", [...niveauParRb.keys()]);

      for (const e of rbEleves ?? []) {
        const niv = niveauParRb.get(e.id as number) ?? null;
        if (niveau !== "tous" && niv !== niveau) continue;
        eleves.push({
          uid: `rb_${e.id}`,
          eleveId: null,
          rbEleveId: e.id as number,
          prenom: (e.prenom as string) ?? "",
          nom: (e.nom as string) ?? "",
          niveau: niv,
          source: "repetibox",
        });
      }
    }
  }

  eleves.sort((a, b) =>
    (a.niveau ?? "").localeCompare(b.niveau ?? "") ||
    a.prenom.localeCompare(b.prenom, "fr"));

  try {
    const lignes = await etatClasse(eleves);
    return NextResponse.json({
      eleves: lignes,
      domaines: DOMAINES.map((d) => ({
        code: d.code, nom: d.nom, slug: d.slug, matiere: d.matiere, icone: d.icone,
      })),
      couleurs: COULEURS,
    });
  } catch (e) {
    console.error("[ceintures/classe]", e);
    return NextResponse.json({ erreur: "Erreur de lecture" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";
import { etatCeintures, lireEleve } from "@/lib/ceintures-serveur";

/**
 * GET /api/ceintures/etat?eleve_id=UUID   ou  ?rb_eleve_id=NUMBER
 *  … &domaine=PHRA   (optionnel : un seul domaine)
 *
 * État de progression d'un élève sur les domaines de ceintures : couleur
 * courante, statut de chacune des 9 ceintures, avancement dans la ceinture
 * en cours, diagnostic passé ou non.
 *
 * Rien n'est écrit : la progression se dérive des évaluations réussies.
 */
export async function GET(req: NextRequest) {
  const eleve = lireEleve(req.nextUrl.searchParams);

  if (!eleve.eleveId && !eleve.rbEleveId) {
    return NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }

  const auth = await requireProprietaireOuEnseignant(eleve.eleveId, eleve.rbEleveId);
  if (!auth.ok) return auth.error;

  const domaine = req.nextUrl.searchParams.get("domaine") ?? undefined;

  try {
    const domaines = await etatCeintures(eleve, domaine);
    return NextResponse.json({ domaines });
  } catch (e) {
    console.error("[ceintures/etat]", e);
    return NextResponse.json({ erreur: "Erreur de lecture" }, { status: 500 });
  }
}

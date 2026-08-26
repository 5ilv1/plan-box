import { NextRequest, NextResponse } from "next/server";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";
import { appliquerRemediation, etatCeintures, type EleveRef } from "@/lib/ceintures-serveur";
import { domaineParCode } from "@/lib/ceintures-competences";

/**
 * POST /api/ceintures/entrer
 * Body : { domaine, idx?, eleve_id? | rb_eleve_id? }
 *
 * Point d'entrée dans une ceinture. Deux effets :
 *   • applique la remédiation en attente (bascule des items ratés à la dernière
 *     évaluation sur leur variante 2, et dévalidation de leurs résultats) ;
 *   • indique où aller : le diagnostic s'il n'a pas été passé, sinon la page
 *     chapitre existante, qui gère entraînement puis évaluation.
 *
 * On ne peut entrer que dans la ceinture courante.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const domaineCode = String(body.domaine ?? "").toUpperCase();
  const eleve: EleveRef = {
    eleveId: body.eleve_id ?? null,
    rbEleveId: body.rb_eleve_id != null ? Number(body.rb_eleve_id) : null,
  };

  if (!eleve.eleveId && !eleve.rbEleveId) {
    return NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }
  const domaine = domaineParCode(domaineCode);
  if (!domaine) {
    return NextResponse.json({ erreur: "domaine invalide" }, { status: 400 });
  }

  const auth = await requireProprietaireOuEnseignant(eleve.eleveId, eleve.rbEleveId);
  if (!auth.ok) return auth.error;

  const [etat] = await etatCeintures(eleve, domaineCode);
  if (!etat) {
    return NextResponse.json({ erreur: "Domaine non ouvert pour cet élève" }, { status: 403 });
  }

  if (etat.termine) {
    return NextResponse.json({ termine: true, destination: `/eleve/ceintures/${domaine.slug}` });
  }

  const ceinture = etat.ceintures[etat.courante];
  if (!ceinture?.chapitreId) {
    return NextResponse.json({ erreur: "Ceinture sans chapitre" }, { status: 500 });
  }

  // Une ceinture demandée qui n'est pas la courante : on renvoie vers l'échelle
  // plutôt que d'ouvrir une ceinture non débloquée.
  if (body.idx != null && Number(body.idx) !== etat.courante) {
    return NextResponse.json({
      erreur: "Ceinture non débloquée",
      destination: `/eleve/ceintures/${domaine.slug}`,
    }, { status: 403 });
  }

  const nbRemedies = await appliquerRemediation(eleve, ceinture.chapitreId);

  if (!ceinture.diagnosticFait) {
    return NextResponse.json({
      destination: `/eleve/ceintures/${domaine.slug}/${etat.courante}/diagnostic`,
      diagnostic: true,
      ceinture_idx: etat.courante,
      nb_remedies: nbRemedies,
    });
  }

  return NextResponse.json({
    destination: `/eleve/chapitre/${ceinture.chapitreId}`,
    diagnostic: false,
    ceinture_idx: etat.courante,
    chapitre_id: ceinture.chapitreId,
    nb_remedies: nbRemedies,
  });
}

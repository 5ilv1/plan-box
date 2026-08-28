import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { CEINTURES } from "@/lib/ceintures";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";

/**
 * POST /api/ceinture-resultat
 * Body: { eleve_id?, repetibox_eleve_id?, ceinture_index, mode, nb_correct, nb_total, temps_ms, reussi, details }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    eleve_id,
    repetibox_eleve_id,
    ceinture_index,
    mode,
    temps_ms,
    details,
    // nb_correct, nb_total et reussi sont volontairement ignorés : ils sont
    // recalculés plus bas à partir de `details`.
  } = body;

  if ((!eleve_id && !repetibox_eleve_id) || ceinture_index === undefined || !mode) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // On n'enregistre un résultat que pour soi-même (ou pour un élève quand on est
  // l'enseignant) : sinon n'importe quel élève connecté pouvait écrire dans le
  // dossier d'un camarade.
  const { error: refus } = await requireProprietaireOuEnseignant(
    eleve_id ?? null,
    repetibox_eleve_id ?? null,
  );
  if (refus) return refus;

  // Le score et la réussite sont recalculés à partir du détail des réponses :
  // le client les envoyait, donc un élève pouvait se décerner une ceinture en
  // postant reussi: true. Le détail reste fourni par le client — cette
  // vérification relève le niveau sans le rendre infalsifiable.
  if (!Array.isArray(details) || details.length === 0) {
    return NextResponse.json({ error: "details requis" }, { status: 400 });
  }
  const nbCorrectServeur = details.filter((d: { correct?: boolean }) => d?.correct === true).length;
  const nbTotalServeur = details.length;
  const reussiServeur =
    mode === "evaluation"
      ? nbCorrectServeur === nbTotalServeur
      : nbCorrectServeur / nbTotalServeur >= 0.9;

  const admin = createAdminClient();

  const { error } = await admin.from("ceinture_resultat").insert({
    eleve_id: eleve_id || null,
    repetibox_eleve_id: repetibox_eleve_id || null,
    ceinture_index,
    mode,
    nb_correct: nbCorrectServeur,
    nb_total: nbTotalServeur,
    temps_ms,
    reussi: reussiServeur,
    details,
  });

  if (error) {
    console.error("[ceinture-resultat] Erreur insert:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }

  // Si évaluation réussie, retourner la nouvelle ceinture
  let nouvelleCeinture: number | undefined;
  if (mode === "evaluation" && reussiServeur) {
    nouvelleCeinture = Math.min(ceinture_index + 1, CEINTURES.length - 1);
  }

  return NextResponse.json({
    ok: true,
    nouvelle_ceinture: nouvelleCeinture,
  });
}

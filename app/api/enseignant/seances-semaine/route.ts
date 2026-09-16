import { NextRequest, NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { chargerSeancesSemaine } from "@/lib/seances-notion";
import { traduireSeance, type SeanceTraduite } from "@/lib/seances-traduction";

/**
 * GET /api/enseignant/seances-semaine?lundi=YYYY-MM-DD
 *
 * Les séances de maths et de français de la semaine, traduites dans le
 * vocabulaire de PlanBox et **éclatées par niveau** : une séance de français
 * taguée CE2 + CM en donne trois, avec des difficultés différentes.
 *
 * L'écran s'en sert pour proposer une génération ; il ne l'impose jamais.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const lundi = req.nextUrl.searchParams.get("lundi");
  if (!lundi || !/^\d{4}-\d{2}-\d{2}$/.test(lundi)) {
    return NextResponse.json({ erreur: "Paramètre lundi (YYYY-MM-DD) requis" }, { status: 400 });
  }

  try {
    const brutes = await chargerSeancesSemaine(lundi);
    const lignes: SeanceTraduite[] = brutes.flatMap((s) => traduireSeance(s, lundi));

    // Du lundi au vendredi, et dans chaque journée du CE2 au CM2 : l'ordre de
    // lecture de l'enseignant.
    lignes.sort((a, b) =>
      a.jour - b.jour ||
      a.matiere.localeCompare(b.matiere, "fr") ||
      a.niveau.localeCompare(b.niveau, "fr")
    );

    return NextResponse.json({
      lundi,
      lignes,
      // De quoi expliquer un écran vide : « rien cette semaine » n'est pas
      // « rien qui nous concerne ».
      nbSeancesLues: brutes.length,
    });
  } catch (e) {
    const message = (e as Error).message;
    console.error("[GET /api/enseignant/seances-semaine]", message);
    // 503 plutôt que 500 : la panne est chez Notion ou dans la configuration,
    // pas dans PlanBox. L'écran invite à planifier à la main.
    return NextResponse.json({ erreur: message }, { status: 503 });
  }
}

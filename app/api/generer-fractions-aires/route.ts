import { NextRequest, NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import {
  genererQuestionsFractions,
  DENOMINATEURS_PAR_NIVEAU,
  type FormeFraction,
} from "@/lib/fractions-aires";

/**
 * QCM « lire une fraction sur un dessin ».
 *
 * Aucun appel à l'IA : tout est calculé (voir `lib/fractions-aires.ts`). La
 * route reste réservée à l'enseignant parce qu'elle sert à poser des blocs,
 * pas parce qu'elle coûte quelque chose.
 */
export async function POST(req: NextRequest) {
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const body = await req.json();
    const {
      niveau = "CM1",
      formes = ["cercle", "rectangle"],
      dispersees = false,
      sens = "lire",
      nbQuestions = 10,
      titre = "",
    } = body;

    const formesValides = (Array.isArray(formes) ? formes : []).filter(
      (f): f is FormeFraction => f === "cercle" || f === "rectangle",
    );
    if (!formesValides.length) {
      return NextResponse.json(
        { erreur: "Choisis au moins une forme : le disque ou le rectangle." },
        { status: 400 },
      );
    }

    const questions = genererQuestionsFractions({
      nb: parseInt(String(nbQuestions), 10) || 10,
      formes: formesValides,
      denominateurs: DENOMINATEURS_PAR_NIVEAU[niveau] ?? DENOMINATEURS_PAR_NIVEAU.CM1,
      dispersees: !!dispersees,
      sens: sens === "reconnaitre" || sens === "les_deux" ? sens : "lire",
    });

    return NextResponse.json({
      resultat: {
        titre:
          titre?.trim() ||
          (sens === "reconnaitre"
            ? "Reconnaître une fraction sur un dessin"
            : "Lire une fraction sur un dessin"),
        questions,
      },
    });
  } catch (err: unknown) {
    console.error("[generer-fractions-aires]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

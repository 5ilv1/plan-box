import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { niveauEleveDepuisBloc } from "@/lib/ecriture-niveau-eleve";
import { getServerUser } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { analyserTexte } from "@/lib/ecriture-analyse";

/**
 * POST /api/ecriture/analyser
 *
 * Analyse le texte de l'élève et retourne la liste des erreurs détectées.
 *
 * Body : {
 *   texte: string,
 *   sujet?: string,
 *   blocId?: string,                // pour récupérer le niveau de l'élève
 *   erreurs_precedentes?: Erreur[], // rétro-compat
 *   jour?: number                   // rétro-compat (ignoré dans le nouveau flux)
 * }
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });
  }
  const limited = rateLimit(req, { key: "ecriture-analyser", max: 30, windowSec: 60, identifier: user.id });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  const texte = body.texte as string;
  const sujet = body.sujet as string | undefined;
  const blocId = body.blocId as string | undefined;
  const erreurs_precedentes = body.erreurs_precedentes as Array<{ mot: string; type: string; indice?: string; correction?: string }> | undefined;

  if (!texte?.trim()) {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  // Récupérer le niveau de l'élève (CE2 / CM1 / CM2) si on a le bloc
  let niveau: "CE2" | "CM1" | "CM2" = "CM1";
  if (blocId) {
    try {
      niveau = await niveauEleveDepuisBloc(createAdminClient(), blocId);
    } catch {}
  }

  const resultat = await analyserTexte({
    texte,
    sujet,
    niveau,
    erreursPrecedentes: erreurs_precedentes,
    anthropic: new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY }),
    admin: createAdminClient(),
  });

  // ⚠️ Jamais `{ erreurs: [] }` sur une panne : le composant l'afficherait
  // comme « Bravo ! Je n'ai trouvé aucune erreur ».
  if ("echec" in resultat) {
    return NextResponse.json({ erreur: resultat.echec }, { status: 502 });
  }
  return NextResponse.json(resultat);
}

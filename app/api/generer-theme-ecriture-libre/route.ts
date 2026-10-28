/**
 * Génère un thème d'écriture à la volée, SANS stocker dans themes_ecriture.
 * Utilisé par la page de planification (nouvelle-semaine) pour éviter tout
 * conflit avec le widget du dashboard enseignant.
 *
 * POST { mode: "jour" | "semaine" }
 * → { sujet, contrainte }
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { ecrireSujet } from "@/lib/theme-ecriture";
import { requireEnseignant } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const body = await req.json().catch(() => ({}));
    const mode: "jour" | "semaine" = body?.mode === "semaine" ? "semaine" : "jour";

    const supabase = createAdminClient();
    // Rien n'est enregistré : « Autre » repose la même question à l'historique,
    // et c'est le tirage parmi les moins récents qui donne un autre sujet.
    const { sujet, contrainte } = await ecrireSujet(supabase, anthropic, mode);

    return NextResponse.json({ sujet, contrainte });
  } catch (err) {
    console.error("[generer-theme-ecriture-libre]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

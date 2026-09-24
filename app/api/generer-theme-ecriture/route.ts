/**
 * SQL migration (NE PAS EXÉCUTER ICI — à lancer manuellement dans Supabase) :
 *
 * CREATE TABLE IF NOT EXISTS themes_ecriture (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   date        DATE NOT NULL DEFAULT CURRENT_DATE,
 *   sujet       TEXT NOT NULL,
 *   contrainte  TEXT NOT NULL,
 *   type_ecriture TEXT,
 *   affecte     BOOLEAN NOT NULL DEFAULT false,
 *   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 *
 * ALTER TABLE themes_ecriture ADD COLUMN IF NOT EXISTS type_ecriture TEXT;
 *
 * CREATE INDEX IF NOT EXISTS themes_ecriture_date_idx ON themes_ecriture (date DESC);
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { genererOuRecupererTheme } from "@/lib/theme-ecriture";
import { requireEnseignant, requireEnseignantOrCron } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function GET(req: NextRequest) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const mode = req.nextUrl.searchParams.get("mode") as "jour" | "semaine" | null;
    return NextResponse.json(
      await genererOuRecupererTheme(createAdminClient(), anthropic, false, mode ?? undefined),
    );
  } catch (err) {
    console.error("[generer-theme-ecriture GET]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Enseignant, ou cron signé par CRON_SECRET : /api/cron/theme-ecriture-jour
  // rappelle cette route pour générer le thème du jour.
  const { error: refus } = await requireEnseignantOrCron(req);
  if (refus) return refus;

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const mode = body?.mode as "jour" | "semaine" | undefined;
    return NextResponse.json(await genererOuRecupererTheme(createAdminClient(), anthropic, force, mode));
  } catch (err) {
    console.error("[generer-theme-ecriture POST]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

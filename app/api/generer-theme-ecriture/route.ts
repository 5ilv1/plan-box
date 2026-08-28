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
import { TYPES_JOUR, TYPES_SEMAINE, buildSystemPrompt } from "@/lib/ecriture-types";
import { requireEnseignant } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

async function genererOuRecupererTheme(force: boolean, modeForce?: "jour" | "semaine") {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Si pas de force : vérifier d'abord si un thème "semaine" est actif cette semaine
  if (!force) {
    // Chercher un thème mode "semaine" de la semaine courante (lundi → dimanche)
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const mondayStr = monday.toISOString().split("T")[0];
    const sundayDate = new Date(monday);
    sundayDate.setDate(monday.getDate() + 6);
    const sundayStr = sundayDate.toISOString().split("T")[0];

    const { data: themeSemaine } = await supabase
      .from("themes_ecriture")
      .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
      .eq("mode", "semaine")
      .gte("date", mondayStr)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (themeSemaine) {
      return NextResponse.json(themeSemaine);
    }

    // Sinon chercher un thème du jour
    const { data: existant } = await supabase
      .from("themes_ecriture")
      .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
      .eq("date", today)
      .maybeSingle();

    if (existant) {
      return NextResponse.json(existant);
    }

    // Fallback : vérifier si des blocs écriture ont été planifiés (via Nouvelle semaine)
    // D'abord chercher des blocs semaine cette semaine
    const { data: blocPlanifie } = await supabase
      .from("plan_travail")
      .select("id, contenu, periodicite")
      .eq("type", "ecriture")
      .gte("date_assignation", mondayStr)
      .lte("date_assignation", sundayStr)
      .limit(1)
      .maybeSingle();

    if (blocPlanifie && blocPlanifie.contenu) {
      const c = blocPlanifie.contenu as Record<string, unknown>;
      const modePlanifie = (c.mode as string) ?? (blocPlanifie.periodicite === "semaine" ? "semaine" : "jour");
      return NextResponse.json({
        id: null,
        sujet: c.sujet ?? "",
        contrainte: (c.contrainte as string ?? "").replace(/ · Au moins \d+ lignes$/, "").trim(),
        affecte: true,
        afficher_contrainte: c.afficher_contrainte ?? true,
        mode: modePlanifie,
        planifie: true,
      });
    }
  } else {
    // force: true → supprimer l'existant pour pouvoir réinsérer
    await supabase.from("themes_ecriture").delete().eq("date", today);
  }

  // Déterminer le mode à utiliser
  const mode = modeForce ?? "jour";
  const typesListe = mode === "semaine" ? TYPES_SEMAINE : TYPES_JOUR;

  // Compter le total + récupérer les 50 derniers (sujet + type)
  const [{ count }, { data: derniers }] = await Promise.all([
    supabase.from("themes_ecriture").select("*", { count: "exact", head: true }),
    supabase
      .from("themes_ecriture")
      .select("sujet, type_ecriture")
      .order("date", { ascending: false })
      .limit(50),
  ]);

  // Type imposé par rotation déterministe sur la liste du mode
  const total = count ?? 0;
  const typeImpose = typesListe[total % typesListe.length];

  // Types utilisés récemment (pour contexte)
  const derniersTypes = (derniers ?? [])
    .slice(0, 6)
    .map((t: { type_ecriture: string | null }) => t.type_ecriture)
    .filter(Boolean)
    .join(", ");

  const listeSujets = (derniers ?? [])
    .map((t: { sujet: string }) => `- ${t.sujet}`)
    .join("\n");

  const systemPrompt = buildSystemPrompt(mode, typeImpose, derniersTypes, listeSujets);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [{ role: "user", content: "Génère un nouveau sujet d'écriture." }],
    system: systemPrompt,
  });

  const texte = message.content[0].type === "text" ? message.content[0].text : "";
  const texteNettoye = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(texteNettoye) as { sujet: string; contrainte: string };

  const { data: inserted, error } = await supabase
    .from("themes_ecriture")
    .insert({
      date: today,
      sujet: parsed.sujet,
      contrainte: parsed.contrainte,
      type_ecriture: typeImpose,
      afficher_contrainte: true,
      affecte: false,
      mode,
    })
    .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
    .single();

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json(inserted);
}

export async function GET(req: NextRequest) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const mode = req.nextUrl.searchParams.get("mode") as "jour" | "semaine" | null;
    return await genererOuRecupererTheme(false, mode ?? undefined);
  } catch (err) {
    console.error("[generer-theme-ecriture GET]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const mode = body?.mode as "jour" | "semaine" | undefined;
    return await genererOuRecupererTheme(force, mode);
  } catch (err) {
    console.error("[generer-theme-ecriture POST]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

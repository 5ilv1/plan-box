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
import { TYPES_JOUR, TYPES_SEMAINE, buildSystemPrompt } from "@/lib/ecriture-types";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode: "jour" | "semaine" = body?.mode === "semaine" ? "semaine" : "jour";

    const supabase = createAdminClient();
    const typesListe = mode === "semaine" ? TYPES_SEMAINE : TYPES_JOUR;

    // Récupérer le contexte (derniers thèmes) pour éviter les doublons
    const [{ count }, { data: derniers }] = await Promise.all([
      supabase.from("themes_ecriture").select("*", { count: "exact", head: true }),
      supabase
        .from("themes_ecriture")
        .select("sujet, type_ecriture")
        .order("date", { ascending: false })
        .limit(50),
    ]);

    const total = count ?? 0;
    // Décaler l'index pour ne pas tomber sur le même type que le widget
    const typeImpose = typesListe[(total + 3) % typesListe.length];

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
      system: systemPrompt,
      messages: [{ role: "user", content: "Génère un nouveau sujet d'écriture." }],
    });

    const texte = message.content[0].type === "text" ? message.content[0].text : "";
    const texteNettoye = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(texteNettoye) as { sujet: string; contrainte: string };

    return NextResponse.json({ sujet: parsed.sujet, contrainte: parsed.contrainte });
  } catch (err) {
    console.error("[generer-theme-ecriture-libre]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

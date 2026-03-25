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

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// Option A : rotation déterministe sur 10 types
const TYPES_ECRITURE = [
  "récit à la 1re personne",
  "lettre",
  "description détaillée",
  "point de vue d'un objet ou d'un animal",
  "dialogue à inventer",
  "texte d'opinion argumenté",
  "suite de récit",
  "texte humoristique",
  "récit à la 3e personne",
  "texte imaginaire ou fantastique léger",
];

async function genererOuRecupererTheme(force: boolean) {
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
  } else {
    // force: true → supprimer l'existant pour pouvoir réinsérer
    await supabase.from("themes_ecriture").delete().eq("date", today);
  }

  // Option A + B : compter le total + récupérer les 50 derniers (sujet + type)
  const [{ count }, { data: derniers }] = await Promise.all([
    supabase.from("themes_ecriture").select("*", { count: "exact", head: true }),
    supabase
      .from("themes_ecriture")
      .select("sujet, type_ecriture")
      .order("date", { ascending: false })
      .limit(50),
  ]);

  // Option A : type imposé par rotation déterministe
  const total = count ?? 0;
  const typeImpose = TYPES_ECRITURE[total % TYPES_ECRITURE.length];

  // Option B : types utilisés récemment (pour contexte)
  const derniersTypes = (derniers ?? [])
    .slice(0, 6)
    .map((t: { type_ecriture: string | null }) => t.type_ecriture)
    .filter(Boolean)
    .join(", ");

  const listeSujets = (derniers ?? [])
    .map((t: { sujet: string }) => `- ${t.sujet}`)
    .join("\n");

  const systemPrompt = `Tu génères des sujets d'écriture créative variés pour des élèves de CE2/CM1/CM2 (7-11 ans) dans une école primaire française.

▶ TYPE D'ÉCRITURE IMPOSÉ : « ${typeImpose} »
Tu DOIS générer un sujet de CE type exact. Aucun autre type n'est accepté.
${derniersTypes ? `Types utilisés récemment (déjà vus, ne pas répéter) : ${derniersTypes}` : ""}

Sujets déjà utilisés — NE PAS reproduire ces thèmes ni des thèmes similaires :
${listeSujets || "(aucun)"}

RÈGLES STRICTES SUR LA LANGUE :
- Soigne ABSOLUMENT les accords en genre et en nombre : "ta grand-mère" (féminin), "ton grand-père" (masculin), "tes parents", etc. Aucune faute d'accord n'est tolérée.
- Langue française irréprochable : pas de fautes d'orthographe, de conjugaison ni de syntaxe.

RÈGLES STRICTES SUR LA FORME :
- INTERDIT de commencer par "Tu découvres", "Tu te réveilles", "Tu trouves", "Imagine que", "Si tu"
- Varier les structures : impératif ("Raconte...", "Décris...", "Écris..."), question ("Quel est le meilleur moment..."), situation directe ("Un matin, le facteur apporte un colis énorme..."), dialogue ("Ton meilleur ami te dit que...")

RÈGLES STRICTES SUR LE FOND :
- Thèmes : quotidien de l'école, famille, sport, nature, animaux réels, métiers, souvenirs, inventions, voyages, émotions
- ÉVITER : mondes magiques avec portes secrètes, pouvoirs surnaturels, trésors cachés, formules magiques
- Le sujet doit partir d'une situation concrète et réaliste ou légèrement décalée

Génère UN nouveau sujet d'écriture avec :
- Un sujet : 1 ou 2 phrases maximum. Plante le décor en 1 phrase (adapté au type « ${typeImpose} »), puis termine OBLIGATOIREMENT par une question courte ou une invitation directe à écrire.
- Une contrainte stylistique ou narrative concrète adaptée au type « ${typeImpose} » (sans mentionner le nombre de lignes)

Réponds UNIQUEMENT en JSON sans backticks :
{"sujet": "...", "contrainte": "..."}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
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
    })
    .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
    .single();

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json(inserted);
}

export async function GET() {
  try {
    return await genererOuRecupererTheme(false);
  } catch (err) {
    console.error("[generer-theme-ecriture GET]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    return await genererOuRecupererTheme(force);
  } catch (err) {
    console.error("[generer-theme-ecriture POST]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

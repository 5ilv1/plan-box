import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

/**
 * POST /api/chapitres/generer-lecon
 * Génère une mini-leçon de révision par IA.
 * Body: { chapitre_id, titre, contexte? }
 * Retourne: { titre, contenu: { texte, points_cles } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chapitre_id, titre, contexte } = body;

    if (!chapitre_id || !titre) {
      return NextResponse.json({ error: "chapitre_id et titre requis" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Lire les infos du chapitre
    const { data: chapitre, error: errCh } = await admin
      .from("chapitres")
      .select("titre, matiere, sous_matiere, niveau_id, niveaux(nom)")
      .eq("id", chapitre_id)
      .single();

    if (errCh || !chapitre) {
      return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
    }

    // Lire les exercices existants pour contextualiser la leçon
    const { data: exosExistants } = await admin
      .from("exercice")
      .select("titre, type")
      .eq("chapitre_id", chapitre_id)
      .order("ordre");

    const niveauNom = (chapitre as any).niveaux?.nom ?? "CM1-CM2";
    const exercicesListe = exosExistants && exosExistants.length > 0
      ? `\n\nExercices du chapitre (pour adapter la leçon) :\n${exosExistants.map((e: any) => `- ${e.titre} (${e.type})`).join("\n")}`
      : "";

    const prompt = `Tu es un enseignant de ${chapitre.matiere} en école primaire française, niveau ${niveauNom}.
Tu prépares une mini-leçon de révision pour le chapitre "${chapitre.titre}"${chapitre.sous_matiere ? ` (${chapitre.sous_matiere})` : ""}.

Sujet de la leçon : ${titre}
${contexte ? `Instructions supplémentaires : ${contexte}` : ""}${exercicesListe}

Génère une leçon claire et concise pour un enfant de 8-11 ans.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "titre": "Titre clair de la leçon",
  "texte": "Le contenu de la leçon en HTML simple (utilise <h3>, <p>, <strong>, <em>, <ul>, <li>, <br>). La leçon doit faire entre 150 et 400 mots. Utilise des exemples concrets. Structure bien avec des paragraphes courts.",
  "points_cles": [
    "Point clé 1 à retenir",
    "Point clé 2 à retenir",
    "Point clé 3 à retenir"
  ]
}

Règles :
- Langage simple et bienveillant, adapté à des enfants de 8-11 ans
- Pas de jargon technique non expliqué
- Des exemples concrets et colorés
- Maximum 5 points clés, minimum 2
- Le HTML doit être simple : pas de classes, pas de styles inline, pas de scripts
- Les points clés sont des phrases courtes et mémorisables (type "À retenir")
- Commence directement par le contenu, pas par "Bonjour" ou une introduction sociale`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    const json = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const contenu = JSON.parse(json);
    const titreGenere = contenu.titre || titre;

    return NextResponse.json({ titre: titreGenere, contenu });
  } catch (err) {
    console.error("[generer-lecon]", err);
    return NextResponse.json({ error: "Erreur lors de la génération de la leçon" }, { status: 500 });
  }
}

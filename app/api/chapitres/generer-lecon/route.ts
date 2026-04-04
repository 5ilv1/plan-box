import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

/**
 * POST /api/chapitres/generer-lecon
 * Génère une mini-leçon de révision structurée par IA.
 * Body: { chapitre_id, titre, contexte? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chapitre_id, titre, contexte } = body;

    if (!chapitre_id || !titre) {
      return NextResponse.json({ error: "chapitre_id et titre requis" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: chapitre, error: errCh } = await admin
      .from("chapitres")
      .select("titre, matiere, sous_matiere, niveau_id, niveaux(nom)")
      .eq("id", chapitre_id)
      .single();

    if (errCh || !chapitre) {
      return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
    }

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

Génère une leçon structurée, claire et visuellement riche pour un enfant de 8-11 ans.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "titre": "Titre clair et engageant de la leçon",
  "introduction": "1-2 phrases d'accroche qui expliquent pourquoi cette notion est importante (max 50 mots)",
  "contenu_html": "Le corps de la leçon en HTML simple (<h3>, <p>, <strong>, <em>, <ul>, <li>). Bien structuré en sections courtes avec des sous-titres. 150-300 mots.",
  "regle_or": "LA règle essentielle à retenir, formulée simplement en une phrase (la plus importante de la leçon)",
  "astuce": "Un conseil pratique ou un moyen mnémotechnique pour ne pas se tromper (1-2 phrases)",
  "exemples": [
    {
      "titre": "Titre de l'exemple (ex: Conjugaison du verbe Jouer)",
      "colonnes": ["Colonne 1", "Colonne 2", "Colonne 3"],
      "lignes": [
        ["Cellule 1", "Cellule 2", "Cellule 3"]
      ]
    }
  ],
  "points_cles": [
    "Point clé 1 à retenir",
    "Point clé 2 à retenir",
    "Point clé 3 à retenir"
  ]
}

Règles :
- Langage simple et bienveillant, adapté à des enfants de 8-11 ans
- Pas de jargon technique non expliqué
- Le HTML de contenu_html doit être simple : pas de classes, pas de styles, pas de scripts
- "regle_or" : UNE seule phrase, la plus importante (comme "La Règle d'Or")
- "astuce" : un truc pratique pour aider l'élève (comme "Astuce Pro")
- "exemples" : un tableau structuré avec au moins 3 lignes. Si pas pertinent, tableau vide []
- "points_cles" : 2 à 4 phrases courtes et mémorisables
- Commence directement par le contenu, pas de "Bonjour" ou formule sociale`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
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

    // Rétro-compatibilité : s'assurer que "texte" existe (pour l'ancien format)
    if (!contenu.texte && contenu.contenu_html) {
      contenu.texte = contenu.contenu_html;
    }

    return NextResponse.json({ titre: titreGenere, contenu });
  } catch (err) {
    console.error("[generer-lecon]", err);
    return NextResponse.json({ error: "Erreur lors de la génération de la leçon" }, { status: 500 });
  }
}

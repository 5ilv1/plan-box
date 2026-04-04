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

Génère une FICHE DE RÉVISION courte et visuelle pour un enfant de 8-11 ans.
L'objectif est un rappel rapide, pas un cours complet. PRIORITÉ AU VISUEL : tableaux, règle encadrée, exemples concrets. Minimum de texte.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "titre": "Titre court et clair",
  "introduction": "UNE seule phrase qui pose le sujet (max 20 mots)",
  "contenu_html": "COURT : 50-100 mots MAX en HTML simple (<h3>, <p>, <strong>, <em>, <ul>, <li>). Juste l'explication essentielle, pas de développement. Une seule section avec un sous-titre.",
  "regle_or": "LA règle fondamentale en une phrase claire et mémorisable",
  "astuce": "Un truc pratique ou mnémotechnique (1 phrase)",
  "exemples": [
    {
      "titre": "Titre du tableau (ex: Conjugaison du verbe Jouer au futur)",
      "colonnes": ["Colonne 1", "Colonne 2", "Colonne 3"],
      "lignes": [
        ["Cellule 1", "Cellule 2", "Cellule 3"]
      ]
    }
  ],
  "points_cles": [
    "Point clé 1",
    "Point clé 2",
    "Point clé 3"
  ]
}

Règles STRICTES :
- CONCISION : le contenu_html doit faire 50-100 mots, PAS PLUS. C'est une fiche, pas un cours
- TABLEAUX OBLIGATOIRES : génère TOUJOURS au moins un tableau d'exemples concrets (conjugaison, calculs, conversions, exemples comparatifs...). 4 à 8 lignes par tableau
- Pour les maths : tableau avec Opération / Calcul / Résultat. Pour le français : Pronom / Forme conjuguée / Règle appliquée. Adapter selon le sujet
- "regle_or" : formulation directe type "Pour former le futur, on prend l'infinitif + les terminaisons -ai, -as, -a, -ons, -ez, -ont"
- "astuce" : un vrai truc pratique, pas une reformulation de la règle
- "points_cles" : 2 à 3 phrases ultra-courtes
- Langage simple, adapté 8-11 ans
- Pas de "Bonjour", pas de bavardage, droit au but`;

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

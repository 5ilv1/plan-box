import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { REGLE_NOMBRES_EN_LETTRES } from "@/lib/prompts-communs";

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
  "grille": {
    "titre": "Titre de la grille (ex: Les terminaisons du futur)",
    "items": [
      { "etiquette": "-ai", "texte": "Je / J'" },
      { "etiquette": "-as", "texte": "Tu" }
    ]
  },
  "regle_or": "LA règle fondamentale en une phrase claire et mémorisable",
  "exemples": [
    {
      "titre": "Titre du tableau (ex: Conjugaison du verbe Jouer au futur)",
      "colonnes": ["Colonne 1", "Colonne 2", "Colonne 3"],
      "lignes": [
        ["Cellule 1", "Cellule 2", "Cellule 3"]
      ]
    }
  ],
  "astuce": "Un truc pratique ou mnémotechnique (1 phrase)",
  "points_cles": [
    "Point clé 1",
    "Point clé 2",
    "Point clé 3"
  ]
}

Règles STRICTES :
- PAS de contenu_html. Toute l'information passe par grille + regle_or + exemples + points_cles
- GRILLE OBLIGATOIRE : génère TOUJOURS une grille de badges visuels résumant l'essentiel (terminaisons, formules, catégories, opérations…). 4 à 8 items par grille. Chaque item a une "etiquette" courte (le mot-clé, la terminaison, le symbole) et un "texte" (l'explication courte)
  - Français : etiquette = terminaison/suffixe, texte = pronom ou cas d'usage
  - Maths : etiquette = symbole/formule courte, texte = signification
  - Sciences/Histoire/Géo : etiquette = mot-clé, texte = définition très courte
- TABLEAUX OBLIGATOIRES : génère TOUJOURS au moins un tableau d'exemples concrets. 4 à 8 lignes par tableau
  - Français : Pronom / Forme conjuguée / Structure. Maths : Opération / Calcul / Résultat. Adapter selon le sujet
- "regle_or" : formulation directe type "Pour former le futur, on prend l'infinitif + les terminaisons -ai, -as, -a, -ons, -ez, -ont"
- "astuce" : un vrai truc pratique, pas une reformulation de la règle
- "points_cles" : 2 à 3 phrases ultra-courtes
- "introduction" : UNE seule phrase, max 20 mots
- Langage simple, adapté 8-11 ans
- Pas de "Bonjour", pas de bavardage, droit au but`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: REGLE_NOMBRES_EN_LETTRES,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    const json = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const contenu = JSON.parse(json);
    console.log("[GL] keys=" + Object.keys(contenu).join(","));
    console.log("[GL] grille=" + (contenu.grille ? contenu.grille.items?.length + " items" : "NONE"));
    console.log("[GL] exemples=" + (contenu.exemples ? contenu.exemples.length + " tables" : "NONE"));
    console.log("[GL] regle_or=" + (contenu.regle_or ? "YES" : "NONE"));
    console.log("[GL] intro=" + (contenu.introduction ? "YES" : "NONE"));
    console.log("[GL] astuce=" + (contenu.astuce ? "YES" : "NONE"));
    console.log("[GL] pts=" + (contenu.points_cles ? contenu.points_cles.length : "NONE"));
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

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";

const client = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export async function POST(req: NextRequest) {
  try {
    const { chapitreId, chapitreTitre, niveauNom } = await req.json();

    if (!chapitreId && !chapitreTitre) {
      return NextResponse.json({ erreur: "chapitreId ou chapitreTitre requis" }, { status: 400 });
    }

    // Récupère les paramètres du chapitre (seuil, nb questions)
    let nbQuestions = 20;
    let titre = chapitreTitre ?? "Chapitre";
    let niveau = niveauNom ?? "CM2";

    if (chapitreId) {
      const admin = createAdminClient();
      const { data: chapitre } = await admin
        .from("chapitres")
        .select("titre, nb_cartes_eval, seuil_reussite, niveaux(nom)")
        .eq("id", chapitreId)
        .single();

      if (chapitre) {
        if (chapitre.titre) titre = chapitre.titre;
        if (chapitre.nb_cartes_eval) nbQuestions = chapitre.nb_cartes_eval;
        if (!niveauNom && (chapitre as any).niveaux?.nom) niveau = (chapitre as any).niveaux.nom;
      }
    }

    const prompt = `Tu es un assistant pédagogique pour une école primaire française.
Tu génères une évaluation finale sur le chapitre "${titre}" pour un élève de ${niveau}.
Cette évaluation vérifie la maîtrise complète du chapitre.
Nombre de questions : ${nbQuestions}.
Difficulté : progressive (de facile à difficile).

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "titre": "Évaluation — ${titre}",
  "consigne": "Réponds à toutes les questions pour valider le chapitre.",
  "questions": [
    {
      "id": 1,
      "enonce": "Texte de la question",
      "reponse_attendue": "La réponse correcte",
      "indice": "Un indice optionnel si besoin"
    }
  ]
}

Règles :
- Questions qui couvrent l'ensemble du chapitre (tous les sous-thèmes)
- Langage simple, adapté à des enfants de 8-11 ans
- Pas de violence, pas de sujets sensibles
- Réponses courtes et vérifiables
- Questions progressives en difficulté`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const texte = message.content[0].type === "text" ? message.content[0].text : "";
    const json = texte
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const resultat = JSON.parse(json);
    return NextResponse.json({ resultat });
  } catch (err) {
    console.error("[generer-eval] Erreur:", err);
    return NextResponse.json(
      { erreur: "Échec de la génération de l'évaluation." },
      { status: 500 }
    );
  }
}

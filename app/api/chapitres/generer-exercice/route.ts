import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { validerReponsesExercice } from "@/lib/valider-reponses-exercice";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

type ExerciceType = "exercice" | "calcul_mental" | "texte_a_trous" | "analyse_phrase" | "qcm" | "classement" | "ecriture_contrainte";

function getFormatPourType(type: ExerciceType): string {
  switch (type) {
    case "exercice":
      return `{
  "titre": "Titre court de l'exercice",
  "consigne": "La consigne générale",
  "questions": [
    {
      "id": 1,
      "enonce": "Texte de la question",
      "reponse_attendue": "La réponse correcte",
      "indice": "Un indice optionnel"
    }
  ]
}`;
    case "calcul_mental":
      return `{
  "calculs": [
    { "id": 1, "enonce": "7 × 8 =", "reponse": "56" }
  ]
}`;
    case "texte_a_trous":
      return `{
  "titre": "Titre court",
  "consigne": "Complète le texte avec les mots manquants",
  "texte_complet": "Le texte intégral avec tous les mots (au moins 5 phrases). C'est UN SEUL texte continu.",
  "trous": [
    { "position": 0, "mot": "premier mot à deviner", "indice": "Un indice" },
    { "position": 1, "mot": "deuxième mot à deviner", "indice": "Un autre indice" }
  ]
}
IMPORTANT: le tableau "trous" doit contenir exactement le nombre d'items demandé. C'est UN SEUL objet JSON, pas un tableau.`;
    case "qcm":
      return `{
  "titre": "Titre court",
  "consigne": "Choisis la bonne réponse",
  "questions": [
    {
      "question": "La question posée",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "reponse_correcte": 0,
      "explication": "Explication de la bonne réponse"
    }
  ]
}`;
    case "classement":
      return `{
  "titre": "Titre court",
  "consigne": "Classe chaque élément dans la bonne catégorie",
  "categories": ["Catégorie 1", "Catégorie 2"],
  "items": [
    { "texte": "Élément à classer", "categorie": "Catégorie 1" }
  ]
}`;
    case "analyse_phrase":
      return `{
  "titre": "Titre court",
  "consigne": "Identifie les groupes dans chaque phrase",
  "phrases": [
    {
      "texte": "Le chat mange la souris.",
      "groupes": [
        { "mots": "Le chat", "fonction": "sujet", "debut": 0, "fin": 7 },
        { "mots": "mange", "fonction": "verbe", "debut": 8, "fin": 13 },
        { "mots": "la souris", "fonction": "COD", "debut": 14, "fin": 23 }
      ]
    }
  ]
}`;
    case "ecriture_contrainte":
      return `{
  "titre": "Titre court et motivant",
  "consigne": "La consigne d'écriture complète et précise pour l'élève",
  "nb_phrases": 3,
  "contraintes": [
    "Contrainte 1 que l'IA vérifiera (ex: utiliser le futur de l'indicatif)",
    "Contrainte 2 (ex: utiliser des verbes du premier groupe)"
  ],
  "exemple": "Une phrase d'exemple respectant les contraintes (pour aider l'élève)"
}`;
  }
}

function getRegles(type: ExerciceType): string {
  const base = `- Langage simple, adapté à des enfants de 8-11 ans
- Pas de violence, pas de sujets sensibles
- Questions progressives en difficulté`;

  switch (type) {
    case "calcul_mental":
      return `${base}
- Calculs réalistes pour le niveau
- Résultats entiers uniquement
- Varier les structures (ex. "3 × ? = 21" parfois)`;
    case "texte_a_trous":
      return `${base}
- Génère UN SEUL texte d'au moins 8 phrases avec exactement le nombre de trous demandé
- Le nombre d'items = le nombre de trous dans le texte unique (PAS le nombre de textes)
- Le texte doit être cohérent, fluide et intéressant comme une petite histoire
- CRITIQUE : chaque "mot" dans "trous" DOIT être un copier-coller exact d'un mot présent dans "texte_complet"
- Avant de répondre, relis ton texte et vérifie que chaque mot du tableau "trous" se retrouve bien dans "texte_complet". Corrige toute incohérence.
- Utilise uniquement des verbes courants du 1er groupe si le sujet porte sur le 1er groupe (manger, jouer, danser, chanter, regarder, marcher, etc.). Évite les verbes pièges comme "escalader" dont la conjugaison est souvent mal formée.
- Pour la conjugaison, l'indice est UNIQUEMENT le verbe à l'infinitif (ex: "manger", "être", "aller"). JAMAIS de personne, sujet ou temps. Pour les autres objectifs, l'indice est une aide courte.
- Les trous doivent être répartis dans tout le texte, pas concentrés au début`;
    case "qcm":
      return `${base}
- Exactement 4 options par question
- Les mauvaises réponses doivent être plausibles
- reponse_correcte est l'index (0-3) de la bonne option`;
    case "classement":
      return `${base}
- 2 à 4 catégories
- Répartir les items équitablement entre les catégories
- Chaque item ne peut appartenir qu'à une seule catégorie`;
    case "analyse_phrase":
      return `${base}
- Phrases simples et claires
- Les positions debut/fin correspondent aux index de caractères dans la phrase
- Fonctions grammaticales adaptées au niveau (sujet, verbe, COD, COI, CC...)`;
    case "ecriture_contrainte":
      return `${base}
- La consigne doit être claire, motivante et adaptée au niveau
- nb_phrases : nombre de phrases que l'élève doit écrire (2 à 5)
- Les contraintes doivent être précises et vérifiables par une IA (temps verbal, type de verbes, vocabulaire, etc.)
- L'exemple doit être une phrase simple qui respecte toutes les contraintes
- Ne pas donner trop de contraintes à la fois (2 à 3 max)`;
    default:
      return `${base}
- Réponses courtes et vérifiables`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chapitre_id, type, contexte, nb_questions } = body;

    if (!chapitre_id || !type || !nb_questions) {
      return NextResponse.json({ error: "chapitre_id, type et nb_questions requis" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Lire les infos du chapitre
    const { data: chapitre, error: errCh } = await admin
      .from("chapitres")
      .select("titre, matiere, sous_matiere, niveau_id, niveaux(nom)")
      .eq("id", chapitre_id)
      .single();

    if (errCh || !chapitre) {
      console.error("[generer-exercice] chapitre:", errCh);
      return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
    }

    // Lire les exercices existants pour éviter les répétitions
    const { data: exosExistants } = await admin
      .from("exercice")
      .select("titre, type, contenu")
      .eq("chapitre_id", chapitre_id);

    const niveauNom = (chapitre as any).niveaux?.nom ?? "CM1-CM2";
    const existantsResume = exosExistants && exosExistants.length > 0
      ? `\n\nExercices déjà créés pour ce chapitre (à ne pas répéter) :\n${exosExistants.map((e: any) => `- ${e.titre} (${e.type})`).join("\n")}`
      : "";

    const format = getFormatPourType(type as ExerciceType);
    const regles = getRegles(type as ExerciceType);

    // Thèmes variés pour diversifier les textes générés
    const THEMES = [
      "une sortie scolaire au musée", "une journée à la ferme", "une compétition sportive",
      "la préparation d'un spectacle de fin d'année", "une enquête de détective à l'école",
      "un voyage en train vers la mer", "une journée de marché avec les grands-parents",
      "la construction d'une cabane dans le jardin", "une aventure dans la forêt",
      "un anniversaire surprise", "une journée de neige à la montagne",
      "un projet de jardinage à l'école", "une visite chez un artisan boulanger",
      "un camping en famille", "une course de vélo dans le village",
      "la découverte d'un trésor dans le grenier", "une journée à la piscine municipale",
      "un concours de cuisine entre amis", "la rentrée dans une nouvelle école",
      "une excursion en bateau sur la rivière", "un atelier de peinture en plein air",
      "une nuit à la belle étoile", "la récolte des pommes à l'automne",
      "un spectacle de cirque", "une promenade au bord de la plage",
    ];
    const themeAleatoire = THEMES[Math.floor(Math.random() * THEMES.length)];

    const prompt = `Tu es un assistant pédagogique pour une école primaire française.
Tu génères des exercices de type "${type}" adaptés au niveau ${niveauNom}.
Matière : ${chapitre.matiere}${chapitre.sous_matiere ? ` — ${chapitre.sous_matiere}` : ""}.
Chapitre : ${chapitre.titre}.
Nombre d'items à générer : ${type === "ecriture_contrainte" ? 1 : nb_questions}.
${contexte ? `Thème / contexte souhaité : ${contexte}` : ""}
Thème imposé pour le texte/les questions : ${themeAleatoire}.${existantsResume}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
${format}

Règles :
${regles}`;

    const message = await anthropic.messages.create({
      model: (type === "texte_a_trous" || type === "ecriture_contrainte") ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    // Nettoyage des balises markdown éventuelles
    const json = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let contenu = JSON.parse(json);

    // Si l'IA a retourné un tableau au lieu d'un objet (ex: ecriture_contrainte), prendre le premier
    if (Array.isArray(contenu)) {
      contenu = contenu[0];
    }

    // ── Correction des positions pour texte_a_trous ─────────────────────────
    if (type === "texte_a_trous" && contenu.texte_complet && Array.isArray(contenu.trous)) {
      const mots = (contenu.texte_complet as string).split(/\s+/);
      const trousFixed: { position: number; mot: string; indice?: string }[] = [];
      for (const trou of contenu.trous as { position: number; mot: string; indice?: string }[]) {
        // Chercher la vraie position du mot dans le texte
        const motSansPonctuation = trou.mot.replace(/[.,;:!?'"()]/g, "");
        let found = false;
        const positionsPrises = new Set<number>(trousFixed.map((t) => t.position));
        for (let i = 0; i < mots.length; i++) {
          if (positionsPrises.has(i)) continue;
          const motTexte = mots[i].replace(/[.,;:!?'"()]/g, "");
          if (motTexte === motSansPonctuation || motTexte === trou.mot) {
            trousFixed.push({ ...trou, position: i, mot: mots[i] });
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(`[generer-exercice] trou "${trou.mot}" introuvable dans texte_complet`);
        }
      }
      contenu.trous = trousFixed;
    }

    // Valider et corriger les réponses (orthographe, conjugaison)
    contenu = await validerReponsesExercice(contenu, type, anthropic);

    // Extraire le titre depuis le contenu généré ou en créer un
    const titre = contenu.titre || `${type} — ${chapitre.titre}`;

    return NextResponse.json({ titre, contenu });
  } catch (err) {
    console.error("[generer-exercice]", err);
    return NextResponse.json({ error: "Erreur lors de la génération" }, { status: 500 });
  }
}

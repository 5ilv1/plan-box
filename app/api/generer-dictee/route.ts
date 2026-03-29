import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ParamsDictee } from "@/types";

export const maxDuration = 120; // 2 minutes — génération 3 jours × 4 niveaux peut être longue

function buildPrompt(p: ParamsDictee): string {
  const diffParNiv = p.difficulteParNiveau ?? { 1: "standard", 2: "standard", 3: "exigeant", 4: "exigeant" };

  function descNiveau(diff: string, etoiles: number, prevEtoiles: number | null): string {
    const nbPhrases   = etoiles === 1 ? 3 : etoiles + 2;
    const nbMots      = [10, 13, 15, 17][etoiles - 1];
    const nbMotsSuppl = etoiles === 1 ? "" : ` (reprend les ${[10,13,15][etoiles-2]} mots ⭐${"⭐".repeat(etoiles-2)} + ${[3,2,2][etoiles-2]} mots nouveaux)`;
    const phrasesPrev = prevEtoiles !== null ? ` (reprend les ${prevEtoiles + 2} phrases ⭐${"⭐".repeat(prevEtoiles - 1)} MOT POUR MOT + 1 phrase nouvelle)` : "";
    const maxMots     = diff === "standard" ? 80 : diff === "exigeant" ? 100 : 120;

    const qualites: Record<string, string[]> = {
      standard: [
        "Phrase simple (sujet + verbe + complément), vocabulaire courant.",
        "Phrase simple avec un complément de lieu ou de temps.",
        "Phrase légèrement développée.",
        "Phrase avec une coordination (et, mais, ou…).",
      ],
      exigeant: [
        "Phrases avec compléments circonstanciels, vocabulaire varié.",
        "Phrase avec une proposition relative ou une coordination.",
        "Phrase avec une subordonnée (quand, parce que, bien que…).",
        "Phrase avec syntaxe élaborée, vocabulaire riche et précis.",
      ],
      expert: [
        "Phrases avec subordonnées ou propositions participiales, vocabulaire riche.",
        "Phrase longue avec inversions, appositions ou relatives enchâssées.",
        "Phrase très travaillée, vocabulaire soutenu, plusieurs difficultés orthographiques.",
        "Phrase de niveau collège, style littéraire, vocabulaire recherché.",
      ],
    };

    const qualite  = (qualites[diff] ?? qualites.standard)[etoiles - 1];
    const nomNiv   = ["CE2", "CM1", "CM2", "CM2 renforcé"][etoiles - 1];
    const etoilesStr = "⭐".repeat(etoiles);
    return `    - ${etoilesStr} ${nomNiv} : ${nbPhrases} phrases${phrasesPrev}, ${nbMots} mots${nbMotsSuppl}. ${qualite} Maximum ${maxMots} mots.`;
  }

  const contraintes = [
    descNiveau(diffParNiv[1], 1, null),
    descNiveau(diffParNiv[2], 2, 1),
    descNiveau(diffParNiv[3], 3, 2),
    descNiveau(diffParNiv[4], 4, 3),
  ].join("\n");

  return `Tu es un professeur des écoles expert en France, spécialisé en français primaire (CE2/CM1/CM2).
Génère 3 dictées d'entraînement différenciées (Mardi, Jeudi, Vendredi) sur le thème : ${p.theme}.
Temps verbaux : ${p.tempsVerbaux.join(", ")}.
Points grammaticaux : ${p.pointsGrammaticaux.join(", ")}.
Difficultés : ⭐ ${diffParNiv[1]} | ⭐⭐ ${diffParNiv[2]} | ⭐⭐⭐ ${diffParNiv[3]} | ⭐⭐⭐⭐ ${diffParNiv[4]}.

═══ RÈGLE N°1 — SCÈNES RADICALEMENT DIFFÉRENTES ═══
Les 3 jours doivent chacun décrire une SCÈNE ENTIÈREMENT DIFFÉRENTE :
- Moments différents (matin / après-midi / soir, ou 3 étapes distinctes du thème)
- Lieux différents (pas deux fois la même pièce, le même endroit, le même décor)
- Personnages et actions différents
- Champ lexical différent (pas les mêmes substantifs ni les mêmes verbes d'action)
❌ INTERDIT : changer seulement un nom propre, un adjectif ou un objet (ex: "mer bleue" → "rivière bleue" = REFUSÉ)
❌ INTERDIT : reprendre le même type d'action dans 2 jours (ex: "manger au restaurant" → "dîner au café" = REFUSÉ)
Commence par planifier mentalement 3 scènes vraiment distinctes avant d'écrire quoi que ce soit.

═══ RÈGLE N°2 — EMBOÎTEMENT AU SEIN DE CHAQUE JOUR ═══
À l'intérieur d'UN même jour, les phrases du niveau ⭐ doivent être présentes MOT POUR MOT dans les niveaux supérieurs.
Les phrases ⭐⭐ doivent être présentes MOT POUR MOT dans ⭐⭐⭐ et ⭐⭐⭐⭐.
Les phrases ⭐⭐⭐ doivent être présentes MOT POUR MOT dans ⭐⭐⭐⭐.
La difficulté croît UNIQUEMENT par ajout de phrases, jamais par modification.

═══ RÈGLE N°3 — MOTS À APPRENDRE ═══
Les mots à apprendre sont COMMUNS aux 3 jours (même vocabulaire travaillé toute la semaine).
Choisis des mots présents dans TOUS les jours et mets la même liste dans les 3 jours.
Types autorisés : noms, adjectifs, adverbes, verbes conjugués.

RÈGLES IMPÉRATIVES sur le format des mots :
• Verbe conjugué → OBLIGATOIRE : champ "pronom" + le mot est écrit tel que dans la phrase (ex: "a visité", "brillaient"). L'élève verra "elle a visité". JAMAIS de verbe sans pronom.
• Nom ou adjectif → TOUJOURS AU SINGULIER, même s'il apparaît au pluriel dans la dictée (ex: "curieux" → écrire "curieux", "marchés animés" → écrire "marché" et "animé" séparément).
• Adverbe → tel quel, sans pronom.
Exemples corrects :
  { "mot": "a visité", "definition": "Verbe visiter au passé composé, 3e personne du singulier", "pronom": "elle" }
  { "mot": "brillaient", "definition": "Verbe briller à l'imparfait, 3e personne du pluriel", "pronom": "elles" }
  { "mot": "marché", "definition": "Lieu où l'on achète et vend des marchandises" }
  { "mot": "animé", "definition": "Plein de vie et de mouvement" }
  { "mot": "lentement", "definition": "De façon lente, sans se presser" }

Contraintes par niveau (s'appliquent à chaque jour) :
${contraintes}

Au moins 2 groupes nominaux avec accord adjectif/déterminant par jour et par niveau.
Le champ "texte" contient toutes les phrases du niveau séparées par des espaces.

IMPORTANT — Pour réduire la taille du JSON :
- N'inclus PAS le champ "texte" (il sera reconstruit depuis les phrases).
- Les "mots" sont COMMUNS aux 3 jours : définis-les UNE SEULE FOIS dans "mots_communs", pas dans chaque jour.
- Utilise des définitions courtes (5 mots max).

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format :
{
  "titre": "Titre commun aux 3 jours",
  "mots_communs": {
    "1": [
      { "mot": "a visité", "definition": "Verbe visiter, passé composé, 3e sg.", "pronom": "elle" },
      { "mot": "marché", "definition": "Lieu d'achat et de vente" }
    ],
    "2": [...mots niveau 2 (inclut les mots du niveau 1)...],
    "3": [...mots niveau 3...],
    "4": [...mots niveau 4...]
  },
  "jours": [
    {
      "scene": "Scène du Mardi (3-5 mots)",
      "niveaux": [
        {
          "etoiles": 1,
          "phrases": [
            { "id": 1, "texte": "Phrase 1." },
            { "id": 2, "texte": "Phrase 2." },
            { "id": 3, "texte": "Phrase 3." }
          ],
          "points_travailles": ["accord sujet-verbe", "passé composé"]
        },
        { "etoiles": 2, "phrases": [...], "points_travailles": [...] },
        { "etoiles": 3, "phrases": [...], "points_travailles": [...] },
        { "etoiles": 4, "phrases": [...], "points_travailles": [...] }
      ]
    },
    { "scene": "Scène du Jeudi", "niveaux": [...] },
    { "scene": "Scène du Vendredi", "niveaux": [...] }
  ]
}`;
}

export async function POST(req: NextRequest) {
  try {
    const params: ParamsDictee = await req.json();

    if (!params.theme) {
      return NextResponse.json({ erreur: "Le thème est requis." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const prompt = buildPrompt(params);

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const texte = message.content[0].type === "text" ? message.content[0].text : "";
    const json = texte
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const resultat = JSON.parse(json);

    // Post-traitement : injecter mots_communs + reconstruire texte dans chaque niveau
    const motsCom = resultat.mots_communs ?? {};
    const labelsNiveau: Record<number, string> = { 1: "CE2", 2: "CM1", 3: "CM2", 4: "CM2 renforcé" };
    for (const jour of resultat.jours ?? []) {
      for (const niv of jour.niveaux ?? []) {
        // Injecter les mots communs
        niv.mots = motsCom[String(niv.etoiles)] ?? motsCom[niv.etoiles] ?? [];
        // Reconstruire texte depuis les phrases
        if (Array.isArray(niv.phrases)) {
          niv.texte = niv.phrases.map((ph: { texte: string }) => ph.texte).join(" ");
        }
        // Ajouter le label si absent
        if (!niv.label) niv.label = labelsNiveau[niv.etoiles] ?? `Niveau ${niv.etoiles}`;
      }
    }

    return NextResponse.json({ resultat });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erreur génération dictée:", msg);
    return NextResponse.json({ erreur: `Échec de la génération : ${msg}` }, { status: 500 });
  }
}

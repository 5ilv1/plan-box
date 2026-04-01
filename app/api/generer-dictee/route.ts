import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ParamsDictee } from "@/types";

export const maxDuration = 120; // 2 minutes — génération 3 jours × 4 niveaux peut être longue

function buildPrompt(p: ParamsDictee): string {
  const diffParNiv = p.difficulteParNiveau ?? { 1: "standard", 2: "standard", 3: "exigeant", 4: "exigeant" };
  const nbDictees = p.nbDictees ?? 3;

  // Nombre de mots proportionnel au nombre de dictées
  // Base pour 3 dictées : [10, 13, 15, 17]
  // Facteur : nbDictees / 3, arrondi, minimum raisonnable
  const facteur = nbDictees / 3;
  const nbMotsBase = [10, 13, 15, 17].map((n) => Math.max(4, Math.round(n * facteur)));

  function descNiveau(diff: string, etoiles: number, prevEtoiles: number | null): string {
    const nbPhrases   = etoiles === 1 ? 3 : etoiles + 2;
    const nbMots      = nbMotsBase[etoiles - 1];
    const prevMots    = etoiles > 1 ? nbMotsBase[etoiles - 2] : 0;
    const nbNouveaux  = nbMots - prevMots;
    const nbMotsSuppl = etoiles === 1 ? "" : ` (reprend les ${prevMots} mots ⭐${"⭐".repeat(etoiles-2)} + ${nbNouveaux} mots nouveaux)`;
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

  const tempsParNiv = p.tempsVerbauxParNiveau;
  const tempsSection = tempsParNiv
    ? `Temps verbaux PAR NIVEAU (chaque niveau utilise ses propres temps) :
  - ⭐ CE2 : ${tempsParNiv[1]?.join(", ") || "présent"}
  - ⭐⭐ CM1 : ${tempsParNiv[2]?.join(", ") || "présent"}
  - ⭐⭐⭐ CM2 : ${tempsParNiv[3]?.join(", ") || "présent"}
  - ⭐⭐⭐⭐ CM2+ : ${tempsParNiv[4]?.join(", ") || "présent"}
IMPORTANT : Les phrases du niveau ⭐ peuvent utiliser un temps différent des niveaux supérieurs. Les phrases emboîtées qui sont reprises d'un niveau inférieur gardent leur temps d'origine.`
    : `Temps verbaux : ${p.tempsVerbaux.join(", ")}.`;

  const joursLabels = ["Mardi", "Jeudi", "Vendredi", "Samedi"].slice(0, nbDictees);
  const joursDesc = joursLabels.join(", ");

  return `Tu es un professeur des écoles expert en France, spécialisé en français primaire (CE2/CM1/CM2).
Génère ${nbDictees} dictée${nbDictees > 1 ? "s" : ""} d'entraînement différenciée${nbDictees > 1 ? "s" : ""} (${joursDesc}) sur le thème : ${p.theme}.
${tempsSection}
Points grammaticaux : ${p.pointsGrammaticaux.join(", ")}.
Difficultés : ⭐ ${diffParNiv[1]} | ⭐⭐ ${diffParNiv[2]} | ⭐⭐⭐ ${diffParNiv[3]} | ⭐⭐⭐⭐ ${diffParNiv[4]}.

═══ RÈGLE N°1 — SCÈNES RADICALEMENT DIFFÉRENTES ═══
${nbDictees > 1 ? `Les ${nbDictees} jours doivent chacun décrire une SCÈNE ENTIÈREMENT DIFFÉRENTE :
- Moments différents (matin / après-midi / soir, ou ${nbDictees} étapes distinctes du thème)
- Lieux différents (pas deux fois la même pièce, le même endroit, le même décor)
- Personnages et actions différents
- Champ lexical différent (pas les mêmes substantifs ni les mêmes verbes d'action)
❌ INTERDIT : changer seulement un nom propre, un adjectif ou un objet (ex: "mer bleue" → "rivière bleue" = REFUSÉ)
❌ INTERDIT : reprendre le même type d'action dans 2 jours (ex: "manger au restaurant" → "dîner au café" = REFUSÉ)
Commence par planifier mentalement ${nbDictees} scènes vraiment distinctes avant d'écrire quoi que ce soit.` : `La dictée doit décrire une scène vivante et cohérente sur le thème.`}

═══ RÈGLE N°2 — EMBOÎTEMENT AU SEIN DE CHAQUE JOUR ═══
À l'intérieur d'UN même jour, les phrases du niveau ⭐ doivent être présentes MOT POUR MOT dans les niveaux supérieurs.
Les phrases ⭐⭐ doivent être présentes MOT POUR MOT dans ⭐⭐⭐ et ⭐⭐⭐⭐.
Les phrases ⭐⭐⭐ doivent être présentes MOT POUR MOT dans ⭐⭐⭐⭐.
La difficulté croît UNIQUEMENT par ajout de phrases, jamais par modification.

═══ RÈGLE N°3 — MOTS À APPRENDRE ═══
Les mots à apprendre sont COMMUNS aux ${nbDictees > 1 ? `${nbDictees} jours (même vocabulaire travaillé toute la semaine)` : "la dictée"}.
${nbDictees > 1 ? `Choisis des mots présents dans TOUS les jours et mets la même liste dans les ${nbDictees} jours.` : "Choisis des mots présents dans la dictée."}
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
- Les "mots" sont COMMUNS à ${nbDictees > 1 ? `tous les ${nbDictees} jours` : "la dictée"} : définis-les UNE SEULE FOIS dans "mots_communs", pas dans chaque jour.
- Utilise des définitions courtes (5 mots max).

RÈGLE SUR LES VERBES DANS mots_communs :
Si le mot est un verbe, écris-le TOUJOURS À L'INFINITIF, jamais conjugué.
Exemples : "manger" (pas "a mangé"), "briller" (pas "brillaient"), "partir" (pas "sont partis").
La définition explique le sens du verbe : "Verbe manger : avaler des aliments".
Noms et adjectifs → au singulier. Adverbes → tels quels. Aucun champ "pronom" n'est nécessaire.

IMPORTANT : Génère EXACTEMENT ${nbDictees} jour${nbDictees > 1 ? "s" : ""} dans le tableau "jours", ni plus ni moins.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format :
{
  "titre": "Titre commun",
  "mots_communs": {
    "1": [${nbMotsBase[0]} mots niveau ⭐],
    "2": [${nbMotsBase[1]} mots niveau ⭐⭐ (inclut ceux de ⭐ + nouveaux)],
    "3": [${nbMotsBase[2]} mots niveau ⭐⭐⭐],
    "4": [${nbMotsBase[3]} mots niveau ⭐⭐⭐⭐]
  },
  "jours": [
${joursLabels.map((j) => `    { "scene": "Scène du ${j} (3-5 mots)", "niveaux": [{ "etoiles": 1, "phrases": [...], "points_travailles": [...] }, ...4 niveaux] }`).join(",\n")}
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
        // Injecter les mots communs (ne pas écraser si déjà présents et mots_communs absent)
        const motsCommuns = motsCom[String(niv.etoiles)] ?? motsCom[niv.etoiles];
        if (motsCommuns) {
          niv.mots = motsCommuns;
        } else if (!Array.isArray(niv.mots)) {
          niv.mots = [];
        }
        // Sécuriser : filtrer les mots sans champ "mot"
        niv.mots = (niv.mots as { mot?: string }[]).filter((m) => m && typeof m.mot === "string");
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

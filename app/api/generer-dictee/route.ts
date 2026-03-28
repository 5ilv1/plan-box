import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ParamsDictee, MotDict } from "@/types";

// motsImposer : mots déjà générés par la 1ère dictée, à réutiliser pour les suivantes
// phrasesDejaUtilisees : phrases des dictées précédentes, INTERDITES de réutilisation
interface ParamsDicteeAvecMots extends ParamsDictee {
  motsImposer?: Record<number, MotDict[]>; // etoiles → liste de mots
  phrasesDejaUtilisees?: string[];          // phrases à ne pas reproduire
}

function buildPrompt(p: ParamsDicteeAvecMots): string {
  const blocsMotsImposer = p.motsImposer
    ? Object.entries(p.motsImposer).map(([etoiles, mots]) => {
        const liste = mots.map((m) => `"${m.mot}" (${m.definition})`).join(", ");
        return `  - Niveau ⭐×${etoiles} : ${liste}`;
      }).join("\n")
    : null;

  const instructionMots = blocsMotsImposer
    ? `\nMOTS À RÉUTILISER OBLIGATOIREMENT (identiques à la dictée précédente — même liste, même définitions) :
${blocsMotsImposer}
Tu dois utiliser EXACTEMENT ces mots dans le champ "mots" de chaque niveau (ne pas en ajouter, ne pas en retirer, ne pas changer les définitions).
Crée des phrases NOUVELLES et DIFFÉRENTES qui font naturellement apparaître ces mots.\n`
    : "";

  // Extraire tous les n-grammes (4+ mots consécutifs) des phrases déjà utilisées
  function extraireNgrammes(phrases: string[]): string[] {
    const ngrams = new Set<string>();
    for (const phrase of phrases) {
      const mots = phrase.toLowerCase().replace(/[.,;:!?«»""]/g, "").split(/\s+/).filter(Boolean);
      for (let n = 4; n <= Math.min(mots.length, 8); n++) {
        for (let i = 0; i <= mots.length - n; i++) {
          ngrams.add(mots.slice(i, i + n).join(" "));
        }
      }
    }
    return Array.from(ngrams).slice(0, 60); // limiter pour ne pas exploser le prompt
  }

  const instructionPhrases = p.phrasesDejaUtilisees && p.phrasesDejaUtilisees.length > 0
    ? (() => {
        const ngrams = extraireNgrammes(p.phrasesDejaUtilisees);
        const ngramsStr = ngrams.length > 0
          ? `\nSéquences de mots INTERDITES (4+ mots consécutifs extraits des phrases précédentes — tu ne peux PAS les utiliser même dans un contexte légèrement différent) :\n${ngrams.map((g) => `"${g}"`).join(" / ")}\n`
          : "";
        return `\nPHRASES INTERDITES — RÈGLE ABSOLUE :
Ces phrases ont déjà été utilisées dans une dictée précédente de cette semaine :
${p.phrasesDejaUtilisees.map((ph, i) => `${i + 1}. ${ph}`).join("\n")}
${ngramsStr}
Les violations suivantes sont INTERDITES :
❌ Reproduire une phrase telle quelle
❌ Changer seulement le temps verbal (ex : "Zeus règnera sur les dieux" → "Zeus régnait sur les dieux")
❌ Changer seulement un adjectif, un déterminant ou un mot isolé
❌ Reprendre le même sujet + même verbe + même complément, même reformulés
❌ Utiliser une des séquences de mots interdites listées ci-dessus

✅ Chaque nouvelle phrase DOIT :
- Parler d'un personnage, d'une action, d'un lieu ou d'un moment DIFFÉRENT de toutes les phrases précédentes
- Avoir une structure syntaxique distincte (varier les constructions : circonstanciel en tête / relative / subordonnée / coordination…)
- Introduire un contenu entièrement nouveau, pas encore évoqué\n`;
      })()
    : "";

  // Description des phrases attendues selon la difficulté d'UN niveau
  function descPhraseNouvelle(diff: string, etoiles: number, prevEtoiles: number | null): string {
    const nbPhrases    = etoiles === 1 ? 3 : etoiles + 2;      // 3/4/5/6
    const nbMots       = [10, 13, 15, 17][etoiles - 1];
    const nbMotsSuppl  = etoiles === 1 ? "" : ` (reprend les ${[10,13,15][etoiles-2]} mots ⭐${"⭐".repeat(etoiles-2)} + ${[3,2,2][etoiles-2]} mots nouveaux)`;
    const motsPrev     = prevEtoiles !== null ? ` (reprend les ${prevEtoiles + 2} phrases ⭐${"⭐".repeat(prevEtoiles - 1)} MOT POUR MOT + 1 phrase nouvelle)` : "";
    const maxMots      = diff === "standard" ? 80 : diff === "exigeant" ? 100 : 120;

    const qualitePhraseNouvelle: Record<string, string[]> = {
      standard: [
        "Phrase simple (sujet + verbe + complément), vocabulaire courant.",
        "Phrase simple avec un complément de lieu ou de temps.",
        "Phrase légèrement développée.",
        "Phrase avec une coordination (et, mais, ou…).",
      ],
      exigeant: [
        "Phrases avec compléments circonstanciels, vocabulaire varié.",
        "Phrase nouvelle avec une proposition relative ou une coordination.",
        "Phrase nouvelle avec une subordonnée (quand, parce que, bien que…).",
        "Phrase nouvelle avec syntaxe élaborée, vocabulaire riche et précis.",
      ],
      expert: [
        "Phrases avec subordonnées ou propositions participiales, vocabulaire riche.",
        "Phrase longue avec inversions, appositions ou relatives enchâssées.",
        "Phrase très travaillée, vocabulaire soutenu, plusieurs difficultés orthographiques.",
        "Phrase de niveau collège, style littéraire, vocabulaire recherché.",
      ],
    };

    const qualite = (qualitePhraseNouvelle[diff] ?? qualitePhraseNouvelle.standard)[etoiles - 1];
    const nomNiveau = ["CE2", "CM1", "CM2", "CM2 renforcé"][etoiles - 1];
    const etoilesStr = "⭐".repeat(etoiles);

    return `- ${etoilesStr} ${nomNiveau} : ${nbPhrases} phrases${motsPrev}, ${nbMots} mots${nbMotsSuppl}. ${qualite} Maximum ${maxMots} mots au total pour ce niveau.`;
  }

  const diffParNiv = p.difficulteParNiveau ?? { 1: "standard", 2: "standard", 3: "exigeant", 4: "exigeant" };

  const lignesContraintes = [
    descPhraseNouvelle(diffParNiv[1], 1, null),
    descPhraseNouvelle(diffParNiv[2], 2, 1),
    descPhraseNouvelle(diffParNiv[3], 3, 2),
    descPhraseNouvelle(diffParNiv[4], 4, 3),
  ];

  const contraintes = `Contraintes par niveau (difficulté choisie par l'enseignant) :\n${lignesContraintes.join("\n")}`;

  return `Tu es un professeur des écoles expert en France, spécialisé en français primaire (CE2/CM1/CM2).
Tu génères un ensemble complet de 4 dictées différenciées sur le thème : ${p.theme}.
Temps verbaux à inclure : ${p.tempsVerbaux.join(", ")}.
Points grammaticaux à travailler : ${p.pointsGrammaticaux.join(", ")}.
Difficultés par niveau : ⭐ ${diffParNiv[1]} | ⭐⭐ ${diffParNiv[2]} | ⭐⭐⭐ ${diffParNiv[3]} | ⭐⭐⭐⭐ ${diffParNiv[4]}.
${instructionMots}${instructionPhrases}
DIVERSITÉ OBLIGATOIRE DES PHRASES :
Chaque phrase doit explorer un aspect DISTINCT du thème. Par exemple, pour un thème sur la mythologie grecque, une phrase parle d'un dieu, une autre d'un héros, une autre d'un lieu sacré, une autre d'une bataille, etc. Aucune phrase ne doit être une simple variation syntaxique d'une autre (même sujet + même idée = INTERDIT).

RÈGLE FONDAMENTALE D'EMBOÎTEMENT :
Les phrases du niveau ⭐ doivent être présentes MOT POUR MOT dans les niveaux supérieurs.
Les phrases de ⭐⭐ doivent être présentes MOT POUR MOT dans ⭐⭐⭐ et ⭐⭐⭐⭐.
Les phrases de ⭐⭐⭐ doivent être présentes MOT POUR MOT dans ⭐⭐⭐⭐.
La difficulté croît UNIQUEMENT par ajout de phrases, jamais par modification.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
{
  "titre": "Titre commun aux 4 niveaux",
  "niveaux": [
    {
      "etoiles": 1,
      "label": "CE2",
      "texte": "Texte complet niveau ⭐ avec toutes les phrases.",
      "phrases": [
        { "id": 1, "texte": "Phrase 1." },
        { "id": 2, "texte": "Phrase 2." },
        { "id": 3, "texte": "Phrase 3." }
      ],
      "mots": [
        { "mot": "automne", "definition": "La saison entre l'été et l'hiver" },
        { "mot": "aideront", "definition": "Verbe aider au futur, 3e personne du pluriel", "pronom": "ils" }
      ],
      "points_travailles": ["accords sujet/verbe", "imparfait"]
    },
    { "etoiles": 2, "label": "CM1", "texte": "...", "phrases": [...], "mots": [...], "points_travailles": [...] },
    { "etoiles": 3, "label": "CM2", "texte": "...", "phrases": [...], "mots": [...], "points_travailles": [...] },
    { "etoiles": 4, "label": "CM2 renforcé", "texte": "...", "phrases": [...], "mots": [...], "points_travailles": [...] }
  ]
}

${contraintes}
Au moins 2 groupes nominaux avec accord adjectif/déterminant par dictée.
Le champ "texte" doit contenir toutes les phrases du niveau séparées par des espaces (texte continu).
Pour les mots qui sont des verbes conjugués, ajoute impérativement le champ "pronom" avec le pronom personnel sujet correspondant (ex: "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "on"). Pour les noms, adjectifs ou adverbes, n'inclus pas le champ "pronom".`;
}

export async function POST(req: NextRequest) {
  try {
    const params: ParamsDicteeAvecMots = await req.json();

    if (!params.theme) {
      return NextResponse.json({ erreur: "Le thème est requis." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const prompt = buildPrompt(params);

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
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
    console.error("Erreur génération dictée:", err);
    return NextResponse.json(
      { erreur: "Échec de la génération. Réessaie." },
      { status: 500 }
    );
  }
}

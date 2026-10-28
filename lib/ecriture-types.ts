/**
 * Types d'écriture différenciés par mode (jour / semaine).
 *
 * MODE JOUR  → écrit court, ancré dans le quotidien (quelques lignes)
 * MODE SEMAINE → projet d'imagination, récit développé sur 4 jours
 */

import { DEBUTS_USES, type Axes } from "./theme-ecriture-variete";

export const TYPES_JOUR = [
  "description courte",
  "portrait en quelques lignes",
  "mini-dialogue",
  "carte postale ou petit mot",
  "observation du quotidien",
  "point de vue d'un objet",
  "liste argumentée (3 raisons)",
  "devinette ou énigme à écrire",
  "recette imaginaire",
  "message ou annonce",
  "souvenir raconté",
  "petite histoire en cinq phrases",
  "interview imaginaire",
  "mode d'emploi ou règle du jeu",
  "lettre à un personnage",
  "début d'histoire à continuer",
  "texte « Si j'étais… »",
  "fin heureuse ou fin surprise d'une situation donnée",
];

export const TYPES_SEMAINE = [
  "récit d'aventure",
  "conte",
  "récit de science-fiction léger",
  "récit à la 1re personne",
  "suite de récit",
  "récit à la 3e personne",
  "texte fantastique",
  "récit à rebondissements",
  "journal intime d'un personnage",
  "récit historique imaginé",
];

/** Prompt système adapté au mode. Type, univers et contrainte sont choisis par
 *  le code (`choisirAxes()`, lib/theme-ecriture-variete.ts) : laissés au modèle,
 *  ils revenaient toujours aux mêmes. */
export function buildSystemPrompt(
  mode: "jour" | "semaine",
  axes: Axes,
  listeSujets: string,
  listeContraintes: string,
): string {
  const niveaux = "CE2/CM1/CM2 (7-11 ans)";

  const reglesCommunes = `RÈGLES STRICTES SUR LA LANGUE :
- Soigne ABSOLUMENT les accords en genre et en nombre : "ta grand-mère" (féminin), "ton grand-père" (masculin), "tes parents", etc. Aucune faute d'accord n'est tolérée.
- Langue française irréprochable : pas de fautes d'orthographe, de conjugaison ni de syntaxe.

RÈGLES STRICTES SUR LA FORME :
- INTERDIT de commencer le sujet par : ${DEBUTS_USES.map((d) => `"${d}"`).join(", ")}
- Varier les structures : impératif ("Raconte...", "Décris...", "Invente..."), question ("Quel est le meilleur moment..."), situation directe ("Un matin, le facteur apporte un colis énorme..."), parole rapportée ("Ton voisin te dit que...")
- Ne recopie pas la tournure d'un sujet déjà utilisé, même pour un autre thème : les élèves reconnaissent le moule.`;

  const axesImposes = `▶ TYPE D'ÉCRITURE IMPOSÉ : « ${axes.type} »
Tu DOIS générer un sujet de CE type exact. Aucun autre type n'est accepté.

▶ UNIVERS IMPOSÉ : « ${axes.univers} »
Le sujet se passe dans cet univers. Choisis-y une situation précise et inattendue, pas la plus évidente.

▶ CONTRAINTE IMPOSÉE : ${axes.famille.consigne}
Rédige la contrainte en UNE phrase, adaptée au sujet et au type. N'écris pas une autre sorte de contrainte.

Sujets déjà utilisés — NE PAS reproduire ces thèmes, ces situations ni ces tournures :
${listeSujets || "(aucun)"}

Contraintes déjà utilisées récemment — ne pas les reformuler à l'identique :
${listeContraintes || "(aucune)"}`;

  if (mode === "jour") {
    return `Tu génères des sujets d'écriture COURTE pour des élèves de ${niveaux} dans une école primaire française.

⚠️ IMPORTANT : il s'agit d'un ÉCRIT DU JOUR — un texte COURT de quelques lignes (3 à 8 lignes maximum selon le niveau). L'élève doit pouvoir le rédiger en 10-15 minutes.

${axesImposes}

${reglesCommunes}

RÈGLES STRICTES SUR LE FOND (mode JOUR) :
- Une situation CONCRÈTE, que l'élève peut se représenter tout de suite et sur laquelle il a quelque chose à dire
- Un peu d'imaginaire est bienvenu (un objet qui parle, un animal qui écrit une lettre), mais pas de grande aventure : elles sont réservées à l'atelier de la semaine
- Le sujet doit appeler une réponse COURTE et directe

Génère UN sujet d'écriture courte avec :
- Un sujet : 1 ou 2 phrases courtes. Simple, direct, concret, qui donne envie d'écrire.
- La contrainte imposée ci-dessus, en une phrase.

Réponds UNIQUEMENT en JSON sans backticks :
{"sujet": "...", "contrainte": "..."}`;
  }

  // Mode semaine
  return `Tu génères des sujets d'écriture CRÉATIVE ET IMAGINATIVE pour des élèves de ${niveaux} dans une école primaire française.

⚠️ IMPORTANT : il s'agit d'un ATELIER D'ÉCRITURE SUR LA SEMAINE — un vrai projet de rédaction. L'élève écrit un premier jet lundi, retravaille son texte chaque jour (correction, enrichissement) et l'envoie le vendredi. Le sujet doit être assez RICHE et OUVERT pour soutenir un texte développé (10-20 lignes).

${axesImposes}

${reglesCommunes}

RÈGLES STRICTES SUR LE FOND (mode SEMAINE) :
- Favoriser l'IMAGINATION : aventures, voyages extraordinaires, rencontres inattendues, mondes décalés, situations insolites
- Le sujet doit donner envie de RACONTER UNE HISTOIRE avec un début, un milieu et une fin
- Situations riches qui permettent de développer des personnages, des péripéties, des descriptions
- ÉVITER les sujets trop simples ou fermés qui se traitent en 3 lignes

Génère UN sujet d'écriture avec :
- Un sujet : 1 ou 2 phrases maximum. Plante un décor évocateur et une situation de départ intrigante, puis termine par une invitation à écrire la suite ou à raconter l'histoire.
- La contrainte imposée ci-dessus, en une phrase, ambitieuse et adaptée à un récit développé.

Réponds UNIQUEMENT en JSON sans backticks :
{"sujet": "...", "contrainte": "..."}`;
}

/**
 * La consigne affichée au-dessus de l'éditeur, par mode. Un seul endroit : elle
 * était recopiée en quatre, et le mode jour disait encore « Écris ton texte sur
 * ton cahier d'écrivain » au-dessus d'un éditeur en ligne — deux consignes
 * contradictoires pour un élève de CE2.
 */
export const CONSIGNES_ECRITURE = {
  jour: "Écris ton texte ici, puis clique sur « Corriger mon texte » avant de terminer.",
  semaine: "Écris ton texte, reviens le retravailler chaque jour, et envoie-le le vendredi.",
} as const;

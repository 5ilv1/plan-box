/**
 * Types d'écriture différenciés par mode (jour / semaine).
 *
 * MODE JOUR  → écrit court, ancré dans le quotidien (quelques lignes)
 * MODE SEMAINE → projet d'imagination, récit développé sur 4 jours
 */

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

/** Prompt système adapté au mode */
export function buildSystemPrompt(mode: "jour" | "semaine", typeImpose: string, derniersTypes: string, listeSujets: string): string {
  const niveaux = "CE2/CM1/CM2 (7-11 ans)";

  const reglesCommunes = `RÈGLES STRICTES SUR LA LANGUE :
- Soigne ABSOLUMENT les accords en genre et en nombre : "ta grand-mère" (féminin), "ton grand-père" (masculin), "tes parents", etc. Aucune faute d'accord n'est tolérée.
- Langue française irréprochable : pas de fautes d'orthographe, de conjugaison ni de syntaxe.

RÈGLES STRICTES SUR LA FORME :
- INTERDIT de commencer par "Tu découvres", "Tu te réveilles", "Tu trouves", "Imagine que", "Si tu"
- Varier les structures : impératif ("Raconte...", "Décris...", "Écris..."), question ("Quel est le meilleur moment..."), situation directe ("Un matin, le facteur apporte un colis énorme..."), dialogue ("Ton meilleur ami te dit que...")`;

  if (mode === "jour") {
    return `Tu génères des sujets d'écriture COURTE pour des élèves de ${niveaux} dans une école primaire française.

⚠️ IMPORTANT : il s'agit d'un ÉCRIT DU JOUR — un texte COURT de quelques lignes (3 à 8 lignes maximum selon le niveau). L'élève doit pouvoir le rédiger en 10-15 minutes.

▶ TYPE D'ÉCRITURE IMPOSÉ : « ${typeImpose} »
Tu DOIS générer un sujet de CE type exact. Aucun autre type n'est accepté.
${derniersTypes ? `Types utilisés récemment (déjà vus, ne pas répéter) : ${derniersTypes}` : ""}

Sujets déjà utilisés — NE PAS reproduire ces thèmes ni des thèmes similaires :
${listeSujets || "(aucun)"}

${reglesCommunes}

RÈGLES STRICTES SUR LE FOND (mode JOUR) :
- Thèmes ancrés dans le QUOTIDIEN : école, récréation, famille, repas, trajet, météo, sport, animaux de compagnie, moments de la journée, petites observations
- Favoriser des situations CONCRÈTES et SIMPLES : décrire ce qu'on voit par la fenêtre, raconter un moment de la récréation, écrire un petit mot à quelqu'un…
- ÉVITER les grandes aventures, les mondes imaginaires, les récits complexes — ce n'est PAS le lieu pour ça
- Le sujet doit appeler une réponse COURTE et directe

Génère UN sujet d'écriture courte avec :
- Un sujet : 1 phrase maximum. Simple, direct, concret. Termine par une question courte ou une invitation à écrire en quelques lignes.
- Une contrainte stylistique légère et adaptée à un écrit court (ex : "Utilise au moins 2 adjectifs", "Commence chaque phrase par un mot différent", "Utilise une comparaison")

Réponds UNIQUEMENT en JSON sans backticks :
{"sujet": "...", "contrainte": "..."}`;
  }

  // Mode semaine
  return `Tu génères des sujets d'écriture CRÉATIVE ET IMAGINATIVE pour des élèves de ${niveaux} dans une école primaire française.

⚠️ IMPORTANT : il s'agit d'un ATELIER D'ÉCRITURE SUR LA SEMAINE — un vrai projet de rédaction. L'élève écrit un premier jet lundi, retravaille son texte chaque jour (correction, enrichissement) et l'envoie le vendredi. Le sujet doit être assez RICHE et OUVERT pour soutenir un texte développé (10-20 lignes).

▶ TYPE D'ÉCRITURE IMPOSÉ : « ${typeImpose} »
Tu DOIS générer un sujet de CE type exact. Aucun autre type n'est accepté.
${derniersTypes ? `Types utilisés récemment (déjà vus, ne pas répéter) : ${derniersTypes}` : ""}

Sujets déjà utilisés — NE PAS reproduire ces thèmes ni des thèmes similaires :
${listeSujets || "(aucun)"}

${reglesCommunes}

RÈGLES STRICTES SUR LE FOND (mode SEMAINE) :
- Favoriser l'IMAGINATION : aventures, voyages extraordinaires, rencontres inattendues, mondes décalés, situations insolites
- Le sujet doit donner envie de RACONTER UNE HISTOIRE avec un début, un milieu et une fin
- Situations riches qui permettent de développer des personnages, des péripéties, des descriptions
- ÉVITER les sujets trop simples ou fermés qui se traitent en 3 lignes
- Le cadre peut être fantastique, futuriste, historique ou réaliste-décalé

Génère UN sujet d'écriture avec :
- Un sujet : 1 ou 2 phrases maximum. Plante un décor évocateur et une situation de départ intrigante, puis termine par une invitation à écrire la suite ou à raconter l'histoire.
- Une contrainte narrative ambitieuse adaptée à un récit développé (ex : "Inclus un dialogue entre deux personnages", "Décris un lieu en utilisant les 5 sens", "Ton récit doit contenir un retournement de situation")

Réponds UNIQUEMENT en JSON sans backticks :
{"sujet": "...", "contrainte": "..."}`;
}

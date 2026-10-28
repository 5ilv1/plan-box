// ── La variété des thèmes d'écriture : choisie par le code, pas par le modèle ──
//
// Les élèves trouvaient les sujets « tous pareils », et les 36 thèmes du jour de
// la rentrée au 27/10 leur donnaient raison :
//   - les 10 types tournaient dans un ORDRE FIXE (`total % 10`) : la même suite
//     revenait toutes les deux semaines et demie ;
//   - 24 contraintes sur 36 étaient « Utilise au moins deux adjectifs » ;
//   - le prompt ancrait tout « dans le quotidien : école, récréation… », et le
//     modèle refaisait « La maîtresse annonce… », « Pense à… », « Regarde… » ;
//   - chaque type avait son moule : quatre recettes de « potion / bonbon /
//     boisson / gâteau magique, trois ingrédients rigolos ».
// Lui montrer les 50 derniers sujets n'y suffisait pas : il évite le même sujet,
// pas la même forme. Le code choisit donc trois axes — type, univers, famille de
// contrainte —, chacun parmi les moins récemment servis, et le modèle n'écrit
// que le sujet. Module pur : aucun accès base.

export type ModeEcriture = "jour" | "semaine";

/** Univers où se passe le sujet. L'école n'en est qu'un parmi d'autres. */
export const UNIVERS_JOUR = [
  "la maison et la famille",
  "la nature, la forêt, la mer ou la montagne",
  "les animaux (sauvages, de la ferme ou de compagnie)",
  "la ville, le quartier, les commerçants",
  "le sport, les jeux et les loisirs",
  "la nourriture et la cuisine",
  "la météo et les saisons",
  "un voyage, une sortie, une excursion",
  "les métiers et les gens qui travaillent",
  "les objets et les inventions",
  "les souvenirs et les émotions",
  "une pointe d'imaginaire dans la vie de tous les jours",
  "l'école et la classe",
];

export const UNIVERS_SEMAINE = [
  "la mer, les îles et les bateaux",
  "la forêt, la montagne ou la jungle",
  "l'espace et les autres planètes",
  "une ville du futur",
  "le passé (château fort, Préhistoire, Antiquité…)",
  "le monde des animaux",
  "un monde miniature ou géant",
  "les contes et la magie",
  "une enquête, un mystère à résoudre",
  "le quotidien qui bascule dans l'étrange",
  "le froid, les pôles, la neige",
  "le désert, la chaleur, une expédition",
];

/**
 * Familles de contraintes. Le code choisit la famille, le modèle l'écrit en une
 * phrase adaptée au sujet. `motif` reconnaît une contrainte de cette famille
 * dans le texte déjà en base : l'historique sert sans colonne de plus, y compris
 * pour les thèmes écrits avant ce module.
 */
export interface FamilleContrainte {
  cle: string;
  consigne: string;
  motif: RegExp;
  modes: ModeEcriture[];
}

export const FAMILLES_CONTRAINTE: FamilleContrainte[] = [
  { cle: "adjectifs", modes: ["jour"], consigne: "employer des adjectifs précis (au moins deux ou trois)", motif: /adjectif/i },
  { cle: "comparaison", modes: ["jour", "semaine"], consigne: "faire au moins une comparaison avec « comme » ou « aussi… que »", motif: /comparaison|\bcomme\b.*…|aussi\b.*\bque\b/i },
  { cle: "connecteurs", modes: ["jour", "semaine"], consigne: "organiser le texte avec des mots de liaison (d'abord, ensuite, puis, enfin…)", motif: /d'abord|ensuite|enfin|mots? de liaison|connecteur/i },
  { cle: "dialogue", modes: ["jour", "semaine"], consigne: "présenter des paroles avec les tirets et les guillemets du dialogue", motif: /dialogue|tiret|guillemet|prise de parole/i },
  { cle: "question-exclamation", modes: ["jour"], consigne: "écrire au moins une phrase interrogative et une phrase exclamative", motif: /interrogativ|exclamati|point d'exclamation|point d'interrogation|\bquestions?\b/i },
  { cle: "sens", modes: ["jour", "semaine"], consigne: "faire appel à plusieurs sens (vue, ouïe, odorat, goût, toucher)", motif: /\bsens\b|odeur|odorat|ouïe|toucher|entends|j'aperçois/i },
  { cle: "verbes", modes: ["jour", "semaine"], consigne: "remplacer les verbes trop simples (faire, aller, dire, mettre) par des verbes plus précis", motif: /verbes? (précis|d'action|variés)|verbes? qui expriment|faire, aller|\bverbes?\b.*(impératif|infinitif)/i },
  { cle: "temps", modes: ["jour", "semaine"], consigne: "écrire à un temps imposé et s'y tenir (imparfait et passé composé pour un récit au passé, ou futur pour un projet)", motif: /imparfait|passé composé|passé simple|au futur|\bprésent\b/i },
  { cle: "reprises", modes: ["jour", "semaine"], consigne: "ne pas répéter le nom du personnage ou de l'objet : le reprendre par un pronom ou un autre groupe nominal", motif: /pronom|répét|reprendre|reprise/i },
  { cle: "debut-fin", modes: ["jour", "semaine"], consigne: "commencer ou finir le texte par une phrase imposée, que tu écris dans la contrainte", motif: /commence (ton texte|par la phrase)|termine (ton texte |)par la phrase|phrase imposée|première phrase|dernière phrase/i },
  { cle: "negation", modes: ["jour"], consigne: "écrire au moins deux phrases à la forme négative (ne… pas, ne… jamais, ne… plus)", motif: /négati|ne\s*…\s*(pas|jamais|plus)/i },
  { cle: "expansion", modes: ["jour", "semaine"], consigne: "enrichir les noms avec un complément du nom ou une proposition relative (« un chat aux yeux verts », « la maison qui… »)", motif: /complément du nom|relative|expansion|groupe nominal enrichi/i },
  { cle: "lieu-temps", modes: ["jour", "semaine"], consigne: "dire où et quand se passe chaque moment (compléments de lieu et de temps)", motif: /compléments? (de lieu|de temps|circonstanciel)|où et quand/i },
  { cle: "rebondissement", modes: ["semaine"], consigne: "placer un rebondissement ou un retournement de situation", motif: /rebondissement|retournement|inattendu/i },
  { cle: "emotions", modes: ["semaine"], consigne: "montrer ce que ressent le personnage sans le dire directement (gestes, visage, voix)", motif: /ressen|émotion/i },
  { cle: "portrait", modes: ["semaine"], consigne: "faire le portrait physique et moral d'un personnage", motif: /portrait|physique.*moral/i },
];

/** La famille d'une contrainte déjà écrite, ou null si on ne la reconnaît pas. */
export function familleDeContrainte(texte: string | null | undefined): string | null {
  if (!texte) return null;
  for (const f of FAMILLES_CONTRAINTE) if (f.motif.test(texte)) return f.cle;
  return null;
}

/** Un thème déjà généré, le plus récent en premier. */
export interface ThemePasse {
  sujet: string;
  contrainte?: string | null;
  type_ecriture?: string | null;
  mode?: string | null;
}

export interface Axes {
  type: string;
  univers: string;
  famille: FamilleContrainte;
}

/**
 * Un candidat tiré au hasard parmi les `ampleur` servis le moins récemment
 * (jamais servis d'abord). Pas le seul plus ancien : le choix serait alors
 * déterminé par l'historique, et « Autre » ou « Régénérer », qui ne
 * l'enrichissent pas, reproposeraient la même chose. Pas un tirage libre non
 * plus : ce qui vient de sortir ne doit pas revenir.
 */
export function moinsRecent<T>(
  candidats: T[],
  dernierUsage: (c: T) => number, // rang dans l'historique (0 = le plus récent), Infinity si jamais servi
  alea: () => number,
  ampleur = 3,
): T {
  const melanges = candidats
    .map((c) => ({ c, rang: dernierUsage(c), tirage: alea() }))
    // Les ex æquo dans un ordre tiré : sans cela, les jamais servis sortiraient
    // dans l'ordre de la liste, c'est-à-dire l'ancienne rotation.
    .sort((x, y) => (y.rang - x.rang) || (x.tirage - y.tirage) || 0);
  const k = Math.max(1, Math.min(ampleur, melanges.length));
  return melanges[Math.min(k - 1, Math.floor(alea() * k))].c;
}

function rangDansHistorique(historique: ThemePasse[], test: (t: ThemePasse) => boolean): number {
  const i = historique.findIndex(test);
  return i === -1 ? Infinity : i;
}

/**
 * Les mots-clés qui reconnaissent un univers dans un sujet déjà écrit. Les
 * thèmes ne gardent pas leur univers en base : on le relit dans le sujet, à gros
 * traits. Une erreur de lecture ne fait que changer l'ordre de passage ; chaque
 * univers DOIT avoir son indice, sinon il passerait pour « jamais servi » à
 * chaque fois et sortirait tous les jours.
 */
export const INDICES_UNIVERS: Record<string, RegExp> = {
  // jour
  "la maison et la famille": /maison|famille|grand-(mère|père|parent)|parents|frère|sœur|chambre/i,
  "la nature, la forêt, la mer ou la montagne": /nature|forêt|mer|plage|montagne|rivière|jardin|arbre/i,
  "les animaux (sauvages, de la ferme ou de compagnie)": /animal|animaux|chien|chat|chiot|oiseau|ferme|cheval/i,
  "la ville, le quartier, les commerçants": /quartier|boulang|rue|ville|magasin|marché|voisin/i,
  "le sport, les jeux et les loisirs": /sport|match|ballon|jeu|jeux|vélo|piscine|loisir/i,
  "la nourriture et la cuisine": /recette|cuisine|plat|goûter|repas|gâteau|ingrédient|bonbon|boisson/i,
  "la météo et les saisons": /météo|pluie|neige|soleil|vent|orage|automne|hiver|printemps|saison/i,
  "un voyage, une sortie, une excursion": /voyage|vacances|sortie|excursion|train|avion|valise|carte postale/i,
  "les métiers et les gens qui travaillent": /métier|travail|facteur|pompier|médecin|cuisinier|boulanger/i,
  "les objets et les inventions": /objet|invention|machine|robot|tu es (le|la|l')/i,
  "les souvenirs et les émotions": /souvenir|émotion|fier|peur|joie|triste|admire/i,
  "une pointe d'imaginaire dans la vie de tous les jours": /magique|imaginaire|superpouvoir|potion|parle soudain/i,
  "l'école et la classe": /école|classe|maîtresse|maître|récré|cantine|cartable|trousse|camarade/i,
  // semaine
  "la mer, les îles et les bateaux": /mer|océan|île|bateau|pirate|navire/i,
  "la forêt, la montagne ou la jungle": /forêt|montagne|jungle|grotte/i,
  "l'espace et les autres planètes": /espace|planète|fusée|étoile|extraterrestre/i,
  "une ville du futur": /futur|robot|an \d{4}|\b2\d{3}\b/i,
  "le passé (château fort, Préhistoire, Antiquité…)": /château|chevalier|préhistoire|antiquité|passé|roi\b|reine/i,
  "le monde des animaux": /animal|animaux|dragon|loup|renard/i,
  "un monde miniature ou géant": /minuscule|miniature|géant|rétréci/i,
  "les contes et la magie": /magie|magique|sorci|fée|enchant|conte/i,
  "une enquête, un mystère à résoudre": /enquête|mystère|mystérieu|disparu|détective|indice/i,
  "le quotidien qui bascule dans l'étrange": /étrange|bizarre|surgi|lueur|murmur/i,
  "le froid, les pôles, la neige": /pôle|banquise|neige|glace|hiver/i,
  "le désert, la chaleur, une expédition": /désert|sable|expédition|explorat/i,
};

function rangUnivers(historique: ThemePasse[], univers: string): number {
  const indice = INDICES_UNIVERS[univers];
  return rangDansHistorique(historique, (t) => indice.test(t.sujet));
}

/** Choisit type, univers et famille de contrainte d'après l'historique. */
export function choisirAxes(
  mode: ModeEcriture,
  types: string[],
  historique: ThemePasse[],
  alea: () => number = Math.random,
): Axes {
  // Un atelier de la semaine ne dit rien de la variété des écrits du jour.
  historique = historique.filter((t) => (t.mode ?? "jour") === mode);
  const type = moinsRecent(types, (ty) => rangDansHistorique(historique, (t) => t.type_ecriture === ty), alea);
  const universListe = mode === "semaine" ? UNIVERS_SEMAINE : UNIVERS_JOUR;
  const univers = moinsRecent(universListe, (u) => rangUnivers(historique, u), alea);
  const familles = FAMILLES_CONTRAINTE.filter((f) => f.modes.includes(mode));
  const famille = moinsRecent(
    familles,
    (f) => rangDansHistorique(historique, (t) => familleDeContrainte(t.contrainte) === f.cle),
    alea,
  );
  return { type, univers, famille };
}

/** Les débuts de sujet qui reviennent trop : le modèle doit les éviter. */
export const DEBUTS_USES = [
  "Tu découvres", "Tu te réveilles", "Tu trouves", "Imagine que", "Si tu",
  "Pense à", "Regarde", "Ferme les yeux", "La maîtresse", "Donne trois bonnes raisons",
  "Écris la recette imaginaire d'une potion",
];

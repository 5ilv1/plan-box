/**
 * Rallye Bestioles — logique pure (aucun accès base, aucune donnée).
 *
 * ⚠️ Ce module est importé par la page élève : il ne doit JAMAIS importer
 * `lib/rallye-bestioles.json`, qui contient les bonnes réponses. Les données
 * ne se lisent que côté serveur (`lib/rallye-bestioles-serveur.ts`).
 */

/** Nombre de podcasts proposés au choix chaque jour. */
export const NB_PROPOSITIONS = 3;

/** Part de l'épisode à écouter avant que le QCM se débloque. */
export const PART_ECOUTE_MIN = 0.9;

export interface EleveCourantRallye {
  eleveId: string | null;
  rbEleveId: number | null;
  prenom: string;
  nom: string;
}

export interface QuestionRallye {
  question: string;
  options: string[];
  /** Indices des options justes (une seule le plus souvent, parfois deux). */
  bonnes: number[];
}

export interface FicheRallye {
  numero: number;
  animal: string;
  titre: string;
  /** MP3/M4A servi par Radio France — jamais copié chez nous. */
  audio: string;
  /** Page de l'épisode sur radiofrance.fr (secours si l'audio ne passe pas). */
  page: string;
  image: string | null;
  questions: QuestionRallye[];
}

/** Ce que le navigateur reçoit d'une question : sans les bonnes réponses. */
export interface QuestionPublique {
  question: string;
  options: string[];
}

export interface EpisodePublic {
  numero: number;
  animal: string;
  titre: string;
  audio: string;
  page: string;
  image: string | null;
}

export function episodePublic(f: FicheRallye): EpisodePublic {
  return { numero: f.numero, animal: f.animal, titre: f.titre, audio: f.audio, page: f.page, image: f.image };
}

export function questionsPubliques(f: FicheRallye): QuestionPublique[] {
  return f.questions.map((q) => ({ question: q.question, options: q.options }));
}

/** Hachage FNV-1a 32 bits : stable d'un serveur à l'autre, sans dépendance. */
function hacher(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Générateur pseudo-aléatoire graine → suite (mulberry32). */
function aleatoire(graine: number): () => number {
  let a = graine;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Les podcasts proposés à un élève un jour donné, parmi ceux qu'il n'a pas
 * encore joués. Tirage **déterminé** par (élève, date) : recharger la page ne
 * rebat pas les cartes — sinon un élève relancerait jusqu'à tomber sur son
 * animal préféré. Rien n'est stocké.
 */
export function tirerPropositions(
  disponibles: number[],
  cleEleve: string,
  date: string,
  nb: number = NB_PROPOSITIONS,
): number[] {
  const tries = [...disponibles].sort((a, b) => a - b);
  const hasard = aleatoire(hacher(`${cleEleve}|${date}`));
  for (let i = tries.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [tries[i], tries[j]] = [tries[j], tries[i]];
  }
  return tries.slice(0, nb);
}

/** Une réponse vaut 1 point si elle fait partie des bonnes, 0 sinon. */
export function estBonne(q: QuestionRallye, choix: number): boolean {
  return q.bonnes.includes(choix);
}

/** `reponses[i]` = option choisie à la question i, `null` si pas encore répondue. */
export function scorePartie(f: FicheRallye, reponses: Array<number | null>): number {
  return f.questions.reduce((s, q, i) => {
    const r = reponses[i];
    return s + (typeof r === "number" && estBonne(q, r) ? 1 : 0);
  }, 0);
}

export interface LigneClassement {
  cle: string;
  prenom: string;
  points: number;
  podcasts: number;
  rang: number;
}

export interface PartiePourClassement {
  cle: string;
  prenom: string;
  nom: string;
  score: number;
  termine: boolean;
}

/**
 * Classement de la classe : points cumulés sur les podcasts terminés.
 * Égalité de points ⇒ même rang (1, 2, 2, 4). À points égaux, l'ordre
 * d'affichage est alphabétique — jamais « qui a joué le plus », ce qui
 * reviendrait à favoriser celui qui a eu le moins de bonnes réponses par podcast.
 * Deux élèves de même prénom sont départagés par l'initiale du nom.
 */
export function classer(parties: PartiePourClassement[]): LigneClassement[] {
  const parEleve = new Map<string, { prenom: string; nom: string; points: number; podcasts: number }>();
  for (const p of parties) {
    if (!p.termine) continue;
    const e = parEleve.get(p.cle) ?? { prenom: p.prenom, nom: p.nom, points: 0, podcasts: 0 };
    e.points += p.score;
    e.podcasts += 1;
    parEleve.set(p.cle, e);
  }

  const compte = new Map<string, number>();
  for (const e of parEleve.values()) compte.set(e.prenom, (compte.get(e.prenom) ?? 0) + 1);

  const lignes = [...parEleve.entries()]
    .map(([cle, e]) => ({
      cle,
      prenom: (compte.get(e.prenom) ?? 0) > 1 && e.nom ? `${e.prenom} ${e.nom[0].toUpperCase()}.` : e.prenom,
      points: e.points,
      podcasts: e.podcasts,
      rang: 0,
    }))
    .sort((a, b) => b.points - a.points || a.prenom.localeCompare(b.prenom, "fr"));

  lignes.forEach((l, i) => {
    l.rang = i > 0 && lignes[i - 1].points === l.points ? lignes[i - 1].rang : i + 1;
  });
  return lignes;
}

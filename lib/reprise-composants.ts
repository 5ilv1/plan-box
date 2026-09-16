/**
 * Reprendre une activité qui ne se valide qu'à la fin.
 *
 * `ExerciceStack` avance question par question : son état tient dans un index
 * et des réponses déjà notées. Les cinq activités couvertes ici n'ont pas
 * d'index — l'élève remplit un texte, glisse des étiquettes, range une série,
 * et ne valide qu'au bout. Coupé en route, il perdait **tout**, et c'est
 * justement le travail le plus long à refaire : vingt étiquettes replacées une
 * à une, huit trous retapés.
 *
 * Ce module ne contient que les **gardes** : « cet état décrit-il encore ce
 * contenu-là ? ». Elles sont pures et testées
 * (`docs/tests/test-reprise-composants.mjs`), parce qu'une garde trop
 * permissive ne plante pas — elle réaffiche un travail qui se rapporte à
 * d'autres questions, et l'élève corrige un exercice fantôme. Dans le doute
 * on rend `null` : l'élève recommence, c'est-à-dire le comportement d'avant.
 *
 * Chaque garde exige aussi un **début de travail**. Sans cela on
 * enregistrerait des états vides et on « reprendrait » une activité à laquelle
 * personne n'a touché.
 */

/* ── Outils communs ─────────────────────────────────────────────────────── */

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const entierDans = (v: unknown, borne: number): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < borne;

/**
 * Les indices donnés couvrent-ils exactement 0…n-1, une fois chacun ?
 *
 * C'est la vérification qui compte pour le classement et le rangement : une
 * étiquette en double ou manquante rendrait la série impossible à terminer,
 * et l'élève resterait bloqué devant un exercice qu'il ne peut pas valider.
 */
function permutationComplete(indices: number[], n: number): boolean {
  if (indices.length !== n) return false;
  const vus = new Set<number>();
  for (const i of indices) {
    if (!entierDans(i, n) || vus.has(i)) return false;
    vus.add(i);
  }
  return true;
}

/* ── Texte à trous ──────────────────────────────────────────────────────── */

export interface EtatTexteATrous {
  /** Position du trou → mot saisi. Clés en texte : c'est du JSON. */
  reponses: Record<string, string>;
  /** Nombre de vérifications déjà demandées, pour ne pas fausser le premier score. */
  tentative: number;
  /**
   * Position du trou → juste au **premier** essai. C'est la note honnête, et
   * elle doit traverser l'interruption : sans elle, un élève coupé après un
   * premier jet raté revient corriger et ressort avec un sans-faute.
   */
  premierResultat?: Record<string, boolean> | null;
}

/**
 * Les réponses saisies valent-elles encore pour ces trous ?
 *
 * On revient toujours en **saisie**, jamais sur l'écran de correction : ce
 * qu'on restitue est le travail de l'élève, pas le verdict. Il revalide, et
 * la correction se refait sur ce qu'il a réellement sous les yeux.
 */
export function repriseTexteATrous(
  etat: unknown,
  positions: number[],
): EtatTexteATrous | null {
  if (!estObjet(etat) || !estObjet(etat.reponses)) return null;

  const connues = new Set(positions);
  const reponses: Record<string, string> = {};
  let saisi = 0;

  for (const [cle, valeur] of Object.entries(etat.reponses)) {
    const position = Number(cle);
    // Un trou qui n'existe plus : l'énoncé a changé, la reprise ne vaut rien.
    if (!Number.isInteger(position) || !connues.has(position)) return null;
    if (typeof valeur !== "string") return null;
    reponses[cle] = valeur;
    if (valeur.trim()) saisi++;
  }

  if (saisi === 0) return null;

  const tentative = Number.isInteger(etat.tentative) ? (etat.tentative as number) : 0;
  return {
    reponses,
    tentative: Math.max(0, tentative),
    premierResultat: releveBooleens(etat.premierResultat, connues),
  };
}

/**
 * Un relevé « clé → juste ou faux », vérifié.
 *
 * Rendu `null` au moindre doute : perdre la note du premier essai fait
 * réenregistrer un sans-faute, ce qui est faux, mais moins grave que de
 * rattacher des résultats à d'autres questions.
 */
function releveBooleens(brut: unknown, clesConnues?: Set<number>): Record<string, boolean> | null {
  if (!estObjet(brut)) return null;
  const releve: Record<string, boolean> = {};
  for (const [cle, valeur] of Object.entries(brut)) {
    if (typeof valeur !== "boolean") return null;
    if (clesConnues && !clesConnues.has(Number(cle))) return null;
    releve[cle] = valeur;
  }
  return Object.keys(releve).length > 0 ? releve : null;
}

/* ── Classement ─────────────────────────────────────────────────────────── */

export interface EtatClassement {
  /** Indices des items encore dans la réserve, **dans l'ordre mélangé**. */
  pool: number[];
  /** Catégorie → indices des items qu'on y a glissés. */
  classement: Record<string, number[]>;
  /** Index de l'item → bien classé au **premier** essai. La note honnête. */
  premierResultat?: Record<string, boolean> | null;
}

/**
 * Le classement en cours décrit-il encore ces items et ces catégories ?
 *
 * L'ordre de la réserve fait partie de l'état, comme l'ordre des questions
 * dans `ExerciceStack` : il est tiré au sort au montage, et le retirer ferait
 * sauter les étiquettes d'une place à l'autre au retour de l'élève.
 */
export function repriseClassement(
  etat: unknown,
  nbItems: number,
  categories: string[],
): EtatClassement | null {
  if (!estObjet(etat) || !Array.isArray(etat.pool) || !estObjet(etat.classement)) return null;

  const cles = Object.keys(etat.classement);
  // Une catégorie ajoutée, retirée ou renommée : l'exercice n'est plus le même.
  if (cles.length !== categories.length || !cles.every((c) => categories.includes(c))) return null;

  const classement: Record<string, number[]> = {};
  const tous: number[] = [...(etat.pool as number[])];
  let places = 0;

  for (const categorie of categories) {
    const dedans = (etat.classement as Record<string, unknown>)[categorie];
    if (!Array.isArray(dedans)) return null;
    classement[categorie] = dedans as number[];
    tous.push(...(dedans as number[]));
    places += dedans.length;
  }

  // Chaque item exactement une fois, réserve et catégories confondues.
  if (!permutationComplete(tous, nbItems)) return null;
  if (places === 0) return null;

  const connues = new Set(Array.from({ length: nbItems }, (_, i) => i));
  return {
    pool: etat.pool as number[],
    classement,
    premierResultat: releveBooleens(etat.premierResultat, connues),
  };
}

/* ── Analyse de phrase ──────────────────────────────────────────────────── */

export interface TrouvailleReprise {
  debut: number;
  fin: number;
  correct: boolean;
  montre?: boolean;
}

export interface EtatAnalysePhrase {
  phraseIdx: number;
  etapeIdx: number;
  /** Index de phrase → fonction grammaticale → ce qui a été trouvé. */
  reponses: Record<string, Record<string, TrouvailleReprise>>;
  score: { bon: number; total: number };
}

/**
 * L'analyse en cours porte-t-elle encore sur ces phrases ?
 *
 * ⚠️ Le nombre de phrases est celui des phrases **saines** — après le passage
 * de `recalerGroupes()`, qui écarte un groupe introuvable dans le texte. Une
 * phrase retirée décale tous les index, donc la garde doit voir la liste
 * assainie, jamais la liste brute du contenu.
 */
export function repriseAnalysePhrase(
  etat: unknown,
  nbPhrasesSaines: number,
): EtatAnalysePhrase | null {
  if (!estObjet(etat)) return null;
  if (!entierDans(etat.phraseIdx, nbPhrasesSaines)) return null;
  if (!Number.isInteger(etat.etapeIdx) || (etat.etapeIdx as number) < 0) return null;
  if (!estObjet(etat.reponses) || !estObjet(etat.score)) return null;

  const { bon, total } = etat.score as { bon: unknown; total: unknown };
  if (!Number.isInteger(bon) || !Number.isInteger(total)) return null;
  if ((bon as number) < 0 || (total as number) < (bon as number)) return null;

  // Rien de fait : il n'y a pas de reprise, il y a un début.
  if ((etat.phraseIdx as number) === 0 && (total as number) === 0) return null;

  const reponses: Record<string, Record<string, TrouvailleReprise>> = {};
  for (const [cle, parFonction] of Object.entries(etat.reponses)) {
    if (!entierDans(Number(cle), nbPhrasesSaines) || !estObjet(parFonction)) return null;
    const trouvailles: Record<string, TrouvailleReprise> = {};
    for (const [fonction, t] of Object.entries(parFonction)) {
      if (!estObjet(t)) return null;
      const { debut, fin, correct } = t as Record<string, unknown>;
      if (!Number.isInteger(debut) || !Number.isInteger(fin)) return null;
      if ((debut as number) < 0 || (fin as number) < (debut as number)) return null;
      if (typeof correct !== "boolean") return null;
      trouvailles[fonction] = {
        debut: debut as number,
        fin: fin as number,
        correct,
        montre: (t as Record<string, unknown>).montre === true,
      };
    }
    reponses[cle] = trouvailles;
  }

  return {
    phraseIdx: etat.phraseIdx as number,
    etapeIdx: etat.etapeIdx as number,
    reponses,
    score: { bon: bon as number, total: total as number },
  };
}

/* ── Comparaison de nombres ─────────────────────────────────────────────── */

export interface EtatComparaison {
  reponses: (string | null)[];
  /** Indices déjà justes : ces lignes sont verrouillées. */
  justes: number[];
  /**
   * Le résultat de la première validation, ou `null` si elle n'a pas eu lieu.
   * C'est la note honnête : sans elle, un élève coupé après un premier essai
   * raté reviendrait corriger ses erreurs et ressortirait avec un sans-faute.
   */
  premiereTentative: boolean[] | null;
}

export function repriseComparaison(etat: unknown, nbPaires: number): EtatComparaison | null {
  if (!estObjet(etat) || !Array.isArray(etat.reponses)) return null;
  if (etat.reponses.length !== nbPaires) return null;
  if (!etat.reponses.every((r) => r === null || typeof r === "string")) return null;

  const justes = Array.isArray(etat.justes) ? (etat.justes as unknown[]) : [];
  if (!justes.every((i) => entierDans(i, nbPaires))) return null;

  const pt = etat.premiereTentative;
  if (pt !== null && pt !== undefined) {
    if (!Array.isArray(pt) || pt.length !== nbPaires) return null;
    if (!pt.every((v) => typeof v === "boolean")) return null;
  }

  const repondues = (etat.reponses as (string | null)[]).filter((r) => r !== null).length;
  if (repondues === 0) return null;

  return {
    reponses: etat.reponses as (string | null)[],
    justes: justes as number[],
    premiereTentative: (pt as boolean[] | undefined) ?? null,
  };
}

/* ── Rangement ──────────────────────────────────────────────────────────── */

export interface EtatSerieRangement {
  reserve: number[];
  places: number[];
  statut: "saisie" | "faux" | "juste";
}

export interface EtatRangement {
  etats: EtatSerieRangement[];
  premiereTentative: (boolean | null)[];
}

const STATUTS_RANGEMENT = new Set(["saisie", "faux", "juste"]);

/**
 * Les séries en cours décrivent-elles encore ces étiquettes ?
 *
 * Comme pour le classement, réserve et étiquettes posées doivent couvrir
 * exactement les éléments de la série : une étiquette perdue en route rendrait
 * la série invalidable, et l'élève ne pourrait plus terminer son exercice.
 */
export function repriseRangement(etat: unknown, tailles: number[]): EtatRangement | null {
  if (!estObjet(etat) || !Array.isArray(etat.etats)) return null;
  if (etat.etats.length !== tailles.length) return null;

  const etats: EtatSerieRangement[] = [];
  let pose = 0;

  for (let i = 0; i < tailles.length; i++) {
    const e = etat.etats[i];
    if (!estObjet(e) || !Array.isArray(e.reserve) || !Array.isArray(e.places)) return null;
    if (typeof e.statut !== "string" || !STATUTS_RANGEMENT.has(e.statut)) return null;
    if (!permutationComplete([...(e.reserve as number[]), ...(e.places as number[])], tailles[i])) return null;
    etats.push({
      reserve: e.reserve as number[],
      places: e.places as number[],
      statut: e.statut as EtatSerieRangement["statut"],
    });
    pose += (e.places as number[]).length;
  }

  if (pose === 0) return null;

  const pt = Array.isArray(etat.premiereTentative) ? (etat.premiereTentative as unknown[]) : null;
  if (!pt || pt.length !== tailles.length) return null;
  if (!pt.every((v) => v === null || typeof v === "boolean")) return null;

  return { etats, premiereTentative: pt as (boolean | null)[] };
}

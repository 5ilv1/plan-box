/**
 * Recaler les groupes d'une analyse grammaticale sur leur phrase.
 *
 * Un groupe est décrit deux fois : par son texte (`mots`) et par sa position
 * (`debut`/`fin`, index de MOTS dans `texte.split(/\s+/)`). Quand les deux ne
 * concordent pas, l'élève est piégé : la page lui demande de cliquer sur un
 * groupe, il clique exactement dessus, et la réponse est refusée — sans issue,
 * puisque la seule façon d'avancer est de trouver la bonne position.
 *
 * C'est arrivé en classe : « Les élèves courent dans la cour de récréation
 * chaque mardi. » attendait le CC de lieu aux mots 3 à 6 (« dans la cour de »)
 * au lieu de 3 à 7. Aucune sélection ne pouvait être acceptée.
 *
 * Le texte fait foi, jamais les index : c'est lui que l'enseignant relit, et
 * lui qui a un sens grammatical. On recalcule donc les positions à partir des
 * mots, et un groupe introuvable dans la phrase est ÉCARTÉ plutôt que servi —
 * même principe que `comparaison` et `rangement`, où une donnée non vérifiable
 * ne doit jamais atteindre l'élève.
 */

export interface GroupeAnalyse {
  mots: string;
  fonction: string;
  debut: number;
  fin: number;
}

export interface PhraseAnalyse {
  texte: string;
  groupes: GroupeAnalyse[];
}

/**
 * Forme comparable d'un fragment : la ponctuation et la casse ne comptent pas.
 *
 * Les accents, eux, sont conservés — « élèves » et « eleves » ne sont pas le
 * même mot, et rien n'oblige ici à confondre les deux.
 */
function normaliser(fragment: string): string {
  return fragment
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,;:!?"«»()…]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Toutes les fenêtres de mots consécutifs correspondant à `cible`, dans l'ordre. */
function fenetresPossibles(mots: string[], cible: string): Array<[number, number]> {
  const trouvees: Array<[number, number]> = [];
  const attendu = normaliser(cible);
  if (!attendu) return trouvees;

  for (let i = 0; i < mots.length; i++) {
    for (let j = i; j < mots.length; j++) {
      if (normaliser(mots.slice(i, j + 1).join(" ")) === attendu) trouvees.push([i, j]);
    }
  }
  return trouvees;
}

/**
 * Réaligne les groupes d'une phrase et écarte ceux qu'on ne sait pas placer.
 *
 * Les groupes déjà justes gardent leur place et la réservent : un groupe
 * déplacé ne peut pas venir se poser sur eux. À texte égal ailleurs dans la
 * phrase (« la classe … la classe »), c'est la première position libre qui
 * l'emporte, faute de mieux — un chevauchement, lui, serait une régression
 * visible à l'écran.
 */
export function recalerGroupes(texte: string, groupes: GroupeAnalyse[]): GroupeAnalyse[] {
  const mots = String(texte ?? "").split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [];

  const occupe = new Array(mots.length).fill(false);
  const libre = ([i, j]: [number, number]) => {
    for (let k = i; k <= j; k++) if (occupe[k]) return false;
    return true;
  };
  const reserver = ([i, j]: [number, number]) => {
    for (let k = i; k <= j; k++) occupe[k] = true;
  };

  const justes = new Map<number, GroupeAnalyse>();
  const aReplacer: number[] = [];

  // 1er passage : les groupes dont la position tient déjà debout.
  groupes.forEach((g, rang) => {
    const debut = Number(g?.debut);
    const fin = Number(g?.fin);
    const bornesValides =
      Number.isInteger(debut) && Number.isInteger(fin) &&
      debut >= 0 && fin >= debut && fin < mots.length;

    if (bornesValides && normaliser(mots.slice(debut, fin + 1).join(" ")) === normaliser(g.mots)) {
      justes.set(rang, { ...g, debut, fin });
      reserver([debut, fin]);
    } else {
      aReplacer.push(rang);
    }
  });

  // 2e passage : on cherche le texte du groupe dans la phrase.
  for (const rang of aReplacer) {
    const g = groupes[rang];
    const fenetres = fenetresPossibles(mots, g?.mots ?? "");
    const place = fenetres.find(libre) ?? fenetres[0];
    if (!place) continue; // introuvable → écarté, l'élève ne le verra pas
    justes.set(rang, { ...g, debut: place[0], fin: place[1] });
    reserver(place);
  }

  // L'ordre d'origine est conservé : c'est celui que l'enseignant a relu.
  return groupes.map((_, rang) => justes.get(rang)).filter((g): g is GroupeAnalyse => !!g);
}

/** Le même recalage sur une liste de phrases ; celles qui perdent tout sont retirées. */
export function recalerPhrases(phrases: PhraseAnalyse[]): PhraseAnalyse[] {
  if (!Array.isArray(phrases)) return [];
  return phrases
    .filter((p) => p && typeof p.texte === "string" && Array.isArray(p.groupes))
    .map((p) => ({ ...p, groupes: recalerGroupes(p.texte, p.groupes) }))
    .filter((p) => p.groupes.length > 0);
}

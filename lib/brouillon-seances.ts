/**
 * Le brouillon du panneau « Depuis ma programmation ».
 *
 * Engendrer une semaine prend trois à quatre minutes et coûte une quinzaine
 * d'appels au modèle. Tout ce travail vivait **en mémoire** jusqu'au clic sur
 * « Poser » : un rechargement de page l'effaçait sans laisser de trace. C'est
 * arrivé le 23/09 — un déploiement est passé en ligne pendant la génération,
 * Next.js a rechargé la page pour servir la nouvelle version, et quinze
 * exercices déjà engendrés ont disparu.
 *
 * Le brouillon garde, par semaine, ce que l'enseignant a choisi et ce qui a été
 * engendré. Il vit dans le navigateur (`localStorage`) : on engendre et on pose
 * sur le même poste, à quelques minutes d'intervalle — c'est ce rechargement-là
 * qu'il faut absorber, pas un changement d'ordinateur.
 *
 * La fusion est **pure** et testée (`docs/tests/test-brouillon-seances.mjs`) :
 * c'est elle qui décide quel contenu revient sur quelle ligne.
 */

/** Ce que l'enseignant a décidé ou obtenu sur une ligne — et rien d'autre. */
export interface EtatLigne {
  cle: string;
  choisie: boolean;
  type: string;
  sousMatiere: string;
  sousMatiereIncertaine: boolean;
  typesSuggeres: string[];
  statut: "attente" | "encours" | "ok" | "echec";
  contenu?: Record<string, unknown>;
  erreur?: string;
}

interface Brouillon {
  version: 1;
  enregistreLe: number;
  lignes: EtatLigne[];
}

/** Au-delà, la semaine est passée : le brouillon ne sert plus à rien. */
export const BROUILLON_PERIME_MS = 7 * 24 * 3600 * 1000;

export const cleBrouillon = (lundi: string) => `planbox:seances-brouillon:${lundi}`;

/** Y a-t-il quelque chose qui mérite d'être gardé ? */
export function brouillonUtile(lignes: EtatLigne[]): boolean {
  return lignes.some((l) => l.contenu !== undefined || l.statut === "encours");
}

/** Ne garde de chaque ligne que l'état de l'enseignant. */
export function extraireEtat<T extends EtatLigne>(lignes: T[]): EtatLigne[] {
  return lignes.map(({ cle, choisie, type, sousMatiere, sousMatiereIncertaine, typesSuggeres, statut, contenu, erreur }) => ({
    cle, choisie, type, sousMatiere, sousMatiereIncertaine, typesSuggeres, statut, contenu, erreur,
  }));
}

/**
 * Rapporte le brouillon sur les lignes fraîchement lues dans Notion.
 *
 * - Une ligne se retrouve par sa **clé** (séance × volet × niveau), pas par sa
 *   position : la programmation a pu bouger entre-temps.
 * - Une génération **interrompue** (`encours`) redevient `attente` : elle n'a
 *   jamais abouti, et « Engendrer » la reprendra avec les autres.
 * - Une ligne du brouillon dont la séance a disparu de Notion est abandonnée —
 *   on ne pose pas un exercice rattaché à une séance qui n'existe plus.
 *
 * Renvoie aussi le nombre d'exercices retrouvés, pour que l'écran le dise.
 */
export function fusionnerBrouillon<T extends EtatLigne>(
  fraiches: T[],
  brouillon: EtatLigne[] | null,
): { lignes: T[]; retrouves: number } {
  if (!brouillon || brouillon.length === 0) return { lignes: fraiches, retrouves: 0 };

  const parCle = new Map(brouillon.map((l) => [l.cle, l]));
  let retrouves = 0;

  const lignes = fraiches.map((f) => {
    const b = parCle.get(f.cle);
    if (!b) return f;
    const statut = b.statut === "encours" ? "attente" : b.statut;
    const contenu = statut === "ok" ? b.contenu : undefined;
    if (contenu) retrouves++;
    return {
      ...f,
      choisie: b.choisie,
      type: b.type,
      sousMatiere: b.sousMatiere,
      sousMatiereIncertaine: b.sousMatiereIncertaine,
      typesSuggeres: Array.isArray(b.typesSuggeres) && b.typesSuggeres.length > 0
        ? b.typesSuggeres
        : f.typesSuggeres,
      statut: statut === "ok" && !contenu ? "attente" : statut,
      contenu,
      erreur: statut === "echec" ? b.erreur : undefined,
    };
  });

  return { lignes, retrouves };
}

/** Lit le brouillon d'une semaine ; `null` s'il est absent, abîmé ou périmé. */
export function lireBrouillon(lundi: string, maintenant = Date.now()): EtatLigne[] | null {
  try {
    const brut = localStorage.getItem(cleBrouillon(lundi));
    if (!brut) return null;
    const b = JSON.parse(brut) as Brouillon;
    if (b?.version !== 1 || !Array.isArray(b.lignes)) return null;
    if (typeof b.enregistreLe !== "number" || maintenant - b.enregistreLe > BROUILLON_PERIME_MS) {
      effacerBrouillon(lundi);
      return null;
    }
    return b.lignes;
  } catch {
    // Stockage indisponible (navigation privée, quota) : on fait sans.
    return null;
  }
}

/** Enregistre le brouillon. Un échec ne doit jamais gêner la génération. */
export function sauverBrouillon(lundi: string, lignes: EtatLigne[]): void {
  try {
    if (!brouillonUtile(lignes)) {
      localStorage.removeItem(cleBrouillon(lundi));
      return;
    }
    const b: Brouillon = { version: 1, enregistreLe: Date.now(), lignes: extraireEtat(lignes) };
    localStorage.setItem(cleBrouillon(lundi), JSON.stringify(b));
  } catch {
    /* Quota dépassé ou stockage bloqué : on perd le filet, pas le travail. */
  }
}

export function effacerBrouillon(lundi: string): void {
  try {
    localStorage.removeItem(cleBrouillon(lundi));
  } catch {
    /* rien à faire */
  }
}

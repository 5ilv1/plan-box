/**
 * Ce qu'un élève a réellement fait d'un travail resté en cours.
 *
 * Il arrive qu'un exercice soit **infaisable** : un groupe mal placé dans une
 * analyse de phrase, une réponse attendue fautive, un énoncé qui se contredit.
 * L'élève a fait neuf questions sur dix et reste bloqué devant la dernière.
 * L'enseignant doit pouvoir clore ce travail **sans le pénaliser** : sa note
 * est 9/9 — ce qu'il a fait, et ce qu'il a réussi — et non 9/10, qui compterait
 * contre lui une question que personne ne pouvait résoudre.
 *
 * Ce module ne fait que **lire** : il dit ce qui est déjà su du travail, à
 * partir du bloc lui-même ou de l'état de reprise laissé en route. Il n'écrit
 * rien et ne décide rien — l'enseignant voit les deux nombres et les corrige
 * avant d'enregistrer. Un relevé qu'on ne sait pas établir vaut `null` : mieux
 * vaut une case vide qu'un chiffre inventé, puisque ce chiffre devient une note.
 */

export interface ProgresPartiel {
  /** Réponses justes parmi celles qui ont été données. */
  bon: number;
  /** Réponses données — **pas** le nombre de questions de l'exercice. */
  total: number;
  /** D'où vient le relevé, pour que l'écran puisse le dire. */
  source: "bloc" | "reprise";
}

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const entier = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/**
 * Le travail déjà noté sur le bloc.
 *
 * Un bloc peut être « en cours » **avec** un score : l'élève a terminé mais
 * sous le seuil de réussite. Dans ce cas il n'y a rien à recalculer, le relevé
 * est là — et c'est le score du premier essai qui fait foi, comme partout.
 */
export function progresDepuisBloc(contenu: unknown): ProgresPartiel | null {
  if (!estObjet(contenu)) return null;
  const bon = contenu.premier_score ?? contenu.score_eleve;
  const total = contenu.premier_score_total ?? contenu.score_total;
  if (!entier(bon) || !entier(total) || total === 0 || bon > total) return null;
  return { bon, total, source: "bloc" };
}

/**
 * Le travail en cours, lu dans l'état de reprise.
 *
 * Chaque activité range son avancement à sa façon ; la correspondance est ici,
 * en un seul endroit, et se teste sans base ni navigateur.
 *
 * `contenu` sert à retrouver la bonne réponse quand l'état ne la porte pas :
 * le signe attendu d'une comparaison, la catégorie d'un item. Ce sont des
 * comparaisons exactes, sans normalisation — là où il en faudrait une
 * (le texte à trous et ses élisions), on préfère rendre `null` plutôt que de
 * risquer un désaccord avec ce que l'élève a vu à l'écran.
 */
export function progresDepuisReprise(
  type: string,
  etat: unknown,
  contenu: unknown
): ProgresPartiel | null {
  if (!estObjet(etat)) return null;
  const c = estObjet(contenu) ? contenu : {};
  const releve = (bon: number, total: number): ProgresPartiel | null =>
    total > 0 && bon <= total ? { bon, total, source: "reprise" } : null;

  switch (type) {
    // ── Question par question : l'état dit tout ────────────────────────────
    case "exercice":
    case "eval": {
      if (!Array.isArray(etat.reponses) || !entier(etat.score)) return null;
      return releve(etat.score as number, etat.reponses.length);
    }

    case "analyse_phrase": {
      const s = etat.score;
      if (!estObjet(s) || !entier(s.bon) || !entier(s.total)) return null;
      return releve(s.bon as number, s.total as number);
    }

    // ── Relevé du premier essai, quand l'élève a déjà validé une fois ──────
    case "texte_a_trous": {
      // Sans relevé, on sait ce que l'élève a tapé mais pas si c'est juste :
      // la comparaison tient compte des élisions et vit dans le composant.
      // La refaire ici risquerait de contredire ce qu'il a vu à l'écran.
      return releveBooleen(etat.premierResultat);
    }

    case "classement": {
      const depuisReleve = releveBooleen(etat.premierResultat);
      if (depuisReleve) return depuisReleve;
      // Pas encore validé : la catégorie attendue est dans le contenu, et la
      // comparaison est exacte — aucune ambiguïté à trancher.
      const items = Array.isArray(c.items) ? (c.items as Record<string, unknown>[]) : null;
      if (!items || !estObjet(etat.classement)) return null;
      let bon = 0, total = 0;
      for (const [categorie, indices] of Object.entries(etat.classement)) {
        if (!Array.isArray(indices)) return null;
        for (const i of indices) {
          const item = entier(i) ? items[i as number] : undefined;
          if (!item) return null;
          total++;
          if (item.categorie === categorie) bon++;
        }
      }
      return releve(bon, total);
    }

    case "comparaison": {
      const depuisReleve = releveBooleen(etat.premiereTentative);
      if (depuisReleve) return depuisReleve;
      const paires = Array.isArray(c.paires) ? (c.paires as Record<string, unknown>[]) : null;
      if (!paires || !Array.isArray(etat.reponses)) return null;
      let bon = 0, total = 0;
      etat.reponses.forEach((r, i) => {
        if (r === null || r === undefined) return;
        total++;
        if (paires[i] && r === paires[i].signe) bon++;
      });
      return releve(bon, total);
    }

    case "rangement": {
      const depuisReleve = releveBooleen(etat.premiereTentative);
      if (depuisReleve) return depuisReleve;
      // Une série n'est jugée que si elle est entièrement posée : à moitié
      // rangée, elle ne dit rien.
      const series = Array.isArray(c.series) ? (c.series as Record<string, unknown>[]) : null;
      if (!series || !Array.isArray(etat.etats)) return null;
      let bon = 0, total = 0;
      etat.etats.forEach((e, i) => {
        const taille = Array.isArray(series[i]?.elements) ? (series[i].elements as unknown[]).length : 0;
        if (!estObjet(e) || !Array.isArray(e.places) || taille === 0) return;
        if (e.places.length !== taille) return;
        total++;
        if ((e.places as number[]).every((el, pos) => el === pos)) bon++;
      });
      return releve(bon, total);
    }

    default:
      return null;
  }
}

/** Un relevé « juste / faux » par question → (nombre de justes, nombre jugés). */
function releveBooleen(brut: unknown): ProgresPartiel | null {
  const valeurs = Array.isArray(brut)
    ? brut
    : estObjet(brut)
      ? Object.values(brut)
      : null;
  if (!valeurs) return null;
  let bon = 0, total = 0;
  for (const v of valeurs) {
    // `null` = pas encore jugé (une série de rangement jamais validée).
    if (v === null || v === undefined) continue;
    if (typeof v !== "boolean") return null;
    total++;
    if (v) bon++;
  }
  return total > 0 ? { bon, total, source: "reprise" } : null;
}

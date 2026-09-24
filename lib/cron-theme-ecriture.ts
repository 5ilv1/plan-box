// ── Le cron du thème d'écriture, rendu fiable ───────────────────────────────
//
// Il échouait environ un jour de classe sur deux (4 réussites sur 12 en
// septembre), sans trace : il appelait ses deux étapes par HTTP, ne vérifiait
// aucune réponse, et répondait « ok » quoi qu'il arrive. Désormais :
//
//  • les étapes sont des appels de fonction (`lib/theme-ecriture.ts`), plus des
//    allers-retours réseau vers l'URL publique ;
//  • chaque étape est REPRISE en cas d'échec — une erreur passagère du modèle
//    ou de la base ne doit pas coûter la journée ;
//  • le résultat est VÉRIFIÉ : des blocs existent-ils pour aujourd'hui ?
//  • chaque passage est journalisé (`lib/cron-journal.ts`), et un échec rend un
//    statut 500 — Vercel marque alors l'exécution comme échouée.
//
// L'orchestration reçoit ses dépendances : elle se teste sans base ni modèle
// (`docs/tests/test-cron-theme-ecriture.mjs`).

export interface DepsThemeDuJour {
  /** 0 = dimanche … 6 = samedi, à l'heure du cron. */
  jourSemaine: number;
  dernierMode: () => Promise<"jour" | "semaine">;
  /** Des blocs d'écriture existent-ils déjà — aujourd'hui, ou cette semaine en mode semaine ? */
  dejaPlanifie: (mode: "jour" | "semaine") => Promise<boolean>;
  generer: (mode: "jour" | "semaine") => Promise<{ id: string | null; sujet?: string }>;
  affecter: (themeId: string) => Promise<{ nb_eleves: number; deja_planifie?: boolean; deja_affecte?: boolean }>;
  /** Combien de blocs d'écriture pour aujourd'hui, une fois fait. */
  blocsDuJour: () => Promise<number>;
  /** Attente entre deux essais — injectée pour que les tests ne dorment pas. */
  attendre?: (ms: number) => Promise<void>;
}

export type ResultatThemeDuJour =
  | { statut: "ignore"; raison: string; tentatives: number }
  | { statut: "ok"; themeId: string; sujet?: string; nbEleves: number; nbBlocs: number; tentatives: number }
  | { statut: "echec"; erreur: string; tentatives: number };

/** Les jours de classe du cron : lundi, mardi, jeudi, vendredi. */
export const JOURS_DE_CLASSE: ReadonlySet<number> = new Set([1, 2, 4, 5]);

/** Nombre d'essais par étape, et l'attente avant chaque reprise. */
export const ATTENTES_REPRISE = [2000, 5000];

/**
 * Exécute `etape`, et la reprend après une attente si elle échoue — deux
 * reprises au plus. Compte les essais dans `compteur`.
 */
async function avecReprises<T>(
  etape: () => Promise<T>,
  compteur: { n: number },
  attendre: (ms: number) => Promise<void>,
): Promise<T> {
  let derniere: unknown;
  for (let essai = 0; essai <= ATTENTES_REPRISE.length; essai++) {
    if (essai > 0) await attendre(ATTENTES_REPRISE[essai - 1]);
    compteur.n++;
    try {
      return await etape();
    } catch (err) {
      derniere = err;
      console.error(`[cron theme-ecriture] essai ${essai + 1} échoué`, err);
    }
  }
  throw derniere;
}

export async function executerThemeDuJour(deps: DepsThemeDuJour): Promise<ResultatThemeDuJour> {
  const attendre = deps.attendre ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const essais = { n: 0 };

  if (!JOURS_DE_CLASSE.has(deps.jourSemaine)) {
    return { statut: "ignore", raison: "Pas un jour de classe", tentatives: 0 };
  }

  try {
    const mode = await deps.dernierMode();
    if (mode === "semaine" && deps.jourSemaine !== 1) {
      return { statut: "ignore", raison: "Mode semaine — génération uniquement le lundi", tentatives: 0 };
    }
    if (await deps.dejaPlanifie(mode)) {
      return { statut: "ignore", raison: "Des blocs d'écriture existent déjà (planifiés d'avance)", tentatives: 0 };
    }

    const theme = await avecReprises(async () => {
      const t = await deps.generer(mode);
      // Un thème sans identifiant n'est pas un thème : l'ancien cron passait
      // `undefined` à l'affectation, qui échouait sans bruit.
      if (!t?.id) throw new Error("La génération n'a pas rendu de thème");
      return t;
    }, essais, attendre);

    const affectation = await avecReprises(() => deps.affecter(theme.id!), essais, attendre);

    // La preuve, pas la promesse : des blocs existent-ils pour aujourd'hui ?
    const nbBlocs = await deps.blocsDuJour();
    if (nbBlocs === 0) {
      return {
        statut: "echec",
        erreur: `Affectation annoncée (${affectation.nb_eleves} élève(s)) mais aucun bloc pour aujourd'hui`,
        tentatives: essais.n,
      };
    }
    return {
      statut: "ok", themeId: theme.id!, sujet: theme.sujet,
      nbEleves: affectation.nb_eleves, nbBlocs, tentatives: essais.n,
    };
  } catch (err) {
    return { statut: "echec", erreur: (err as Error)?.message ?? String(err), tentatives: essais.n };
  }
}

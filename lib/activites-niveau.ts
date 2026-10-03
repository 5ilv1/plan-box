// ── Activités sur tablette, par niveau ──────────────────────────────────────
//
// Certains élèves préfèrent travailler sur leur cahier. L'enseignant éteint,
// niveau par niveau, trois activités quotidiennes faites sur tablette : le
// problème du jour, l'écriture et le calcul du jour.
//
// Deux réglages, une seule grille dans Paramètres :
//  • problème du jour et écriture : `reglage.activites_tablette`, qui ne
//    garde que ce qui est ÉTEINT — une clé absente vaut allumé, comme avant ;
//  • calcul du jour : `calcul_jour_config.actif`, l'interrupteur qui existait
//    déjà sur la page du calcul du jour. Un second réglage pour la même chose
//    aurait fait deux vérités.
//
// Module PUR. Contrat : `npx tsx docs/tests/test-activites-niveau.mjs`.

export const NIVEAUX_ACTIVITES = ["CE2", "CM1", "CM2"] as const;
export type NiveauActivite = (typeof NIVEAUX_ACTIVITES)[number];

/** Les activités stockées dans `reglage.activites_tablette`. */
export const ACTIVITES_REGLAGE = ["probleme_du_jour", "ecriture"] as const;
export type ActiviteReglage = (typeof ACTIVITES_REGLAGE)[number];

export type ActiviteTablette = ActiviteReglage | "calcul_du_jour";

export const CLE_REGLAGE_ACTIVITES = "activites_tablette";

/** { activité: { niveau: false } } — seul ce qui est éteint est écrit. */
export type ReglageActivites = Partial<Record<ActiviteReglage, Partial<Record<NiveauActivite, boolean>>>>;

export function estNiveau(n: unknown): n is NiveauActivite {
  return typeof n === "string" && (NIVEAUX_ACTIVITES as readonly string[]).includes(n);
}

/**
 * Relit la valeur brute de `reglage` : tout ce qui n'a pas la forme attendue
 * est ignoré, donc ALLUMÉ. Un réglage illisible ne doit pas priver une classe
 * de son travail.
 */
export function lireReglageActivites(valeur: unknown): ReglageActivites {
  const sortie: ReglageActivites = {};
  if (!valeur || typeof valeur !== "object") return sortie;
  for (const activite of ACTIVITES_REGLAGE) {
    const parNiveau = (valeur as Record<string, unknown>)[activite];
    if (!parNiveau || typeof parNiveau !== "object") continue;
    for (const niveau of NIVEAUX_ACTIVITES) {
      if ((parNiveau as Record<string, unknown>)[niveau] === false) {
        (sortie[activite] ??= {})[niveau] = false;
      }
    }
  }
  return sortie;
}

/** Un niveau inconnu (CE1, groupe sans niveau) n'est jamais éteint. */
export function activiteAllumee(reglage: ReglageActivites, activite: ActiviteReglage, niveau: string | null | undefined): boolean {
  if (!estNiveau(niveau)) return true;
  return reglage[activite]?.[niveau] !== false;
}

/** Le réglage après un basculement. Rallumer RETIRE la clé : le défaut reste « allumé ». */
export function basculer(reglage: ReglageActivites, activite: ActiviteReglage, niveau: NiveauActivite, allume: boolean): ReglageActivites {
  const sortie = lireReglageActivites(reglage);
  const parNiveau = { ...(sortie[activite] ?? {}) };
  if (allume) delete parNiveau[niveau];
  else parNiveau[niveau] = false;
  if (Object.keys(parNiveau).length > 0) sortie[activite] = parNiveau;
  else delete sortie[activite];
  return sortie;
}

/** Le niveau d'un élève d'après les noms de ses groupes (« CM1 », « CE2 »…). */
export function niveauDesGroupes(noms: Array<string | null | undefined>): NiveauActivite | null {
  for (const nom of noms) {
    const m = (nom ?? "").toUpperCase().match(/CE2|CM1|CM2/);
    if (m) return m[0] as NiveauActivite;
  }
  return null;
}

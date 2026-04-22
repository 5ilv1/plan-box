/**
 * Normalisation du contenu des blocs d'atelier d'écriture (mode semaine).
 *
 * Nouveau modèle :
 *   - texte_courant : le seul texte éditable par l'élève durant la semaine
 *   - historique : snapshot automatique par jour, pour permettre à l'enseignant
 *                  de suivre l'évolution du texte
 *   - annotations : corrections/suggestions posées par l'enseignant sur un
 *                   passage précis (modèle inspiré de l'app Plume)
 *   - texte_final : texte validé le vendredi via le bouton « Envoyer »
 *   - date_envoi  : date ISO de l'envoi
 *
 * Ancien modèle (conservé pour rollback) : texte_jour1..3, erreurs_jour2..4.
 * La normalisation reconstruit l'historique à partir de ces champs si présents.
 */

export interface AnnotationEnseignant {
  id: string;
  date: string; // ISO YYYY-MM-DD
  debut: number;
  fin: number;
  extrait: string;
  suggestion: string;
  commentaire?: string;
  statut: "nouvelle" | "lue" | "acceptee" | "ignoree";
}

export interface HistoriqueEntry {
  date: string; // ISO YYYY-MM-DD
  texte: string;
}

export interface ContenuEcritureSemaine {
  mode: "semaine";
  sujet: string;
  contrainte: string;
  afficher_contrainte?: boolean;
  instructions?: string;
  texte_courant: string;
  historique: HistoriqueEntry[];
  annotations: AnnotationEnseignant[];
  texte_final: string;
  date_envoi: string | null;
  /** Date de verrouillage définitif (vendredi). Une fois posée, le texte
   *  ne peut plus être modifié par l'élève. */
  date_version_finale?: string | null;
  // Anciens champs — conservés pour rollback tant qu'on n'a pas fait le cleanup
  texte_jour1?: string;
  texte_jour2?: string;
  texte_jour3?: string;
  erreurs_jour2?: unknown[];
  erreurs_jour3?: unknown[];
  erreurs_jour4?: unknown[];
}

export function dateStr(d: Date = new Date()): string {
  return d.toISOString().split("T")[0];
}

/**
 * Normalise un contenu de bloc écriture mode semaine.
 * Reconstruit texte_courant / historique / annotations si absents.
 * N'altère rien si déjà au nouveau format.
 */
export function normaliserContenuEcriture(
  contenu: Record<string, unknown> | null | undefined
): ContenuEcritureSemaine {
  const c = (contenu ?? {}) as Record<string, unknown>;

  const mode = (c.mode as string) === "semaine" ? "semaine" : "semaine";
  const sujet = (c.sujet as string) ?? "";
  const contrainte = (c.contrainte as string) ?? "";
  const afficher_contrainte = c.afficher_contrainte !== false;
  const instructions = (c.instructions as string) ?? "";

  // Anciens champs
  const t1 = (c.texte_jour1 as string) ?? "";
  const t2 = (c.texte_jour2 as string) ?? "";
  const t3 = (c.texte_jour3 as string) ?? "";
  const tf = (c.texte_final as string) ?? "";

  // texte_courant : déjà présent → on garde ; sinon on reconstruit depuis le plus récent
  let texte_courant = (c.texte_courant as string | undefined);
  if (texte_courant === undefined) {
    texte_courant = tf || t3 || t2 || t1 || "";
  }

  // historique : déjà présent → on garde ; sinon reconstruit depuis t1/t2/t3
  let historique = c.historique as HistoriqueEntry[] | undefined;
  if (!Array.isArray(historique)) {
    historique = [];
    // Dates estimées relative à aujourd'hui (on n'a pas la vraie date d'écriture)
    // On empile dans l'ordre chronologique présumé : J1 lundi, J2 mardi, J3 jeudi
    const now = new Date();
    const day = now.getDay();
    // Lundi de cette semaine
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const addDays = (d: Date, n: number) => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r;
    };
    if (t1.trim()) historique.push({ date: dateStr(monday), texte: t1 });
    if (t2.trim()) historique.push({ date: dateStr(addDays(monday, 1)), texte: t2 });
    if (t3.trim()) historique.push({ date: dateStr(addDays(monday, 3)), texte: t3 });
  }

  // annotations : déjà présent → on garde ; sinon []
  let annotations = c.annotations as AnnotationEnseignant[] | undefined;
  if (!Array.isArray(annotations)) annotations = [];

  // date_envoi
  let date_envoi = (c.date_envoi as string | null | undefined) ?? null;
  if (!date_envoi && tf.trim().length > 0) {
    // Si texte_final existe déjà (ancien bloc envoyé), on met la date d'aujourd'hui faute de mieux
    date_envoi = dateStr();
  }

  const date_version_finale = (c.date_version_finale as string | null | undefined) ?? null;

  return {
    mode: "semaine",
    sujet,
    contrainte,
    afficher_contrainte,
    instructions,
    texte_courant,
    historique,
    annotations,
    texte_final: tf,
    date_envoi,
    date_version_finale,
    // On conserve les anciens champs tels quels
    texte_jour1: t1,
    texte_jour2: t2,
    texte_jour3: t3,
    erreurs_jour2: (c.erreurs_jour2 as unknown[]) ?? [],
    erreurs_jour3: (c.erreurs_jour3 as unknown[]) ?? [],
    erreurs_jour4: (c.erreurs_jour4 as unknown[]) ?? [],
  };
}

/**
 * Ajoute ou met à jour l'entrée du jour dans l'historique.
 * - Si la date n'est pas présente → nouvelle entrée
 * - Si la date est présente → on remplace le texte de ce jour
 */
export function majHistorique(
  historique: HistoriqueEntry[],
  texte: string,
  date: string = dateStr()
): HistoriqueEntry[] {
  const existant = historique.findIndex((h) => h.date === date);
  if (existant >= 0) {
    const copy = [...historique];
    copy[existant] = { date, texte };
    return copy;
  }
  return [...historique, { date, texte }];
}

/**
 * Normalise pour n'importe quel bloc (safe même si ce n'est pas du mode semaine).
 * Retourne null si le bloc n'est pas un atelier mode semaine.
 */
export function extraireContenuSemaine(
  contenu: Record<string, unknown> | null | undefined
): ContenuEcritureSemaine | null {
  if (!contenu || (contenu as Record<string, unknown>).mode !== "semaine") return null;
  return normaliserContenuEcriture(contenu);
}

export function estVendredi(d: Date = new Date()): boolean {
  return d.getDay() === 5;
}

/**
 * Déblocage progressif du tableau de bord élève.
 *
 * Étape 1 — le travail du jour seul.
 * Étape 2 — le jour terminé, les retards apparaissent.
 * Étape 3 — les retards récents rattrapés, tout le reste : podcasts, ceintures,
 *           lecture, Motus, cartes Repetibox, reste de la semaine.
 *
 * But premier : la concentration — un CE2 qui voit Motus avant ses exercices
 * joue à Motus. But second : ce qui n'est pas affiché n'est pas chargé, et le
 * quota Vercel gratuit est compté.
 *
 * Réglage enseignant `deblocage_progressif` (table `reglage`), désactivé par
 * défaut : désactivé, l'élève est toujours à l'étape 3, comme avant.
 *
 * Module PUR : aucun accès réseau ni base. Contrat :
 * `npx tsx docs/tests/test-deblocage-eleve.mjs`.
 */

export type Etape = 1 | 2 | 3;

/** Les retards plus anciens restent visibles mais ne bloquent pas l'étape 3. */
export const JOURS_RETARD_BLOQUANTS = 7;

type BlocMinimal = {
  type: string;
  statut: string;
  date_assignation: string;
  periodicite?: string | null;
  contenu?: unknown;
};

/**
 * La date à partir de laquelle un retard compte. Un travail « de la semaine »
 * est daté de son lundi mais dû pour son vendredi : compté depuis le lundi,
 * celui de la semaine dernière aurait déjà plus de 7 jours le mercredi, et ne
 * bloquerait jamais.
 */
export function dateEcheance(bloc: BlocMinimal): string {
  return bloc.periodicite === "semaine" ? reculerJours(bloc.date_assignation, -4) : bloc.date_assignation;
}

/**
 * Un atelier d'écriture de la semaine ne se termine que le vendredi : il ne
 * bloque pas, mais l'élève doit y avoir TRAVAILLÉ aujourd'hui. `historique`
 * garde une entrée par jour de sauvegarde (`lib/ecriture-normaliser.ts`,
 * `majHistorique()`, date `YYYY-MM-DD` de `dateStr()`).
 */
export function atelierTravailleAujourdhui(bloc: BlocMinimal, dateUtc: string): boolean {
  if (bloc.statut === "fait") return true;
  const c = (bloc.contenu ?? {}) as { date_envoi?: string | null; historique?: Array<{ date?: string; texte?: string }> };
  if (c.date_envoi) return true;
  return Array.isArray(c.historique)
    && c.historique.some((h) => h?.date === dateUtc && typeof h.texte === "string" && h.texte.trim().length > 0);
}

export function estAtelierSemaine(bloc: BlocMinimal): boolean {
  return bloc.type === "ecriture" && (bloc.contenu as { mode?: string } | undefined)?.mode === "semaine";
}

/** `YYYY-MM-DD` moins n jours, calculé en UTC (piège nº 7). */
export function reculerJours(date: string, n: number): string {
  const [a, m, j] = date.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j - n));
  return d.toISOString().slice(0, 10);
}

export function etapeDeblocage(p: {
  actif: boolean;
  /** Barre « Progression du jour » : tâches faites et total (même calcul). */
  faitsJour: number;
  totalJour: number;
  /** Blocs du panier « Aujourd'hui » (pour y trouver les ateliers de la semaine). */
  blocsAujourdhui: BlocMinimal[];
  /** Panier « En retard » (déjà non faits), filtré sur les types comptés par l'appelant. */
  retards: BlocMinimal[];
  /** Date du jour à Paris, `YYYY-MM-DD`. */
  aujourdhui: string;
  /** Date du jour UTC, celle de l'historique d'écriture. */
  aujourdhuiUtc: string;
}): { etape: Etape; resteJour: number; resteRetards: number } {
  const ateliersNonTravailles = p.blocsAujourdhui
    .filter(estAtelierSemaine)
    .filter((b) => !atelierTravailleAujourdhui(b, p.aujourdhuiUtc)).length;
  const resteJour = Math.max(0, p.totalJour - p.faitsJour) + ateliersNonTravailles;

  const limite = reculerJours(p.aujourdhui, JOURS_RETARD_BLOQUANTS);
  const resteRetards = p.retards.filter((b) => b.statut !== "fait" && dateEcheance(b) >= limite).length;

  if (!p.actif) return { etape: 3, resteJour, resteRetards };
  if (resteJour > 0) return { etape: 1, resteJour, resteRetards };
  if (resteRetards > 0) return { etape: 2, resteJour, resteRetards };
  return { etape: 3, resteJour, resteRetards };
}

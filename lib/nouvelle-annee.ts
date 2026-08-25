/**
 * Remise à zéro de fin d'année scolaire.
 *
 * Principe : on efface TOUT le travail des élèves (blocs assignés, résultats,
 * progressions, choix de bibliothèque) mais on CONSERVE les contenus créés par
 * l'enseignant (chapitres, exercices, livres, leçons, podcasts, banques), qui
 * restent réutilisables l'année suivante.
 *
 * ⚠️ Plan Box et Repetibox partagent la même base Supabase. Les tables
 * Repetibox (carte, flash_session, badge_eleve, progression, etudiant, eleve,
 * groupe_eleve, qr_tokens, problem_attempts, math_problems) ne sont JAMAIS
 * touchées ici : les vider casserait Repetibox.
 */

export const CONFIRMATION_ATTENDUE = "NOUVELLE ANNEE";

/**
 * Tables de travail élève, vidées intégralement.
 * L'ordre respecte les clés étrangères : enfants d'abord.
 */
export const TABLES_TRAVAIL_ELEVE = [
  { table: "dictee_correction_feedback", label: "Retours de correction de dictée" },
  { table: "qcm_reponse",                label: "Réponses aux QCM (podcasts)" },
  { table: "exercice_resultat",          label: "Résultats d'exercices" },
  { table: "evaluation_resultat",        label: "Résultats d'évaluations" },
  { table: "calcul_jour_resultat",       label: "Résultats du calcul du jour" },
  { table: "pb_progression",             label: "Progressions par chapitre" },
  { table: "notifications",              label: "Notifications" },
  { table: "eleve_bibliotheque_choix",   label: "Livres choisis en bibliothèque" },
  { table: "plan_travail",               label: "Blocs de travail assignés" },
  { table: "chapitre_assignation",       label: "Assignations de chapitres aux groupes" },
] as const;

/**
 * Suppressions optionnelles de contenus, cochées au cas par cas par
 * l'enseignant (une matière abandonnée cette année, par exemple).
 */
export const OPTIONS_CONTENUS = [
  {
    cle: "dictees",
    label: "Dictées",
    description: "Supprime toutes les dictées générées.",
  },
  {
    cle: "ma_ptite_regle",
    label: "Ma P'tite Règle",
    description: "Supprime les chapitres du rituel d'orthographe et leurs exercices.",
  },
  {
    cle: "themes_ecriture",
    label: "Thèmes d'écriture",
    description: "Supprime les sujets d'atelier d'écriture de l'année écoulée.",
  },
] as const;

export type CleOptionContenu = (typeof OPTIONS_CONTENUS)[number]["cle"];

/** Marqueur de sous_matiere identifiant les chapitres Ma P'tite Règle. */
export const SOUS_MATIERE_RITUEL = "rituel-orthographe";

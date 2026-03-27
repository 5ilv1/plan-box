// ============================================
// Types Plan Box
// ============================================

// --- Génération IA ---

export interface QuestionExercice {
  id: number;
  enonce: string;
  reponse_attendue: string;
  indice?: string;
}

export interface ExerciceIA {
  titre: string;
  consigne: string;
  questions: QuestionExercice[];
}

export interface CalcMentalIA {
  // Format classique (calculs fixes générés par IA)
  calculs?: { id: number; enonce: string; reponse: string }[];
  // Nouveau format (modèles aléatoires — regénérés à chaque session)
  modeles?: Record<string, unknown>[];
  nb_calculs?: number;
  operations?: string[];
}

// Sélection d'assignation multi-cible (groupes + élèves individuels)
export interface AssignationSelecteur {
  groupeIds: string[];       // IDs des groupes cochés
  eleveUids: string[];       // UIDs préfixés des élèves individuels ("pb_UUID" ou "rb_5")
  groupeNoms: string[];      // Noms des groupes sélectionnés (pour le contexte IA)
  touteClasse?: boolean;     // true si sélection via "Toute la classe"
}

export interface ParamsExercice {
  type: "exercice";
  matiere: string;
  niveauNom: string;
  chapitreId: string | null;
  chapitreTitre: string;
  nbQuestions: number;
  difficulte: "facile" | "moyen" | "difficile";
  contexte: string;
  consigneDetaillee?: string;
  modele: string;
  pdfModeleBase64?: string;
  assignation: AssignationSelecteur;
  dateAssignation: string;
  dateLimite: string;
  periodicite?: "jour" | "semaine";
}

export interface ParamsCalcMental {
  type: "calcul_mental";
  niveauNom: string;
  operations: string[];
  table: string;
  nbCalculs: number;
  difficulte: "facile" | "moyen" | "difficile";
  assignation: AssignationSelecteur;
  dateAssignation: string;
  dateLimite: string;
  periodicite?: "jour" | "semaine";
}

export interface ParamsRessource {
  type: "ressource";
  titre: string;
  assignation: AssignationSelecteur;
  dateAssignation: string;
  dateLimite: string;
  periodicite?: "jour" | "semaine";
  contenu: RessourceIA;
}

// --- Texte à trous ---

export interface TrouDef {
  position: number;       // index du mot dans le texte splitté
  mot: string;            // mot attendu
  indice?: string;        // indice optionnel
}

export interface TexteATrousIA {
  titre: string;
  consigne: string;
  texte_complet: string;  // texte avec tous les mots
  trous: TrouDef[];
}

export interface ParamsTexteATrous {
  type: "texte_a_trous";
  niveau: string;
  objectif: string;       // ex: "conjugaison passé composé", "homophones a/à"
  texte_manuel?: string;  // si l'enseignant écrit lui-même avec [mot]
  description?: string;   // pour la génération IA
  assignation: AssignationSelecteur;
  dateAssignation: string;
  dateLimite: string;
  periodicite?: "jour" | "semaine";
  pdfBase64?: string;
}

// --- Classement par catégories ---

export interface ClassementItem {
  texte: string;
  categorie: string;
}

export interface ClassementIA {
  titre: string;
  consigne: string;
  categories: string[];
  couleurs?: string[];
  items: ClassementItem[];
}

// --- Lecture + QCM ---

export interface LectureQuestion {
  id: number;
  question: string;
  choix: string[];
  reponse: number; // index de la bonne réponse dans choix[]
}

export interface LectureIA {
  titre: string;
  texte: string;
  questions: LectureQuestion[];
}

// --- Analyse de phrase ---

export type FonctionGram = "Sujet" | "Verbe" | "COD" | "COI" | "CC Lieu" | "CC Temps" | "CC Manière" | "Attribut";

export const FONCTIONS_COULEURS: Record<FonctionGram, string> = {
  "Sujet":       "#2563EB",  // bleu
  "Verbe":       "#DC2626",  // rouge
  "COD":         "#D97706",  // orange
  "COI":         "#D97706",  // orange
  "CC Lieu":     "#16A34A",  // vert
  "CC Temps":    "#16A34A",  // vert
  "CC Manière":  "#16A34A",  // vert
  "Attribut":    "#7C3AED",  // violet
};

export const FONCTIONS_DEFAUT: Record<string, FonctionGram[]> = {
  CE2: ["Sujet", "Verbe", "CC Lieu", "CC Temps", "CC Manière"],
  CM1: ["Sujet", "Verbe", "COD", "COI", "CC Lieu", "CC Temps", "CC Manière"],
  CM2: ["Sujet", "Verbe", "COD", "COI", "CC Lieu", "CC Temps", "CC Manière"],
};

export interface GroupePhrase {
  mots: string;
  fonction: FonctionGram;
  debut: number;  // index du premier mot
  fin: number;    // index du dernier mot
}

export interface PhraseAnalyse {
  texte: string;
  groupes: GroupePhrase[];
}

export interface AnalysePhraseIA {
  titre: string;
  consigne: string;
  phrases: PhraseAnalyse[];
}

// --- Dictées ---

export interface PhraseDict {
  id: number;
  texte: string;
}

export interface MotDict {
  mot: string;
  definition: string;
  pronom?: string; // pronom personnel pour les verbes conjugués (ex: "ils" pour "aideront")
}

export interface NiveauDict {
  etoiles: 1 | 2 | 3 | 4;
  label: string;           // "CE2", "CM1", "CM2", "CM2 renforcé"
  texte: string;
  phrases: PhraseDict[];
  mots: MotDict[];
  points_travailles: string[];
}

export interface DicteeIAGroupee {
  titre: string;
  niveaux: NiveauDict[];  // 4 éléments
}

// Stocké dans plan_travail.contenu pour type="dictee"
export interface DicteeContenu {
  niveau_etoiles: 1 | 2 | 3 | 4;
  titre: string;
  texte: string;
  phrases: (PhraseDict & { audio_url?: string })[];
  audio_complet_url?: string | null;
  audio_phrases_urls?: { id: number; url: string | null }[];
  mots: MotDict[];
  dictee_parent_id?: string;
}

// Stocké dans plan_travail.contenu pour type="mots"
export interface MotsContenu {
  mots: MotDict[];
  titre_dictee: string;
}

export type DifficulteNiveau = "standard" | "exigeant" | "expert";

export interface ParamsDictee {
  type: "dictee";
  theme: string;
  tempsVerbaux: string[];
  pointsGrammaticaux: string[];
  nbDictees: 1 | 2 | 3 | 4;
  // Difficulté indépendante par niveau d'étoiles
  difficulteParNiveau: Record<1 | 2 | 3 | 4, DifficulteNiveau>;
  assignation: AssignationSelecteur;
  dateAssignation: string;
  dateLimite: string;
  periodicite?: "jour" | "semaine";
}

export type ParamsGeneration = ParamsExercice | ParamsCalcMental | ParamsRessource | ParamsDictee;

export interface BanqueExercice {
  id: string;
  type: "exercice" | "calcul_mental" | "ressource";
  matiere: string | null;
  niveau_id: string | null;
  chapitre_id: string | null;
  titre: string | null;
  contenu: Record<string, unknown>;
  nb_utilisations: number;
  created_at: string;
  niveaux?: { nom: string };
  chapitres?: { titre: string };
}

export interface Niveau {
  id: string;
  nom: "CE2" | "CM1" | "CM2";
}

export interface Groupe {
  id: string;
  nom: string;
  created_at: string;
  // Jointures optionnelles
  membres?: (Eleve & { niveaux?: Niveau })[];
  nb_membres?: number;
}

export interface EleveGroupe {
  eleve_id: string;
  groupe_id: string;
}

export interface Eleve {
  id: string; // UUID Supabase auth
  prenom: string;
  nom: string;
  niveau_id: string;
  created_at: string;
  // Jointures optionnelles
  niveaux?: Niveau;
}

export interface Chapitre {
  id: string;
  titre: string;
  matiere: string; // 'maths', 'français', etc.
  sous_matiere?: string | null; // ex. 'Calcul', 'Numération', 'Géométrie'
  niveau_id: string;
  ordre: number | null;
  description?: string | null;
  nb_cartes_eval?: number;   // nombre de questions pour l'éval (défaut 20)
  seuil_reussite?: number;   // % minimum pour valider (défaut 90)
  created_at: string;
  // Jointures optionnelles
  niveaux?: Niveau;
}

// Évaluation finale d'un chapitre — même format qu'ExerciceIA
export type EvalIA = ExerciceIA;

export type TypeBloc =
  | "exercice"
  | "calcul_mental"
  | "mots"
  | "dictee"
  | "media"
  | "eval"
  | "libre"
  | "ressource"
  | "repetibox"
  | "fichier_maths"
  | "lecon_copier"
  | "ecriture"
  | "texte_a_trous"
  | "analyse_phrase"
  | "classement"
  | "lecture";

export type SousTypeRessource =
  | "video"
  | "podcast"
  | "exercice_en_ligne"
  | "exercice_papier";

export interface TacheRessource {
  sous_type: SousTypeRessource;
  label?: string;        // Étiquette de l'étape (ex. "Regarder la vidéo")
  texte?: string;        // Consignes / description
  url?: string;          // Lien web
  reference?: string;    // Numéro et page (exercice papier)
  transcription?: string; // Pour podcast : transcription texte (permet de générer un QCM)
}

// Question à choix multiple pour le QCM podcast
export interface QCMQuestion {
  question: string;
  options: string[];       // exactement 4 options
  reponse_correcte: number; // index 0-3
  explication?: string;
}

export interface RessourceIA {
  // Nouveau format multi-tâches
  taches?: TacheRessource[];
  // Ancien format (backward compat — champs plats)
  sous_type?: SousTypeRessource;
  matiere?: string;
  texte?: string;
  url?: string;
  reference?: string;
  // QCM associé (généré depuis la transcription d'un podcast)
  qcm?: QCMQuestion[];
  qcm_id?: string;  // UUID partagé entre tous les élèves pour le même QCM (leaderboard)
}

export type StatutBloc = "a_faire" | "en_cours" | "fait";

export interface PlanTravail {
  id: string;
  eleve_id: string;
  titre: string;
  type: TypeBloc;
  contenu: Record<string, unknown> | null;
  date_assignation: string; // ISO date
  date_limite: string | null;
  periodicite?: "jour" | "semaine"; // 'jour' = affiché ce jour précis, 'semaine' = affiché toute la semaine
  statut: StatutBloc;
  chapitre_id: string | null;
  created_at: string;
  // Jointures optionnelles
  chapitres?: Chapitre;
  eleves?: Eleve;
}

export type StatutProgression = "en_cours" | "valide" | "remediation";

// NB : table "pb_progression" dans Supabase (évite conflit avec table "progression" de Repetibox)
export interface Progression {
  id: string;
  eleve_id: string;
  chapitre_id: string;
  pourcentage: number;
  statut: StatutProgression;
  updated_at: string;
  // Jointures optionnelles
  chapitres?: Chapitre;
  eleves?: Eleve;
}

export type TypeNotification =
  | "chapitre_valide"
  | "eval_echec"
  | "eleve_bloque"
  | "eval_prete";

export interface Notification {
  id: string;
  type: TypeNotification;
  eleve_id: string;
  chapitre_id: string | null;
  message: string | null;
  lu: boolean;
  created_at: string;
  // Jointures optionnelles
  eleves?: Eleve;
  chapitres?: Chapitre;
}

// Vue synthétique pour le dashboard enseignant
export interface EleveAvecProgression extends Eleve {
  progressions: Progression[];
  chapitreEnCours?: Chapitre & { pourcentage: number };
  statutGlobal: StatutProgression;
}

// Icônes et libellés par type de bloc
export const TYPE_BLOC_CONFIG: Record<
  TypeBloc,
  { icone: string; libelle: string; couleur: string }
> = {
  exercice:      { icone: "edit_note",    libelle: "Exercice",      couleur: "#2563EB" },
  calcul_mental: { icone: "calculate",    libelle: "Calcul mental", couleur: "#7C3AED" },
  mots:          { icone: "spellcheck",   libelle: "Mots de la dictée", couleur: "#D97706" },
  dictee:        { icone: "headphones",   libelle: "Dictée",        couleur: "#D97706" },
  media:         { icone: "play_circle",  libelle: "Média",         couleur: "#059669" },
  eval:          { icone: "quiz",         libelle: "Évaluation",    couleur: "#DC2626" },
  libre:         { icone: "draw",         libelle: "Libre",         couleur: "#6B7280" },
  ressource:      { icone: "open_in_new",  libelle: "Ressource",       couleur: "#0891B2" },
  repetibox:      { icone: "style",        libelle: "Repetibox",       couleur: "#7C3AED" },
  fichier_maths:  { icone: "square_foot",  libelle: "Fichier de maths", couleur: "#0F766E" },
  lecon_copier:   { icone: "menu_book",    libelle: "Leçon à copier",  couleur: "#7C2D12" },
  ecriture:       { icone: "edit",         libelle: "Écriture créative", couleur: "#7C3AED" },
  texte_a_trous:  { icone: "text_fields", libelle: "Texte à trous",    couleur: "#0E7490" },
  analyse_phrase: { icone: "schema",      libelle: "Analyse de phrase", couleur: "#6D28D9" },
  classement:     { icone: "category",    libelle: "Classement",        couleur: "#0369A1" },
  lecture:         { icone: "auto_stories", libelle: "Lecture",          couleur: "#7C3AED" },
};

export const STATUT_BLOC_CONFIG: Record<
  StatutBloc,
  { libelle: string; classe: string }
> = {
  a_faire:  { libelle: "À faire",  classe: "badge-warning" },
  en_cours: { libelle: "En cours", classe: "badge-primary" },
  fait:     { libelle: "Fait",     classe: "badge-success" },
};

export const NIVEAU_CLASSE: Record<string, string> = {
  CE2: "badge-ce2",
  CM1: "badge-cm1",
  CM2: "badge-cm2",
};

/**
 * Agrégation des résultats par sous-domaine pédagogique pour la page de
 * suivi (élève seul + classe). Cumule TOUTES les sources :
 *   - exercice_resultat (exos liés à un chapitre, mappés par sous_matiere)
 *   - evaluation_resultat (évals de chapitre)
 *   - plan_travail.contenu.score_eleve/score_total (blocs hors chapitre :
 *     dictée, mots, calcul_mental, probleme_maths)
 *   - calcul_jour_resultat (1/1 par essai correct)
 *
 * Renvoie un dictionnaire { libelle → { score, nb_essais } }.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScoreSousDomaine {
  score: number | null; // 0-100, null si aucun essai
  nb_essais: number; // nb d'évaluations cumulées
}

export type CarteDomaines = Record<string, ScoreSousDomaine>;

/** Cibles d'élèves pour les filtres SQL */
export interface CibleEleves {
  pb_ids: string[]; // UUIDs auth
  rb_ids: number[]; // entiers Repetibox
}

/** Mapping sous_matiere DB → libellé canonique côté UI */
function libelleSousMatiere(sm: string | null): string | null {
  if (!sm) return null;
  const norm = sm.trim();
  if (norm === "Conjugaison") return "Conjugaison";
  if (norm === "Grammaire") return "Grammaire";
  if (norm === "Vocabulaire") return "Vocabulaire";
  if (norm === "rituel-orthographe" || norm === "Orthographe") return "Orthographe";
  if (norm === "Écriture" || norm === "Ecriture") return "Écriture";
  if (norm === "Calcul" || norm === "Calcul mental") return "Calcul";
  if (norm === "Problèmes" || norm === "Problemes") return "Problèmes";
  return norm;
}

/** Mapping type de bloc plan_travail → libellé sous-domaine */
function libelleTypeBloc(type: string): string | null {
  if (type === "dictee" || type === "mots") return "Orthographe";
  if (type === "calcul_mental") return "Calcul";
  if (type === "probleme_maths") return "Problèmes";
  if (type === "ecriture") return "Écriture"; // optionnel
  return null;
}

function ajouter(carte: CarteDomaines, libelle: string, score: number, total: number) {
  if (total <= 0) return;
  if (!carte[libelle]) carte[libelle] = { score: 0, nb_essais: 0 };
  const slot = carte[libelle];
  // Stocke une moyenne pondérée : sum*total / nb_total
  const ancienScore = slot.score ?? 0;
  const ancienNb = slot.nb_essais;
  const newNb = ancienNb + total;
  const newScore = ancienNb === 0 ? (score / total) * 100 : ((ancienScore * ancienNb) + (score / total) * 100 * total) / newNb;
  slot.score = newScore;
  slot.nb_essais = newNb;
}

function finaliser(carte: CarteDomaines): CarteDomaines {
  const out: CarteDomaines = {};
  for (const [k, v] of Object.entries(carte)) {
    out[k] = {
      score: v.nb_essais === 0 ? null : Math.round(v.score ?? 0),
      nb_essais: v.nb_essais,
    };
  }
  return out;
}

/**
 * Renvoie la carte des scores par sous-domaine pour un ou plusieurs élèves.
 * Si plusieurs élèves : moyenne pondérée par nb d'essais (chaque essai = 1 voix).
 */
export async function calculerDomaines(
  admin: SupabaseClient,
  cible: CibleEleves,
  dateDebut: string | null
): Promise<CarteDomaines> {
  const carte: CarteDomaines = {};
  const hasCible = cible.pb_ids.length > 0 || cible.rb_ids.length > 0;
  if (!hasCible) return carte;

  // ── 1. exercice_resultat → sous_matiere ────────────────────────────────
  let qExo = admin
    .from("exercice_resultat")
    .select("score, total, exercice:exercice_id (chapitre:chapitre_id (sous_matiere))");
  if (cible.pb_ids.length > 0 && cible.rb_ids.length > 0) {
    qExo = qExo.or(`eleve_id.in.(${cible.pb_ids.join(",")}),rb_eleve_id.in.(${cible.rb_ids.join(",")})`);
  } else if (cible.pb_ids.length > 0) {
    qExo = qExo.in("eleve_id", cible.pb_ids);
  } else {
    qExo = qExo.in("rb_eleve_id", cible.rb_ids);
  }
  if (dateDebut) qExo = qExo.gte("created_at", dateDebut);
  const { data: rowsExo } = await qExo;
  for (const r of rowsExo ?? []) {
    const r2 = r as unknown as { score: number; total: number; exercice?: { chapitre?: { sous_matiere?: string } } };
    const lib = libelleSousMatiere(r2.exercice?.chapitre?.sous_matiere ?? null);
    if (!lib || r2.total <= 0) continue;
    ajouter(carte, lib, r2.score, r2.total);
  }

  // ── 2. evaluation_resultat → sous_matiere via chapitre_id ──────────────
  let qEval = admin
    .from("evaluation_resultat")
    .select("score, total, chapitre:chapitre_id (sous_matiere)");
  if (cible.pb_ids.length > 0 && cible.rb_ids.length > 0) {
    qEval = qEval.or(`eleve_id.in.(${cible.pb_ids.join(",")}),rb_eleve_id.in.(${cible.rb_ids.join(",")})`);
  } else if (cible.pb_ids.length > 0) {
    qEval = qEval.in("eleve_id", cible.pb_ids);
  } else {
    qEval = qEval.in("rb_eleve_id", cible.rb_ids);
  }
  if (dateDebut) qEval = qEval.gte("created_at", dateDebut);
  const { data: rowsEval } = await qEval;
  for (const r of rowsEval ?? []) {
    const r2 = r as unknown as { score: number; total: number; chapitre?: { sous_matiere?: string } };
    const lib = libelleSousMatiere(r2.chapitre?.sous_matiere ?? null);
    if (!lib || r2.total <= 0) continue;
    ajouter(carte, lib, r2.score, r2.total);
  }

  // ── 3. plan_travail blocs avec score (par type → sous-domaine) ─────────
  let qBloc = admin
    .from("plan_travail")
    .select("type, contenu, date_assignation")
    .eq("statut", "fait")
    .not("contenu->score_eleve", "is", null);
  if (cible.pb_ids.length > 0 && cible.rb_ids.length > 0) {
    qBloc = qBloc.or(`eleve_id.in.(${cible.pb_ids.join(",")}),repetibox_eleve_id.in.(${cible.rb_ids.join(",")})`);
  } else if (cible.pb_ids.length > 0) {
    qBloc = qBloc.in("eleve_id", cible.pb_ids);
  } else {
    qBloc = qBloc.in("repetibox_eleve_id", cible.rb_ids);
  }
  if (dateDebut) qBloc = qBloc.gte("date_assignation", dateDebut.split("T")[0]);
  const { data: rowsBloc } = await qBloc;
  for (const r of rowsBloc ?? []) {
    const r2 = r as unknown as { type: string; contenu: { score_eleve?: number; score_total?: number } };
    const lib = libelleTypeBloc(r2.type);
    if (!lib) continue;
    const se = r2.contenu?.score_eleve;
    const st = r2.contenu?.score_total;
    if (typeof se !== "number" || typeof st !== "number" || st <= 0) continue;
    ajouter(carte, lib, se, st);
  }

  // ── 4. calcul_jour_resultat → "Calcul" ─────────────────────────────────
  let qCalc = admin.from("calcul_jour_resultat").select("correct");
  if (cible.pb_ids.length > 0 && cible.rb_ids.length > 0) {
    qCalc = qCalc.or(`eleve_id.in.(${cible.pb_ids.join(",")}),rb_eleve_id.in.(${cible.rb_ids.join(",")})`);
  } else if (cible.pb_ids.length > 0) {
    qCalc = qCalc.in("eleve_id", cible.pb_ids);
  } else {
    qCalc = qCalc.in("rb_eleve_id", cible.rb_ids);
  }
  if (dateDebut) qCalc = qCalc.gte("created_at", dateDebut);
  const { data: rowsCalc } = await qCalc;
  for (const r of rowsCalc ?? []) {
    const r2 = r as unknown as { correct: boolean };
    ajouter(carte, "Calcul", r2.correct ? 1 : 0, 1);
  }

  return finaliser(carte);
}

/**
 * Calcule le score global d'une matière à partir de la carte des sous-domaines.
 * Pondéré par nb_essais.
 */
export function scoreMatiereDepuis(
  carte: CarteDomaines,
  sousLibelles: string[]
): { score: number | null; nb_essais: number } {
  let sumPond = 0;
  let nbTotal = 0;
  for (const lib of sousLibelles) {
    const slot = carte[lib];
    if (!slot || slot.score === null) continue;
    sumPond += slot.score * slot.nb_essais;
    nbTotal += slot.nb_essais;
  }
  if (nbTotal === 0) return { score: null, nb_essais: 0 };
  return { score: Math.round(sumPond / nbTotal), nb_essais: nbTotal };
}

export const SOUS_DOMAINES_FR = ["Conjugaison", "Vocabulaire", "Grammaire", "Orthographe", "Écriture"];
export const SOUS_DOMAINES_MATHS = ["Calcul", "Problèmes"];

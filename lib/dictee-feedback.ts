import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helpers pour la boucle de feedback enseignant sur les corrections de dictée.
 *
 * Flux : chaque erreur détectée par /api/corriger-dictee est enregistrée
 * dans `dictee_correction_feedback` avec statut=null. L'enseignant passe
 * en revue (weekly batch) et classe chaque entrée comme validée /
 * corrigée / rejetée. Les entrées validées et corrigées sont ensuite
 * injectées comme few-shot dans la classification des nouvelles fautes.
 */

export type FeedbackKind = "sub" | "del" | "ins" | "casse" | "ponctuation";
export type FeedbackStatut = "valide" | "corrige" | "rejete";
export type Niveau = "CE2" | "CM1" | "CM2";

export interface ErreurPourLog {
  mot_attendu: string;
  mot_eleve: string;
  contexte: string | null;
  kind: FeedbackKind;
  type_erreur_ia: string;
  indice_ia: string;
}

export interface ExempleValide {
  mot_attendu: string;
  mot_eleve: string;
  type_erreur: string;
  indice: string;
  statut: FeedbackStatut;
}

/**
 * Enregistre toutes les erreurs d'une correction dans la table de feedback
 * avec statut=null (en attente de revue). Opération silencieuse : en cas
 * d'échec, on ne bloque pas la correction — on logge et on continue.
 */
export async function loggerErreurs(
  admin: SupabaseClient,
  params: {
    bloc_id: string;
    eleve_id: string | null;
    repetibox_eleve_id: number | null;
    niveau: Niveau;
    erreurs: ErreurPourLog[];
  },
): Promise<void> {
  if (params.erreurs.length === 0) return;

  const rows = params.erreurs.map((e) => ({
    bloc_id: params.bloc_id,
    eleve_id: params.eleve_id,
    repetibox_eleve_id: params.repetibox_eleve_id,
    niveau: params.niveau,
    mot_attendu: e.mot_attendu,
    mot_eleve: e.mot_eleve,
    contexte: e.contexte,
    kind: e.kind,
    type_erreur_ia: e.type_erreur_ia,
    indice_ia: e.indice_ia,
  }));

  const { error } = await admin.from("dictee_correction_feedback").insert(rows);
  if (error) {
    console.error("[dictee-feedback] Insert échoué:", error);
  }
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Clé de regroupement lâche : strip accents + lowercase. */
function cleNorm(s: string): string {
  return stripAccents(s.toLowerCase());
}

/**
 * Remonte des exemples pertinents (validés ou corrigés par l'enseignant)
 * pour guider la classification d'un nouveau lot d'erreurs. On pondère par :
 *  1. Match exact sur mot_attendu (priorité max)
 *  2. Match normalisé (strip accents + lowercase)
 *  3. Même niveau scolaire
 *
 * Retourne au plus `limite` exemples, déduplication sur (mot_attendu, mot_eleve).
 */
export async function exemplesValidesPertinents(
  admin: SupabaseClient,
  params: {
    motsAttendus: string[];
    niveau: Niveau;
    limite?: number;
  },
): Promise<ExempleValide[]> {
  const limite = params.limite ?? 20;
  if (params.motsAttendus.length === 0) return [];

  const motsNormalises = [...new Set(params.motsAttendus.map(cleNorm))];

  // Requête : exemples validés ou corrigés dont le mot_attendu (normalisé)
  // correspond à l'un des mots recherchés, OU du même niveau en repli.
  const { data, error } = await admin
    .from("dictee_correction_feedback")
    .select(
      "mot_attendu, mot_eleve, kind, type_erreur_ia, indice_ia, type_erreur_corrige, indice_corrige, statut, niveau, decide_le",
    )
    .in("statut", ["valide", "corrige"])
    .order("decide_le", { ascending: false })
    .limit(150);

  if (error || !data) {
    if (error) console.error("[dictee-feedback] Select échoué:", error);
    return [];
  }

  type Row = {
    mot_attendu: string;
    mot_eleve: string;
    kind: FeedbackKind;
    type_erreur_ia: string | null;
    indice_ia: string | null;
    type_erreur_corrige: string | null;
    indice_corrige: string | null;
    statut: FeedbackStatut;
    niveau: string | null;
  };

  const rows = data as Row[];

  // Score : exact > normalisé > niveau seulement
  const pertinents: Array<ExempleValide & { score: number }> = [];
  for (const r of rows) {
    const mot = r.mot_attendu;
    const motN = cleNorm(mot);
    let score = 0;
    if (params.motsAttendus.includes(mot)) score += 100;
    else if (motsNormalises.includes(motN)) score += 50;
    if (r.niveau === params.niveau) score += 10;
    if (score === 0) continue;

    pertinents.push({
      score,
      mot_attendu: r.mot_attendu,
      mot_eleve: r.mot_eleve,
      type_erreur: r.type_erreur_corrige ?? r.type_erreur_ia ?? "autre",
      indice: r.indice_corrige ?? r.indice_ia ?? "",
      statut: r.statut,
    });
  }

  // Dédoublonne sur (mot_attendu, mot_eleve) en gardant le meilleur score
  const uniques = new Map<string, ExempleValide & { score: number }>();
  for (const e of pertinents) {
    const k = `${e.mot_attendu}||${e.mot_eleve}`;
    const existing = uniques.get(k);
    if (!existing || e.score > existing.score) uniques.set(k, e);
  }

  return [...uniques.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map(({ score: _s, ...rest }) => rest);
}

/**
 * Remonte les erreurs rejetées (faux positifs) qui ressemblent aux nouvelles
 * erreurs détectées : l'IA doit apprendre à NE PAS les signaler.
 */
export async function casRejetePertinents(
  admin: SupabaseClient,
  params: {
    motsAttendus: string[];
    niveau: Niveau;
    limite?: number;
  },
): Promise<{ mot_attendu: string; mot_eleve: string; commentaire: string | null }[]> {
  const limite = params.limite ?? 10;
  if (params.motsAttendus.length === 0) return [];

  const motsNormalises = [...new Set(params.motsAttendus.map(cleNorm))];

  const { data, error } = await admin
    .from("dictee_correction_feedback")
    .select("mot_attendu, mot_eleve, commentaire_enseignant, niveau, decide_le")
    .eq("statut", "rejete")
    .order("decide_le", { ascending: false })
    .limit(80);

  if (error || !data) return [];

  const rows = data as {
    mot_attendu: string;
    mot_eleve: string;
    commentaire_enseignant: string | null;
    niveau: string | null;
  }[];

  const pertinents = rows
    .filter((r) => {
      const motN = cleNorm(r.mot_attendu);
      return params.motsAttendus.includes(r.mot_attendu) || motsNormalises.includes(motN);
    })
    .slice(0, limite)
    .map((r) => ({
      mot_attendu: r.mot_attendu,
      mot_eleve: r.mot_eleve,
      commentaire: r.commentaire_enseignant,
    }));

  return pertinents;
}

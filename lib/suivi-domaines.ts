/**
 * Agrégation des résultats par sous-domaine pédagogique pour la page de
 * suivi (élève seul + classe). Cumule TOUTES les sources :
 *   - exercice_resultat (exos liés à un chapitre, mappés par sous_matiere)
 *   - evaluation_resultat (évals de chapitre)
 *   - plan_travail.contenu.score_eleve/score_total (blocs hors chapitre :
 *     dictée, mots, calcul_mental, probleme_maths)
 *   - calcul_jour_resultat (1/1 par essai correct)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScoreSousDomaine {
  score: number | null;
  nb_essais: number;
}

export type CarteDomaines = Record<string, ScoreSousDomaine>;

export interface CibleEleves {
  pb_ids: string[];
  rb_ids: number[];
}

function libelleSousMatiere(sm: string | null | undefined): string | null {
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

function libelleTypeBloc(type: string): string | null {
  if (type === "dictee" || type === "mots") return "Orthographe";
  if (type === "calcul_mental") return "Calcul";
  if (type === "probleme_maths") return "Problèmes";
  if (type === "ecriture") return "Écriture";
  return null;
}

function ajouter(carte: CarteDomaines, libelle: string, score: number, total: number) {
  if (total <= 0) return;
  if (!carte[libelle]) carte[libelle] = { score: 0, nb_essais: 0 };
  const slot = carte[libelle];
  const ancien = slot.score ?? 0;
  const ancienNb = slot.nb_essais;
  const newNb = ancienNb + total;
  const pct = (score / total) * 100;
  slot.score = ancienNb === 0 ? pct : ((ancien * ancienNb) + pct * total) / newNb;
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

export async function calculerDomaines(
  admin: SupabaseClient,
  cible: CibleEleves,
  dateDebut: string | null
): Promise<CarteDomaines> {
  const carte: CarteDomaines = {};
  if (cible.pb_ids.length === 0 && cible.rb_ids.length === 0) return carte;

  const dateJour = dateDebut?.split("T")[0] ?? null;

  // ── 1. exercice_resultat : 2 requêtes (PB + RB) ──────────────────────
  const exoQueries: Array<Promise<{ data: Array<{ exercice_id: string; score: number; total: number }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("exercice_resultat").select("exercice_id, score, total").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    exoQueries.push(q as unknown as Promise<{ data: Array<{ exercice_id: string; score: number; total: number }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("exercice_resultat").select("exercice_id, score, total").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    exoQueries.push(q as unknown as Promise<{ data: Array<{ exercice_id: string; score: number; total: number }> | null }>);
  }
  const exoResults = await Promise.all(exoQueries);
  const lignesExo: Array<{ exercice_id: string; score: number; total: number }> = [];
  for (const r of exoResults) for (const row of r.data ?? []) lignesExo.push(row);

  if (lignesExo.length > 0) {
    // Charger les exercices et leurs chapitres
    const exoIds = [...new Set(lignesExo.map((l) => l.exercice_id))];
    const { data: exos } = await admin.from("exercice").select("id, chapitre_id").in("id", exoIds);
    const chapIds = [...new Set((exos ?? []).map((e) => e.chapitre_id as string).filter(Boolean))];
    const { data: chaps } = chapIds.length > 0
      ? await admin.from("chapitres").select("id, sous_matiere").in("id", chapIds)
      : { data: [] };
    const exoToChap = new Map<string, string>((exos ?? []).map((e) => [e.id as string, e.chapitre_id as string]));
    const chapToSm = new Map<string, string | null>((chaps ?? []).map((c) => [c.id as string, c.sous_matiere as string | null]));

    for (const r of lignesExo) {
      const chap = exoToChap.get(r.exercice_id);
      if (!chap) continue;
      const lib = libelleSousMatiere(chapToSm.get(chap) ?? null);
      if (!lib) continue;
      ajouter(carte, lib, r.score, r.total);
    }
  }

  // ── 2. evaluation_resultat ────────────────────────────────────────────
  const evalQueries: Array<Promise<{ data: Array<{ chapitre_id: string; score: number; total: number }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("evaluation_resultat").select("chapitre_id, score, total").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    evalQueries.push(q as unknown as Promise<{ data: Array<{ chapitre_id: string; score: number; total: number }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("evaluation_resultat").select("chapitre_id, score, total").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    evalQueries.push(q as unknown as Promise<{ data: Array<{ chapitre_id: string; score: number; total: number }> | null }>);
  }
  const evalResults = await Promise.all(evalQueries);
  const lignesEval: Array<{ chapitre_id: string; score: number; total: number }> = [];
  for (const r of evalResults) for (const row of r.data ?? []) lignesEval.push(row);

  if (lignesEval.length > 0) {
    const chapIds = [...new Set(lignesEval.map((l) => l.chapitre_id))];
    const { data: chaps } = await admin.from("chapitres").select("id, sous_matiere").in("id", chapIds);
    const chapToSm = new Map<string, string | null>((chaps ?? []).map((c) => [c.id as string, c.sous_matiere as string | null]));
    for (const r of lignesEval) {
      const lib = libelleSousMatiere(chapToSm.get(r.chapitre_id) ?? null);
      if (!lib) continue;
      ajouter(carte, lib, r.score, r.total);
    }
  }

  // ── 3. plan_travail blocs avec score (par type) ───────────────────────
  const blocQueries: Array<Promise<{ data: Array<{ type: string; contenu: Record<string, unknown> }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("plan_travail").select("type, contenu").in("eleve_id", cible.pb_ids).eq("statut", "fait").not("contenu->score_eleve", "is", null);
    if (dateJour) q = q.gte("date_assignation", dateJour);
    blocQueries.push(q as unknown as Promise<{ data: Array<{ type: string; contenu: Record<string, unknown> }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("plan_travail").select("type, contenu").in("repetibox_eleve_id", cible.rb_ids).eq("statut", "fait").not("contenu->score_eleve", "is", null);
    if (dateJour) q = q.gte("date_assignation", dateJour);
    blocQueries.push(q as unknown as Promise<{ data: Array<{ type: string; contenu: Record<string, unknown> }> | null }>);
  }
  const blocResults = await Promise.all(blocQueries);
  for (const r of blocResults) {
    for (const row of r.data ?? []) {
      const lib = libelleTypeBloc(row.type);
      if (!lib) continue;
      const se = row.contenu?.score_eleve;
      const st = row.contenu?.score_total;
      if (typeof se !== "number" || typeof st !== "number" || st <= 0) continue;
      ajouter(carte, lib, se, st);
    }
  }

  // ── 4. calcul_jour_resultat → "Calcul" ───────────────────────────────
  const calcQueries: Array<Promise<{ data: Array<{ correct: boolean }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQueries.push(q as unknown as Promise<{ data: Array<{ correct: boolean }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQueries.push(q as unknown as Promise<{ data: Array<{ correct: boolean }> | null }>);
  }
  const calcResults = await Promise.all(calcQueries);
  for (const r of calcResults) for (const row of r.data ?? []) {
    ajouter(carte, "Calcul", row.correct ? 1 : 0, 1);
  }

  return finaliser(carte);
}

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

/**
 * Variante batch : agrège les domaines pour CHAQUE élève d'une cohorte
 * en 4 requêtes totales (au lieu de N×4). Utilisé par la page classe pour
 * éviter d'exploser le nb d'aller-retours DB.
 *
 * Renvoie Map<uid, CarteDomaines> où uid = "pb_<uuid>" ou "rb_<id>".
 */
export async function calculerDomainesParEleve(
  admin: SupabaseClient,
  cible: CibleEleves,
  dateDebut: string | null
): Promise<Map<string, CarteDomaines>> {
  const out = new Map<string, CarteDomaines>();
  if (cible.pb_ids.length === 0 && cible.rb_ids.length === 0) return out;

  const dateJour = dateDebut?.split("T")[0] ?? null;

  function uidPB(id: string): string { return `pb_${id}`; }
  function uidRB(id: number): string { return `rb_${id}`; }

  function carte(uid: string): CarteDomaines {
    let c = out.get(uid);
    if (!c) { c = {}; out.set(uid, c); }
    return c;
  }

  // ── 1. exercice_resultat (PB + RB en parallèle) ────────────────────────
  const exoQ: Array<Promise<{ data: Array<{ exercice_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("exercice_resultat").select("exercice_id, eleve_id, rb_eleve_id, score, total").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    exoQ.push(q as unknown as Promise<{ data: Array<{ exercice_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("exercice_resultat").select("exercice_id, eleve_id, rb_eleve_id, score, total").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    exoQ.push(q as unknown as Promise<{ data: Array<{ exercice_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> | null }>);
  }
  const exoR = await Promise.all(exoQ);
  const exoRows: Array<{ exercice_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> = [];
  for (const r of exoR) for (const row of r.data ?? []) exoRows.push(row);

  // Charger exos + chapitres pour le mapping
  const exoIds = [...new Set(exoRows.map((r) => r.exercice_id))];
  let exoToChap = new Map<string, string>();
  let chapToSm = new Map<string, string | null>();
  if (exoIds.length > 0) {
    const { data: exos } = await admin.from("exercice").select("id, chapitre_id").in("id", exoIds);
    exoToChap = new Map((exos ?? []).map((e) => [e.id as string, e.chapitre_id as string]));
    const chapIds = [...new Set([...exoToChap.values()].filter(Boolean))];
    if (chapIds.length > 0) {
      const { data: chaps } = await admin.from("chapitres").select("id, sous_matiere").in("id", chapIds);
      chapToSm = new Map((chaps ?? []).map((c) => [c.id as string, c.sous_matiere as string | null]));
    }
  }

  for (const r of exoRows) {
    const chap = exoToChap.get(r.exercice_id);
    if (!chap) continue;
    const lib = libelleSousMatiere(chapToSm.get(chap) ?? null);
    if (!lib) continue;
    const uid = r.eleve_id ? uidPB(r.eleve_id) : r.rb_eleve_id !== null ? uidRB(r.rb_eleve_id) : null;
    if (!uid) continue;
    ajouter(carte(uid), lib, r.score, r.total);
  }

  // ── 2. evaluation_resultat ────────────────────────────────────────────
  const evalQ: Array<Promise<{ data: Array<{ chapitre_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("evaluation_resultat").select("chapitre_id, eleve_id, rb_eleve_id, score, total").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    evalQ.push(q as unknown as Promise<{ data: Array<{ chapitre_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("evaluation_resultat").select("chapitre_id, eleve_id, rb_eleve_id, score, total").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    evalQ.push(q as unknown as Promise<{ data: Array<{ chapitre_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> | null }>);
  }
  const evalR = await Promise.all(evalQ);
  const evalRows: Array<{ chapitre_id: string; eleve_id: string | null; rb_eleve_id: number | null; score: number; total: number }> = [];
  for (const r of evalR) for (const row of r.data ?? []) evalRows.push(row);

  // Compléter chapToSm avec les chapitres d'évaluation
  const chapIdsEval = [...new Set(evalRows.map((r) => r.chapitre_id).filter((id) => !chapToSm.has(id)))];
  if (chapIdsEval.length > 0) {
    const { data: chaps } = await admin.from("chapitres").select("id, sous_matiere").in("id", chapIdsEval);
    for (const c of chaps ?? []) chapToSm.set(c.id as string, c.sous_matiere as string | null);
  }

  for (const r of evalRows) {
    const lib = libelleSousMatiere(chapToSm.get(r.chapitre_id) ?? null);
    if (!lib) continue;
    const uid = r.eleve_id ? uidPB(r.eleve_id) : r.rb_eleve_id !== null ? uidRB(r.rb_eleve_id) : null;
    if (!uid) continue;
    ajouter(carte(uid), lib, r.score, r.total);
  }

  // ── 3. plan_travail blocs avec score ──────────────────────────────────
  const blocQ: Array<Promise<{ data: Array<{ type: string; eleve_id: string | null; repetibox_eleve_id: number | null; contenu: Record<string, unknown> }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("plan_travail").select("type, eleve_id, repetibox_eleve_id, contenu").in("eleve_id", cible.pb_ids).eq("statut", "fait").not("contenu->score_eleve", "is", null);
    if (dateJour) q = q.gte("date_assignation", dateJour);
    blocQ.push(q as unknown as Promise<{ data: Array<{ type: string; eleve_id: string | null; repetibox_eleve_id: number | null; contenu: Record<string, unknown> }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("plan_travail").select("type, eleve_id, repetibox_eleve_id, contenu").in("repetibox_eleve_id", cible.rb_ids).eq("statut", "fait").not("contenu->score_eleve", "is", null);
    if (dateJour) q = q.gte("date_assignation", dateJour);
    blocQ.push(q as unknown as Promise<{ data: Array<{ type: string; eleve_id: string | null; repetibox_eleve_id: number | null; contenu: Record<string, unknown> }> | null }>);
  }
  const blocR = await Promise.all(blocQ);
  for (const r of blocR) {
    for (const row of r.data ?? []) {
      const lib = libelleTypeBloc(row.type);
      if (!lib) continue;
      const se = row.contenu?.score_eleve;
      const st = row.contenu?.score_total;
      if (typeof se !== "number" || typeof st !== "number" || st <= 0) continue;
      const uid = row.eleve_id ? uidPB(row.eleve_id) : row.repetibox_eleve_id !== null ? uidRB(row.repetibox_eleve_id) : null;
      if (!uid) continue;
      ajouter(carte(uid), lib, se, st);
    }
  }

  // ── 4. calcul_jour_resultat → "Calcul" ───────────────────────────────
  const calcQ: Array<Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct, eleve_id, rb_eleve_id").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQ.push(q as unknown as Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct, eleve_id, rb_eleve_id").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQ.push(q as unknown as Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null }> | null }>);
  }
  const calcR = await Promise.all(calcQ);
  for (const r of calcR) {
    for (const row of r.data ?? []) {
      const uid = row.eleve_id ? uidPB(row.eleve_id) : row.rb_eleve_id !== null ? uidRB(row.rb_eleve_id) : null;
      if (!uid) continue;
      ajouter(carte(uid), "Calcul", row.correct ? 1 : 0, 1);
    }
  }

  // Finaliser (round + null si vide)
  const final = new Map<string, CarteDomaines>();
  for (const [uid, c] of out) final.set(uid, finaliser(c));
  return final;
}

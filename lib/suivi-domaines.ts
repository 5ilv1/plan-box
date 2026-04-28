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
  if (type === "lecture") return "Lecture";
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

/** Renvoie le meilleur résultat parmi plusieurs tentatives (par % décroissant). */
function estMeilleur(a: { score: number; total: number }, b: { score: number; total: number }): boolean {
  const pa = a.total > 0 ? a.score / a.total : 0;
  const pb = b.total > 0 ? b.score / b.total : 0;
  return pa >= pb;
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
    // Garde le meilleur résultat par exercice (un élève peut refaire)
    const meilleurExo = new Map<string, { score: number; total: number }>();
    for (const r of lignesExo) {
      const cur = meilleurExo.get(r.exercice_id);
      if (!cur || estMeilleur(r, cur)) meilleurExo.set(r.exercice_id, { score: r.score, total: r.total });
    }
    // Charger les exercices et leurs chapitres
    const exoIds = [...meilleurExo.keys()];
    const { data: exos } = await admin.from("exercice").select("id, chapitre_id").in("id", exoIds);
    const chapIds = [...new Set((exos ?? []).map((e) => e.chapitre_id as string).filter(Boolean))];
    const { data: chaps } = chapIds.length > 0
      ? await admin.from("chapitres").select("id, sous_matiere").in("id", chapIds)
      : { data: [] };
    const exoToChap = new Map<string, string>((exos ?? []).map((e) => [e.id as string, e.chapitre_id as string]));
    const chapToSm = new Map<string, string | null>((chaps ?? []).map((c) => [c.id as string, c.sous_matiere as string | null]));

    for (const [exoId, best] of meilleurExo) {
      const chap = exoToChap.get(exoId);
      if (!chap) continue;
      const lib = libelleSousMatiere(chapToSm.get(chap) ?? null);
      if (!lib) continue;
      ajouter(carte, lib, best.score, best.total);
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
    // Meilleur résultat par chapitre
    const meilleurEval = new Map<string, { score: number; total: number }>();
    for (const r of lignesEval) {
      const cur = meilleurEval.get(r.chapitre_id);
      if (!cur || estMeilleur(r, cur)) meilleurEval.set(r.chapitre_id, { score: r.score, total: r.total });
    }
    const chapIds = [...meilleurEval.keys()];
    const { data: chaps } = await admin.from("chapitres").select("id, sous_matiere").in("id", chapIds);
    const chapToSm = new Map<string, string | null>((chaps ?? []).map((c) => [c.id as string, c.sous_matiere as string | null]));
    for (const [chapId, best] of meilleurEval) {
      const lib = libelleSousMatiere(chapToSm.get(chapId) ?? null);
      if (!lib) continue;
      ajouter(carte, lib, best.score, best.total);
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
  // Plusieurs tentatives par calcul possible : on garde le meilleur résultat
  // par (eleve, calcul_id) : 1 si au moins une tentative correcte, 0 sinon.
  const calcQueries: Array<Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null; calcul_id: string }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct, eleve_id, rb_eleve_id, calcul_id").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQueries.push(q as unknown as Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null; calcul_id: string }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct, eleve_id, rb_eleve_id, calcul_id").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQueries.push(q as unknown as Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null; calcul_id: string }> | null }>);
  }
  const calcResults = await Promise.all(calcQueries);
  // Aggrégation par (uid, calcul_id) → max(correct)
  const meilleurParCalcul = new Map<string, boolean>();
  for (const r of calcResults) for (const row of r.data ?? []) {
    const uid = row.eleve_id ?? (row.rb_eleve_id !== null ? `rb_${row.rb_eleve_id}` : null);
    if (!uid) continue;
    const key = `${uid}|${row.calcul_id}`;
    const ancien = meilleurParCalcul.get(key);
    if (ancien === undefined || (!ancien && row.correct)) {
      meilleurParCalcul.set(key, row.correct);
    }
  }
  for (const correct of meilleurParCalcul.values()) {
    ajouter(carte, "Calcul", correct ? 1 : 0, 1);
  }

  // ── 5. problem_attempts → "Problèmes" (clé : student_id = auth UUID) ─
  const authMap = await recupererAuthIds(admin, cible);
  if (authMap.size > 0) {
    let q = admin.from("problem_attempts").select("student_id, solved").in("student_id", [...authMap.keys()]);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    const { data: problems } = await q;
    for (const row of (problems ?? []) as Array<{ student_id: string; solved: boolean }>) {
      ajouter(carte, "Problèmes", row.solved ? 1 : 0, 1);
    }
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

export const SOUS_DOMAINES_FR = ["Conjugaison", "Vocabulaire", "Grammaire", "Orthographe", "Écriture", "Lecture"];
export const SOUS_DOMAINES_MATHS = ["Calcul", "Problèmes"];

/**
 * Helper : récupère le mapping auth_id → uid pour les élèves d'une cohorte.
 * Utilisé pour interroger les tables qui clé sur l'auth UUID
 * (problem_attempts, etc.).
 */
async function recupererAuthIds(
  admin: SupabaseClient,
  cible: CibleEleves
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // PB : eleves.id === auth_id
  for (const id of cible.pb_ids) map.set(id, `pb_${id}`);
  // RB : eleve.auth_id à charger
  if (cible.rb_ids.length > 0) {
    const { data } = await admin.from("eleve").select("id, auth_id").in("id", cible.rb_ids);
    for (const e of data ?? []) {
      const auth = (e as { auth_id?: string }).auth_id;
      if (auth) map.set(auth, `rb_${e.id as number}`);
    }
  }
  return map;
}

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

  // Garde le meilleur résultat par (uid, exercice)
  const meilleurExoEleve = new Map<string, { score: number; total: number; exoId: string }>();
  for (const r of exoRows) {
    const uid = r.eleve_id ? uidPB(r.eleve_id) : r.rb_eleve_id !== null ? uidRB(r.rb_eleve_id) : null;
    if (!uid) continue;
    const key = `${uid}|${r.exercice_id}`;
    const cur = meilleurExoEleve.get(key);
    if (!cur || estMeilleur(r, cur)) meilleurExoEleve.set(key, { score: r.score, total: r.total, exoId: r.exercice_id });
  }
  for (const [key, best] of meilleurExoEleve) {
    const uid = key.split("|")[0];
    const chap = exoToChap.get(best.exoId);
    if (!chap) continue;
    const lib = libelleSousMatiere(chapToSm.get(chap) ?? null);
    if (!lib) continue;
    ajouter(carte(uid), lib, best.score, best.total);
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

  // Garde le meilleur résultat par (uid, chapitre)
  const meilleurEvalEleve = new Map<string, { score: number; total: number; chapId: string }>();
  for (const r of evalRows) {
    const uid = r.eleve_id ? uidPB(r.eleve_id) : r.rb_eleve_id !== null ? uidRB(r.rb_eleve_id) : null;
    if (!uid) continue;
    const key = `${uid}|${r.chapitre_id}`;
    const cur = meilleurEvalEleve.get(key);
    if (!cur || estMeilleur(r, cur)) meilleurEvalEleve.set(key, { score: r.score, total: r.total, chapId: r.chapitre_id });
  }
  for (const [key, best] of meilleurEvalEleve) {
    const uid = key.split("|")[0];
    const lib = libelleSousMatiere(chapToSm.get(best.chapId) ?? null);
    if (!lib) continue;
    ajouter(carte(uid), lib, best.score, best.total);
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

  // ── 4. calcul_jour_resultat → "Calcul" (meilleur résultat par calcul) ─
  const calcQ: Array<Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null; calcul_id: string }> | null }>> = [];
  if (cible.pb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct, eleve_id, rb_eleve_id, calcul_id").in("eleve_id", cible.pb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQ.push(q as unknown as Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null; calcul_id: string }> | null }>);
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("calcul_jour_resultat").select("correct, eleve_id, rb_eleve_id, calcul_id").in("rb_eleve_id", cible.rb_ids);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    calcQ.push(q as unknown as Promise<{ data: Array<{ correct: boolean; eleve_id: string | null; rb_eleve_id: number | null; calcul_id: string }> | null }>);
  }
  const calcR = await Promise.all(calcQ);
  const meilleurParCalculParEleve = new Map<string, boolean>();
  for (const r of calcR) {
    for (const row of r.data ?? []) {
      const uid = row.eleve_id ? uidPB(row.eleve_id) : row.rb_eleve_id !== null ? uidRB(row.rb_eleve_id) : null;
      if (!uid) continue;
      const key = `${uid}|${row.calcul_id}`;
      const ancien = meilleurParCalculParEleve.get(key);
      if (ancien === undefined || (!ancien && row.correct)) {
        meilleurParCalculParEleve.set(key, row.correct);
      }
    }
  }
  for (const [key, correct] of meilleurParCalculParEleve) {
    const uid = key.split("|")[0];
    ajouter(carte(uid), "Calcul", correct ? 1 : 0, 1);
  }

  // ── 5. problem_attempts → "Problèmes" (auth_id → uid) ─────────────────
  const authMap = await recupererAuthIds(admin, cible);
  if (authMap.size > 0) {
    let q = admin.from("problem_attempts").select("student_id, solved").in("student_id", [...authMap.keys()]);
    if (dateDebut) q = q.gte("created_at", dateDebut);
    const { data: problems } = await q;
    for (const row of (problems ?? []) as Array<{ student_id: string; solved: boolean }>) {
      const uid = authMap.get(row.student_id);
      if (!uid) continue;
      ajouter(carte(uid), "Problèmes", row.solved ? 1 : 0, 1);
    }
  }

  // Finaliser (round + null si vide)
  const final = new Map<string, CarteDomaines>();
  for (const [uid, c] of out) final.set(uid, finaliser(c));
  return final;
}

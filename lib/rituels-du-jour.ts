// ── Les rituels du jour dans le taux de complétion ───────────────────────────
//
// Le problème du jour et le calcul du jour ne sont pas des blocs de
// `plan_travail` : ils vivent dans leurs propres tables, et le suivi enseignant
// ne les voyait pas. Le tableau de bord élève, lui, les comptait. Deux chiffres
// pour le même travail.
//
// Ils comptent désormais des deux côtés, et ce module écrit la règle une seule
// fois. Il est **pur** : la route enseignant lui passe ce qu'elle a lu en base,
// le tableau de bord élève applique la même règle sur ce qu'il a déjà en main.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlocSuivi } from "./suivi-metriques";
import { uidDuBloc } from "./suivi-metriques";
import { NIVEAUX_IDS } from "./calcul-jour";
import { MAX_TENTATIVES } from "./probleme-du-jour";

export const TYPE_PROBLEME_DU_JOUR = "probleme_du_jour";
export const TYPE_CALCUL_DU_JOUR = "calcul_du_jour";

/** Un rituel posé pour un niveau, un jour donné. */
export interface RituelPose {
  date: string;
  niveau: string;
}

/** Un rituel terminé par un élève. */
export interface RituelFait {
  uid: string;
  date: string;
}

export interface EleveRituel {
  uid: string;
  niveau: string;
}

/**
 * ⚠️ **Un rituel ne compte que les jours où l'élève a du travail assigné.**
 *
 * Sans cette règle, un samedi où un seul élève a ouvert son tableau de bord —
 * ce qui suffit à créer la ligne du calcul du jour — ajouterait vingt tâches
 * non faites à toute la classe. Le week-end ferait chuter la semaine, et la
 * courbe journalière montrerait des jours de classe qui n'en sont pas.
 *
 * C'est aussi ce que voit l'élève : sa barre ne s'affiche que les jours où il a
 * quelque chose à faire.
 */
export function joursTravailles(
  blocs: Array<{ eleve_id: string | null; repetibox_eleve_id: number | null; date_assignation: string }>,
): Set<string> {
  const jours = new Set<string>();
  for (const b of blocs) {
    const uid = uidDuBloc(b);
    if (uid) jours.add(`${uid}|${b.date_assignation}`);
  }
  return jours;
}

/**
 * Les rituels, sous la forme d'un bloc de suivi — pour que `completion()` les
 * compte sans rien savoir d'eux.
 *
 * Ce sont des blocs de complétion et **rien d'autre** : ils n'ont ni contenu ni
 * durée, et l'appelant les tient hors de la réussite par sous-domaine, des
 * retards et du travail bâclé. Un rituel non fait n'est pas un travail en
 * retard : la journée est passée, il n'y a plus rien à rattraper.
 */
export function construireRituels(args: {
  eleves: EleveRituel[];
  /** Les blocs **comptés** (périmètre `TYPES_COMPTES`), pour la règle ci-dessus. */
  blocs: Array<{ eleve_id: string | null; repetibox_eleve_id: number | null; date_assignation: string }>;
  problemesPoses: RituelPose[];
  problemesFaits: RituelFait[];
  calculsPoses: RituelPose[];
  calculsFaits: RituelFait[];
}): BlocSuivi[] {
  const travailles = joursTravailles(args.blocs);
  const cle = (a: string, b: string) => `${a}|${b}`;

  const poses: Record<string, Set<string>> = {
    [TYPE_PROBLEME_DU_JOUR]: new Set(args.problemesPoses.map((p) => cle(p.niveau, p.date))),
    [TYPE_CALCUL_DU_JOUR]: new Set(args.calculsPoses.map((p) => cle(p.niveau, p.date))),
  };
  const faits: Record<string, Set<string>> = {
    [TYPE_PROBLEME_DU_JOUR]: new Set(args.problemesFaits.map((f) => cle(f.uid, f.date))),
    [TYPE_CALCUL_DU_JOUR]: new Set(args.calculsFaits.map((f) => cle(f.uid, f.date))),
  };

  // Les dates à examiner : celles où un rituel a été posé, pas tout le calendrier.
  const dates = new Set([
    ...args.problemesPoses.map((p) => p.date),
    ...args.calculsPoses.map((p) => p.date),
  ]);

  const titres: Record<string, string> = {
    [TYPE_PROBLEME_DU_JOUR]: "Problème du jour",
    [TYPE_CALCUL_DU_JOUR]: "Calcul du jour",
  };

  const rituels: BlocSuivi[] = [];
  for (const eleve of args.eleves) {
    const dec = decouper(eleve.uid);
    if (!dec) continue;
    for (const date of dates) {
      if (!travailles.has(cle(eleve.uid, date))) continue;
      for (const type of [TYPE_PROBLEME_DU_JOUR, TYPE_CALCUL_DU_JOUR] as const) {
        if (!poses[type].has(cle(eleve.niveau, date))) continue;
        rituels.push({
          id: `${type}:${eleve.uid}:${date}`,
          type,
          titre: titres[type],
          statut: faits[type].has(cle(eleve.uid, date)) ? "fait" : "a_faire",
          contenu: null,
          date_assignation: date,
          date_limite: null,
          periodicite: null,
          groupe_label: null,
          eleve_id: dec.source === "planbox" ? dec.id : null,
          repetibox_eleve_id: dec.source === "repetibox" ? Number(dec.id) : null,
          chapitre_id: null,
          termine_le: null,
          duree_secondes: null,
        });
      }
    }
  }
  return rituels;
}

function decouper(uid: string): { source: "planbox" | "repetibox"; id: string } | null {
  if (uid.startsWith("pb_")) return { source: "planbox", id: uid.slice(3) };
  if (uid.startsWith("rb_")) return { source: "repetibox", id: uid.slice(3) };
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Lecture en base
   ──────────────────────────────────────────────────────────────────────────── */

const TAILLE_PAGE = 1000;

/** `niveau_id` → « CE2 » / « CM1 » / « CM2 ». */
const NIVEAU_PAR_ID = new Map(Object.entries(NIVEAUX_IDS).map(([nom, id]) => [id, nom]));

/** Lit une table par pages : PostgREST plafonne toute lecture à 1000 lignes. */
async function lireTout<T>(
  requete: (debut: number, fin: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  quoi: string,
): Promise<T[]> {
  const tout: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await requete(page * TAILLE_PAGE, (page + 1) * TAILLE_PAGE - 1);
    if (error) throw new Error(`${quoi}: ${error.message}`);
    const lot = (data ?? []) as T[];
    tout.push(...lot);
    if (lot.length < TAILLE_PAGE) return tout;
  }
}

/**
 * Les rituels de la fenêtre, prêts à être comptés.
 *
 * Quatre tables, trois identités : `problem_attempts` désigne l'élève par son
 * **uuid d'authentification** (et non par `rb_eleve_id`), d'où le détour par
 * `eleve.auth_id`. C'est le même piège que les notifications.
 */
export async function chargerRituels(
  admin: SupabaseClient,
  args: {
    debut: string;
    fin: string;
    eleves: EleveRituel[];
    blocs: Array<{ eleve_id: string | null; repetibox_eleve_id: number | null; date_assignation: string }>;
  },
): Promise<BlocSuivi[]> {
  const [problemes, calculs, elevesRB] = await Promise.all([
    admin.from("daily_problems").select("date, niveau").gte("date", args.debut).lte("date", args.fin),
    admin.from("calcul_jour").select("id, date, niveau_id").gte("date", args.debut).lte("date", args.fin),
    admin.from("eleve").select("id, auth_id"),
  ]);

  const problemesPoses: RituelPose[] = ((problemes.data ?? []) as Array<{ date: string; niveau: string }>)
    .map((p) => ({ date: p.date, niveau: p.niveau }));

  const lignesCalcul = (calculs.data ?? []) as Array<{ id: string; date: string; niveau_id: string }>;
  const calculsPoses: RituelPose[] = lignesCalcul
    .map((c) => ({ date: c.date, niveau: NIVEAU_PAR_ID.get(c.niveau_id) ?? "" }))
    .filter((c) => c.niveau !== "");
  const dateParCalcul = new Map(lignesCalcul.map((c) => [c.id, c.date]));

  // uuid d'auth → uid du suivi. Un élève PlanBox est déjà son propre uuid.
  const uidParAuth = new Map<string, string>();
  for (const e of (elevesRB.data ?? []) as Array<{ id: number; auth_id: string | null }>) {
    if (e.auth_id) uidParAuth.set(e.auth_id, `rb_${e.id}`);
  }
  for (const e of args.eleves) {
    if (e.uid.startsWith("pb_")) uidParAuth.set(e.uid.slice(3), e.uid);
  }

  const tentatives = await lireTout<{ student_id: string; date: string; solved: boolean | null; attempts: number | null }>(
    (d, f) => admin.from("problem_attempts")
      .select("student_id, date, solved, attempts")
      .gte("date", args.debut).lte("date", args.fin)
      .order("date", { ascending: true }).order("id", { ascending: true })
      .range(d, f),
    "chargerRituels/problem_attempts",
  );

  // Terminé, pas seulement réussi : trois essais épuisés, la correction lue, il
  // n'y a plus rien à faire (`lib/probleme-du-jour.ts`).
  const problemesFaits: RituelFait[] = tentatives
    .filter((t) => t.solved === true || (t.attempts ?? 0) >= MAX_TENTATIVES)
    .map((t) => ({ uid: uidParAuth.get(t.student_id) ?? "", date: t.date }))
    .filter((f) => f.uid !== "");

  const idsCalcul = lignesCalcul.map((c) => c.id);
  const resultats: Array<{ calcul_id: string; eleve_id: string | null; rb_eleve_id: number | null }> = [];
  for (let i = 0; i < idsCalcul.length; i += 200) {
    const tranche = idsCalcul.slice(i, i + 200);
    const lot = await lireTout<{ calcul_id: string; eleve_id: string | null; rb_eleve_id: number | null }>(
      (d, f) => admin.from("calcul_jour_resultat")
        .select("calcul_id, eleve_id, rb_eleve_id")
        .in("calcul_id", tranche)
        .order("id", { ascending: true })
        .range(d, f),
      "chargerRituels/calcul_jour_resultat",
    );
    resultats.push(...lot);
  }

  const calculsFaits: RituelFait[] = resultats
    .map((r) => ({
      uid: r.eleve_id ? `pb_${r.eleve_id}` : r.rb_eleve_id !== null ? `rb_${r.rb_eleve_id}` : "",
      date: dateParCalcul.get(r.calcul_id) ?? "",
    }))
    .filter((f) => f.uid !== "" && f.date !== "");

  return construireRituels({
    eleves: args.eleves,
    blocs: args.blocs,
    problemesPoses,
    problemesFaits,
    calculsPoses,
    calculsFaits,
  });
}

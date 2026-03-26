import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/feedback
 *
 * Retourne les données de feedback par exercice pour le dashboard enseignant.
 * Agrège les blocs plan_travail de la semaine courante, groupés par exercice,
 * avec statut et score par élève.
 */
export async function GET(req: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const periode = searchParams.get("periode") ?? "semaine";

  const now = new Date();
  const today = now.toISOString().split("T")[0];

  let dateDebut: string;
  let dateFin: string;
  let labelPeriode: string;

  if (periode === "jour") {
    dateDebut = today;
    dateFin = today;
    labelPeriode = new Date(today + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  } else {
    // Bornes de la semaine courante (lundi → dimanche)
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    dateDebut = monday.toISOString().split("T")[0];
    dateFin = sunday.toISOString().split("T")[0];
    labelPeriode = `Semaine du ${monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
  }

  // Récupérer tous les blocs avec contenu (pour les scores)
  const { data: blocs, error } = await admin
    .from("plan_travail")
    .select("id, type, titre, statut, contenu, date_assignation, date_limite, periodicite, eleve_id, repetibox_eleve_id, chapitre_id, groupe_label")
    .gte("date_assignation", dateDebut)
    .lte("date_assignation", dateFin)
    .order("date_assignation");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lignes = blocs ?? [];

  // Enrichir avec noms des élèves
  const pbIds = [...new Set(lignes.map((l: any) => l.eleve_id).filter(Boolean))] as string[];
  const rbIds = [...new Set(lignes.map((l: any) => l.repetibox_eleve_id).filter((id: any) => id != null))] as number[];

  const [pbRes, rbRes] = await Promise.all([
    pbIds.length > 0 ? admin.from("eleves").select("id, prenom, nom").in("id", pbIds) : Promise.resolve({ data: [] }),
    rbIds.length > 0 ? admin.from("eleve").select("id, prenom, nom").in("id", rbIds) : Promise.resolve({ data: [] }),
  ]);

  const pbMap = new Map<string, { prenom: string; nom: string }>();
  (pbRes.data ?? []).forEach((e: any) => pbMap.set(e.id, e));
  const rbMap = new Map<number, { prenom: string; nom: string }>();
  (rbRes.data ?? []).forEach((e: any) => rbMap.set(e.id, e));

  // Grouper par exercice (même type + titre + chapitre)
  interface EleveFeedback {
    id: string;
    prenom: string;
    nom: string;
    statut: string;
    scoreEleve: number | null;
    scoreTotal: number | null;
    groupe: string;
    reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[] | null;
    questions: { id: number; enonce: string; reponse_attendue: string }[] | null;
    dateAssignation: string;
    dateLimite: string | null;
    enRetard: boolean;
  }

  interface ExerciceGroupe {
    cle: string;
    type: string;
    titre: string;
    chapitreId: string | null;
    groupes: string[];
    dateAssignation: string;
    eleves: EleveFeedback[];
    // Détail des questions les plus ratées (pour exercices/eval)
    questionsErreurs: { enonce: string; tauxErreur: number }[];
  }

  const map = new Map<string, ExerciceGroupe>();

  for (const l of lignes) {
    const cle = `${l.type}__${l.titre}__${l.chapitre_id ?? "null"}`;
    const contenu = l.contenu as any;

    const eleveId = l.eleve_id ?? `rb_${l.repetibox_eleve_id}`;
    const eleveInfo = l.eleve_id
      ? pbMap.get(l.eleve_id)
      : rbMap.get(l.repetibox_eleve_id);

    const isEnRetard = l.statut !== "fait" && l.date_limite && l.date_limite < today;

    const eleve: EleveFeedback = {
      id: eleveId,
      prenom: eleveInfo?.prenom ?? "—",
      nom: eleveInfo?.nom ?? "",
      statut: l.statut,
      scoreEleve: contenu?.score_eleve ?? null,
      scoreTotal: contenu?.score_total ?? null,
      groupe: l.groupe_label ?? "",
      reponsesEleve: contenu?.reponses_eleve ?? null,
      questions: contenu?.questions
        ?? contenu?.trous?.map((t: any, i: number) => ({ id: i + 1, enonce: `Trou : ______`, reponse_attendue: t.mot }))
        ?? contenu?.phrases?.flatMap((ph: any, pi: number) => ph.groupes?.map((g: any, gi: number) => ({ id: pi * 10 + gi + 1, enonce: `"${g.mots}" dans : ${ph.texte?.substring(0, 50)}...`, reponse_attendue: g.fonction })) ?? [])
        ?? contenu?.calculs?.map((c: any) => ({ id: c.id, enonce: c.enonce, reponse_attendue: String(c.reponse) }))
        ?? (contenu?.questions && contenu?.texte && !contenu?.calculs ? contenu.questions.map((q: any) => ({ id: q.id, enonce: q.question, reponse_attendue: q.choix?.[q.reponse] ?? '' })) : null)
        ?? (contenu?.categories?.length > 0 ? contenu.items?.map((it: any, i: number) => ({ id: i + 1, enonce: it.texte, reponse_attendue: it.categorie })) : null)
        ?? contenu?.qcm?.map((q: any, i: number) => ({ id: i + 1, enonce: q.question, reponse_attendue: q.options?.[q.reponse_correcte] ?? "?" }))
        ?? null,
      dateAssignation: l.date_assignation,
      dateLimite: l.date_limite,
      enRetard: !!isEnRetard,
    };

    if (!map.has(cle)) {
      map.set(cle, {
        cle,
        type: l.type,
        titre: l.titre,
        chapitreId: l.chapitre_id,
        groupes: [],
        dateAssignation: l.date_assignation,
        eleves: [],
        questionsErreurs: [],
      });
    }

    const groupe = map.get(cle)!;
    if (l.groupe_label && !groupe.groupes.includes(l.groupe_label)) {
      groupe.groupes.push(l.groupe_label);
    }

    // Dédupliquer : un même élève peut avoir le même exercice plusieurs jours (periodicite "jour")
    // On garde le meilleur statut (fait > en_cours > a_faire) et le score le plus récent
    const existingIdx = groupe.eleves.findIndex((e) => e.id === eleveId);
    if (existingIdx >= 0) {
      const existing = groupe.eleves[existingIdx];
      const statutOrder: Record<string, number> = { fait: 3, en_cours: 2, a_faire: 1 };
      const newOrder = statutOrder[eleve.statut] ?? 0;
      const oldOrder = statutOrder[existing.statut] ?? 0;
      if (newOrder > oldOrder || (newOrder === oldOrder && eleve.scoreEleve !== null)) {
        groupe.eleves[existingIdx] = eleve;
      }
    } else {
      groupe.eleves.push(eleve);
    }
  }

  // Calculer les stats par exercice
  const exercices = [...map.values()].map((g) => {
    const total = g.eleves.length;
    const faits = g.eleves.filter((e) => e.statut === "fait").length;
    const enCours = g.eleves.filter((e) => e.statut === "en_cours").length;
    const enRetard = g.eleves.filter((e) => e.enRetard).length;

    // Score moyen (uniquement pour les exercices avec score)
    const avecScore = g.eleves.filter((e) => e.scoreEleve !== null && e.scoreTotal !== null && e.scoreTotal > 0);
    const scoreMoyen = avecScore.length > 0
      ? Math.round(avecScore.reduce((sum, e) => sum + ((e.scoreEleve! / e.scoreTotal!) * 100), 0) / avecScore.length)
      : null;

    return {
      cle: g.cle,
      type: g.type,
      titre: g.titre,
      groupes: g.groupes,
      dateAssignation: g.dateAssignation,
      total,
      faits,
      enCours,
      enRetard,
      scoreMoyen,
      eleves: g.eleves.sort((a, b) => {
        // Trier : en retard d'abord, puis en cours, puis à faire, puis fait
        const ordre = { fait: 3, en_cours: 1, a_faire: 2 };
        const oA = a.enRetard ? 0 : (ordre[a.statut as keyof typeof ordre] ?? 2);
        const oB = b.enRetard ? 0 : (ordre[b.statut as keyof typeof ordre] ?? 2);
        return oA - oB;
      }),
    };
  });

  // Alertes
  const alertes: { type: string; message: string; exercice?: string }[] = [];

  // Élèves en retard
  const totalEnRetard = exercices.reduce((s, e) => s + e.enRetard, 0);
  if (totalEnRetard > 0) {
    alertes.push({
      type: "retard",
      message: `${totalEnRetard} élève${totalEnRetard > 1 ? "s" : ""} en retard sur leurs exercices`,
    });
  }

  // Exercices avec taux de réussite < 50%
  for (const ex of exercices) {
    if (ex.scoreMoyen !== null && ex.scoreMoyen < 50) {
      alertes.push({
        type: "difficulte",
        message: `"${ex.titre}" — taux de réussite de ${ex.scoreMoyen}% seulement`,
        exercice: ex.cle,
      });
    }
  }

  // Stats globales
  const totalBlocs = exercices.reduce((s, e) => s + e.total, 0);
  const totalFaits = exercices.reduce((s, e) => s + e.faits, 0);
  const tauxCompletion = totalBlocs > 0 ? Math.round((totalFaits / totalBlocs) * 100) : 0;

  const exAvecScore = exercices.filter((e) => e.scoreMoyen !== null);
  const tauxReussiteMoyen = exAvecScore.length > 0
    ? Math.round(exAvecScore.reduce((s, e) => s + e.scoreMoyen!, 0) / exAvecScore.length)
    : null;

  // ── Problème du jour : tentatives avec réponses ──
  const { data: dailyAttempts } = await admin
    .from("problem_attempts")
    .select("student_id, solved, attempts, hints_used, student_answer, problem_id, date")
    .gte("date", dateDebut)
    .lte("date", dateFin);

  // Enrichir avec prénoms
  const studentIds = [...new Set((dailyAttempts ?? []).map((a: any) => a.student_id))];
  let studentMap: Record<string, string> = {};
  if (studentIds.length > 0) {
    // Chercher dans eleve (Repetibox) via auth_id
    const { data: rbEleves } = await admin.from("eleve").select("auth_id, prenom, nom").in("auth_id", studentIds);
    for (const e of rbEleves ?? []) {
      if (e.auth_id) studentMap[e.auth_id] = `${e.prenom} ${e.nom ?? ""}`.trim();
    }
    // Chercher dans eleves (Plan Box)
    const { data: pbEleves } = await admin.from("eleves").select("id, prenom, nom").in("id", studentIds);
    for (const e of pbEleves ?? []) {
      studentMap[e.id] = `${e.prenom} ${e.nom ?? ""}`.trim();
    }
  }

  const problemesDuJour = (dailyAttempts ?? []).map((a: any) => ({
    studentId: a.student_id,
    prenom: studentMap[a.student_id] ?? "—",
    solved: a.solved,
    attempts: a.attempts,
    hintsUsed: a.hints_used,
    studentAnswer: a.student_answer,
    date: a.date,
  }));

  return NextResponse.json({
    semaine: labelPeriode,
    exercices,
    alertes,
    problemesDuJour,
    stats: {
      totalBlocs,
      totalFaits,
      tauxCompletion,
      tauxReussiteMoyen,
      totalExercices: exercices.length,
    },
  });
}

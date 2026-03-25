import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { getCurrentSchoolWeek } from "@/lib/schoolWeek";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  // Vérifier que c'est un enseignant (a des classes dans Repetibox)
  const { data: classes } = await admin
    .from("classe")
    .select("id, nom")
    .eq("user_id", user.id);

  if (!classes || classes.length === 0) {
    return NextResponse.json({ error: "Accès réservé aux enseignants" }, { status: 403 });
  }

  const today = new Date().toISOString().split("T")[0];
  const schoolWeek = await getCurrentSchoolWeek();

  // Problèmes du jour — créer automatiquement s'ils n'existent pas encore
  let { data: dailyProblems } = await admin
    .from("daily_problems")
    .select("*, math_problems(*)")
    .eq("date", today);

  // Auto-créer les problèmes CM1, CM2 et CE2 si manquants et jour scolaire
  if (schoolWeek) {
    for (const niv of ["CM1", "CM2", "CE2"] as const) {
      const exists = dailyProblems?.find((dp: any) => dp.niveau === niv);
      if (!exists) {
        const niveauxFiltre = niv === "CM2" ? ["CM2", "CM2+"] : niv === "CE2" ? ["CE2"] : ["CM1", "CM1+"];
        const { data: candidates } = await admin
          .from("math_problems")
          .select("*")
          .eq("periode", schoolWeek.periode)
          .eq("semaine", schoolWeek.semaine)
          .in("niveau", niveauxFiltre)
          .eq("difficulte", "semaine")
          .not("reponse", "is", null)
          .limit(20);

        let pool = candidates;
        if (!pool || pool.length === 0) {
          // Fallback : même période, toutes semaines
          const { data: fallback } = await admin
            .from("math_problems")
            .select("*")
            .eq("periode", schoolWeek.periode)
            .in("niveau", niveauxFiltre)
            .eq("difficulte", "semaine")
            .not("reponse", "is", null)
            .limit(20);
          pool = fallback;
        }

        if (pool && pool.length > 0) {
          const selected = pool[Math.floor(Math.random() * pool.length)];
          await admin.from("daily_problems").upsert(
            { date: today, niveau: niv, problem_id: selected.id },
            { onConflict: "date,niveau" }
          );
        }
      }
    }

    // Recharger après création
    const { data: refreshed } = await admin
      .from("daily_problems")
      .select("*, math_problems(*)")
      .eq("date", today);
    dailyProblems = refreshed;
  }

  const problemCM1 = dailyProblems?.find((dp: any) => dp.niveau === "CM1");
  const problemCM2 = dailyProblems?.find((dp: any) => dp.niveau === "CM2");
  const problemCE2 = dailyProblems?.find((dp: any) => dp.niveau === "CE2");

  // Élèves de toutes les classes
  const classeIds = classes.map((c: any) => c.id);
  const { data: eleves } = await admin
    .from("eleve")
    .select("id, prenom, classe_id, auth_id, niveau_plus")
    .in("classe_id", classeIds);

  // Récupérer les groupes de ces classes pour déterminer le niveau
  const { data: groupes } = await admin
    .from("groupe")
    .select("id, nom, classe_id")
    .in("classe_id", classeIds);

  const eleveIds = (eleves ?? []).map((e: any) => e.id);
  const { data: groupeEleves } = await admin
    .from("groupe_eleve")
    .select("groupe_id, eleve_id")
    .in("eleve_id", eleveIds.length > 0 ? eleveIds : [0]);

  // Construire un map eleve_id -> niveau depuis le nom du groupe
  const groupeMap = Object.fromEntries((groupes ?? []).map((g: any) => [g.id, g.nom]));
  const eleveNiveauMap: Record<number, string> = {};
  for (const ge of groupeEleves ?? []) {
    const groupeNom = groupeMap[ge.groupe_id] ?? "";
    // Détecter CM1, CM2 ou CE2 (et autres niveaux)
    const matchCM = groupeNom.match(/CM[12]/i);
    const matchCE = groupeNom.match(/CE[12]/i);
    if (matchCM) {
      eleveNiveauMap[ge.eleve_id] = matchCM[0].toUpperCase();
    } else if (matchCE) {
      eleveNiveauMap[ge.eleve_id] = matchCE[0].toUpperCase();
    }
  }

  // Map eleve_id → nom du groupe
  const eleveGroupeMap: Record<number, string> = {};
  for (const ge of groupeEleves ?? []) {
    const groupeNom = groupeMap[ge.groupe_id] ?? "";
    if (groupeNom) eleveGroupeMap[ge.eleve_id] = groupeNom;
  }

  // Garder tous les élèves avec leur vrai niveau et groupe
  const elevesAvecNiveau = (eleves ?? []).map((e: any) => {
    const niveau = eleveNiveauMap[e.id] ?? "CM1";
    const groupe = eleveGroupeMap[e.id] ?? "";
    return { id: e.id, prenom: e.prenom, auth_id: e.auth_id, niveau, groupe, niveau_plus: e.niveau_plus ?? false };
  });

  // Tentatives du jour
  const authIds = elevesAvecNiveau.map((e: any) => e.auth_id).filter(Boolean);
  const attemptsMap: Record<string, any> = {};
  if (authIds.length > 0) {
    const { data: attempts } = await admin
      .from("problem_attempts")
      .select("student_id, solved, attempts, hints_used")
      .eq("date", today)
      .in("student_id", authIds);
    for (const a of attempts ?? []) attemptsMap[a.student_id] = a;
  }

  // Taux de réussite sur 14 jours pour suggestion niveau+
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twoWeeksStr = twoWeeksAgo.toISOString().split("T")[0];

  const recentStatsMap: Record<string, { total: number; solved: number }> = {};
  if (authIds.length > 0) {
    const { data: recentAttempts } = await admin
      .from("problem_attempts")
      .select("student_id, solved")
      .gte("date", twoWeeksStr)
      .in("student_id", authIds);
    for (const a of recentAttempts ?? []) {
      if (!recentStatsMap[a.student_id]) recentStatsMap[a.student_id] = { total: 0, solved: 0 };
      recentStatsMap[a.student_id].total++;
      if (a.solved) recentStatsMap[a.student_id].solved++;
    }
  }

  const elevesData = elevesAvecNiveau.map((e: any) => {
    const attempt = attemptsMap[e.auth_id];
    const recent = recentStatsMap[e.auth_id ?? ""];
    const tauxRecent = recent && recent.total >= 3
      ? Math.round((recent.solved / recent.total) * 100)
      : null;
    // Suggérer niveau+ si taux >= 80% sur au moins 5 problèmes
    const suggestedPlus = recent && recent.total >= 5 && (recent.solved / recent.total) >= 0.8;
    return {
      id: e.id, prenom: e.prenom, niveau: e.niveau, groupe: e.groupe,
      auth_id: e.auth_id ?? null,
      solved: attempt?.solved ?? null,
      attempts: attempt?.attempts ?? 0,
      hints_used: attempt?.hints_used ?? 0,
      niveau_plus: e.niveau_plus ?? false,
      tauxRecent,
      recentTotal: recent?.total ?? 0,
      recentSolved: recent?.solved ?? 0,
      suggestedPlus: suggestedPlus ?? false,
    };
  });

  const attempted = elevesData.filter((e: any) => e.attempts > 0);
  const solved = elevesData.filter((e: any) => e.solved === true);

  // Historique 7 jours
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysStr = sevenDaysAgo.toISOString().split("T")[0];

  const { data: history } = await admin
    .from("daily_problems")
    .select("date, niveau, math_problems(enonce, categorie)")
    .gte("date", sevenDaysStr)
    .order("date", { ascending: false });

  const { data: historyAttempts } = await admin
    .from("problem_attempts")
    .select("date, solved")
    .gte("date", sevenDaysStr)
    .in("student_id", authIds.length > 0 ? authIds : ["none"]);

  const historyByDate: Record<string, any> = {};
  for (const h of history ?? []) {
    if (!historyByDate[h.date]) historyByDate[h.date] = {};
    historyByDate[h.date][h.niveau] = h.math_problems;
  }

  const attemptsByDate: Record<string, { total: number; solved: number }> = {};
  for (const a of historyAttempts ?? []) {
    if (!attemptsByDate[a.date]) attemptsByDate[a.date] = { total: 0, solved: 0 };
    attemptsByDate[a.date].total++;
    if (a.solved) attemptsByDate[a.date].solved++;
  }

  const historyData = Object.entries(historyByDate).map(([date, niveaux]: [string, any]) => ({
    date,
    ce2: niveaux.CE2 ?? null,
    cm1: niveaux.CM1 ?? null,
    cm2: niveaux.CM2 ?? null,
    tauxReussite: attemptsByDate[date]
      ? Math.round((attemptsByDate[date].solved / attemptsByDate[date].total) * 100)
      : null,
  }));

  // ── Stats mensuelles par groupe (9 derniers mois) ──
  const nineMonthsAgo = new Date();
  nineMonthsAgo.setMonth(nineMonthsAgo.getMonth() - 9);
  const nineMonthsStr = nineMonthsAgo.toISOString().split("T")[0];

  const { data: monthlyAttempts } = await admin
    .from("problem_attempts")
    .select("student_id, date, solved")
    .gte("date", nineMonthsStr)
    .in("student_id", authIds.length > 0 ? authIds : ["none"]);

  // Map auth_id -> groupe
  const authToGroupe: Record<string, string> = {};
  for (const e of elevesAvecNiveau) {
    if (e.auth_id) authToGroupe[e.auth_id] = e.groupe || e.niveau;
  }

  // Agréger par mois + groupe
  const monthlyByGroup: Record<string, Record<string, { total: number; solved: number }>> = {};
  for (const a of monthlyAttempts ?? []) {
    const month = a.date.substring(0, 7); // "YYYY-MM"
    const groupe = authToGroupe[a.student_id] || "Autre";
    if (!monthlyByGroup[month]) monthlyByGroup[month] = {};
    if (!monthlyByGroup[month][groupe]) monthlyByGroup[month][groupe] = { total: 0, solved: 0 };
    monthlyByGroup[month][groupe].total++;
    if (a.solved) monthlyByGroup[month][groupe].solved++;
  }

  // Formater pour le front
  const allGroupes = [...new Set(Object.values(authToGroupe))].sort();
  const months = Object.keys(monthlyByGroup).sort();
  const monthlyStats = months.map(m => ({
    month: m,
    groups: allGroupes.map(g => ({
      groupe: g,
      total: monthlyByGroup[m]?.[g]?.total ?? 0,
      solved: monthlyByGroup[m]?.[g]?.solved ?? 0,
      taux: monthlyByGroup[m]?.[g]?.total
        ? Math.round((monthlyByGroup[m][g].solved / monthlyByGroup[m][g].total) * 100)
        : null,
    })),
  }));

  const fmt = (p: any) => p ? { id: p.id, enonce: p.enonce, categorie: p.categorie, periode: p.periode, semaine: p.semaine, reponse: p.reponse } : null;

  return NextResponse.json({
    schoolWeek,
    problemCM1: fmt((problemCM1?.math_problems as any)),
    problemCM2: fmt((problemCM2?.math_problems as any)),
    problemCE2: fmt((problemCE2?.math_problems as any)),
    eleves: elevesData,
    stats: {
      total_attempted: attempted.length,
      total_solved: solved.length,
      avg_attempts: attempted.length > 0 ? Math.round(attempted.reduce((s: number, e: any) => s + e.attempts, 0) / attempted.length * 10) / 10 : 0,
      avg_hints: attempted.length > 0 ? Math.round(attempted.reduce((s: number, e: any) => s + e.hints_used, 0) / attempted.length * 10) / 10 : 0,
    },
    history: historyData,
    monthlyStats,
    groupes: allGroupes,
  });
}

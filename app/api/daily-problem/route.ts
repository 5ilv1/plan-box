import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { getCurrentSchoolWeek } from "@/lib/schoolWeek";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  // Chercher l'élève dans "eleves" (Plan Box) OU "eleve" (Repetibox)
  let niveau = "CM1";
  let eleveRB: any = null;

  const { data: elevePB } = await admin
    .from("eleves")
    .select("id, niveau_id, niveaux(nom)")
    .eq("id", user.id)
    .maybeSingle();

  if (elevePB) {
    const niveauNom: string = (elevePB as any).niveaux?.nom ?? "";
    const match = niveauNom.match(/CM[12]/i);
    niveau = match ? match[0].toUpperCase() : "CM1";
  } else {
    // Repetibox : eleve.auth_id → groupe_eleve → groupe.nom
    const { data: eleveRBData } = await admin
      .from("eleve")
      .select("id, classe_id, niveau_plus")
      .eq("auth_id", user.id)
      .maybeSingle();
    eleveRB = eleveRBData;

    if (eleveRB) {
      // D'abord chercher dans les groupes (plus précis que le nom de classe)
      const { data: groupeEleve } = await admin
        .from("groupe_eleve")
        .select("groupe_id, groupe:groupe_id(nom)")
        .eq("eleve_id", eleveRB.id)
        .limit(10);

      let foundFromGroupe = false;
      let isNonCM = false;
      for (const ge of groupeEleve ?? []) {
        const groupeNom = (ge as any).groupe?.nom ?? "";
        // Détecter CM1/CM2
        const matchCM = groupeNom.match(/CM[12]/i);
        if (matchCM) {
          niveau = matchCM[0].toUpperCase();
          foundFromGroupe = true;
          break;
        }
        // Détecter CE2
        const matchCE2 = groupeNom.match(/CE2/i);
        if (matchCE2) {
          niveau = "CE2";
          foundFromGroupe = true;
          break;
        }
        // Détecter CE1 ou autre niveau sans problèmes
        const matchCE1 = groupeNom.match(/CE1|CP/i);
        if (matchCE1) {
          isNonCM = true;
        }
      }

      // Si l'élève est dans un groupe CE1/CP (pas de problèmes disponibles)
      if (!foundFromGroupe && isNonCM) {
        return NextResponse.json({ noSchool: true });
      }

      // Fallback : nom de classe
      if (!foundFromGroupe) {
        const { data: classe } = await admin
          .from("classe")
          .select("nom")
          .eq("id", eleveRB.classe_id)
          .single();
        const matchCM = classe?.nom?.match(/CM[12]/i);
        const matchCE2 = classe?.nom?.match(/CE2/i);
        if (matchCM) {
          niveau = matchCM[0].toUpperCase();
        } else if (matchCE2) {
          niveau = "CE2";
        } else {
          // Classe sans niveau reconnu → pas de problème
          return NextResponse.json({ noSchool: true });
        }
      }
    }
  }

  // Vérifier si c'est un jour scolaire
  const schoolWeek = await getCurrentSchoolWeek();
  if (!schoolWeek) return NextResponse.json({ noSchool: true });

  const today = new Date().toISOString().split("T")[0];

  // Chercher un problème déjà sélectionné pour aujourd'hui
  const { data: existing } = await admin
    .from("daily_problems")
    .select("id, problem_id, math_problems(*)")
    .eq("date", today)
    .eq("niveau", niveau)
    .maybeSingle();

  // Vérifier si l'élève a une tentative (y compris validation enseignant)
  const { data: attemptData } = await admin
    .from("problem_attempts")
    .select("solved, attempts, hints_used")
    .eq("student_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (existing?.math_problems) {
    const p = existing.math_problems as any;
    return NextResponse.json({
      id: p.id, enonce: p.enonce, categorie: p.categorie,
      periode: p.periode, semaine: p.semaine, niveau: p.niveau,
      ...(attemptData ? { serverAttempt: { solved: attemptData.solved, attempts: attemptData.attempts, hintsUsed: attemptData.hints_used } } : {}),
    });
  }

  // Sélectionner un problème aléatoire
  const hasPlus = elevePB ? false : (eleveRB as any)?.niveau_plus === true;
  const niveauxFiltre = niveau === "CM2"
    ? (hasPlus ? ["CM2", "CM2+"] : ["CM2"])
    : niveau === "CE2"
      ? ["CE2"]
      : (hasPlus ? ["CM1", "CM1+"] : ["CM1"]);

  const { data: problems } = await admin
    .from("math_problems")
    .select("*")
    .eq("periode", schoolWeek.periode)
    .eq("semaine", schoolWeek.semaine)
    .in("niveau", niveauxFiltre)
    .eq("difficulte", "semaine")
    .not("reponse", "is", null)
    .limit(20);

  if (!problems || problems.length === 0) {
    // Fallback : même période, toutes semaines
    const { data: fallback } = await admin
      .from("math_problems")
      .select("*")
      .eq("periode", schoolWeek.periode)
      .in("niveau", niveauxFiltre)
      .eq("difficulte", "semaine")
      .not("reponse", "is", null)
      .limit(20);

    if (!fallback || fallback.length === 0) return NextResponse.json({ noSchool: true });

    const selected = fallback[Math.floor(Math.random() * fallback.length)];
    await admin.from("daily_problems").upsert(
      { date: today, niveau, problem_id: selected.id },
      { onConflict: "date,niveau" }
    );
    return NextResponse.json({
      id: selected.id, enonce: selected.enonce, categorie: selected.categorie,
      periode: selected.periode, semaine: selected.semaine, niveau: selected.niveau,
    });
  }

  const selected = problems[Math.floor(Math.random() * problems.length)];
  await admin.from("daily_problems").upsert(
    { date: today, niveau, problem_id: selected.id },
    { onConflict: "date,niveau" }
  );

  return NextResponse.json({
    id: selected.id, enonce: selected.enonce, categorie: selected.categorie,
    periode: selected.periode, semaine: selected.semaine, niveau: selected.niveau,
  });
}

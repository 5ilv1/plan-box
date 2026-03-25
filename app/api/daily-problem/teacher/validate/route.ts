import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  // Vérifier que c'est un enseignant
  const { data: classes } = await admin
    .from("classe")
    .select("id")
    .eq("user_id", user.id);

  if (!classes || classes.length === 0) {
    return NextResponse.json({ error: "Accès réservé aux enseignants" }, { status: 403 });
  }

  const { student_auth_id, solved } = await req.json();

  if (!student_auth_id || typeof solved !== "boolean") {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // Vérifier que l'élève appartient bien à une classe de cet enseignant
  const classeIds = classes.map((c: any) => c.id);
  const { data: eleve } = await admin
    .from("eleve")
    .select("id, auth_id")
    .eq("auth_id", student_auth_id)
    .in("classe_id", classeIds)
    .single();

  if (!eleve) {
    return NextResponse.json({ error: "Élève non trouvé" }, { status: 404 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Récupérer le problème du jour pour le niveau de cet élève
  // On cherche la tentative existante ou on en crée une
  const { data: existingAttempt } = await admin
    .from("problem_attempts")
    .select("id, problem_id")
    .eq("student_id", student_auth_id)
    .eq("date", today)
    .single();

  if (existingAttempt) {
    // Mettre à jour la tentative existante
    await admin
      .from("problem_attempts")
      .update({ solved })
      .eq("id", existingAttempt.id);
  } else {
    // Trouver le niveau via les groupes
    const { data: eleveForNiveau } = await admin
      .from("eleve")
      .select("id, classe_id")
      .eq("auth_id", student_auth_id)
      .single();

    let niveau = "CM1";
    if (eleveForNiveau) {
      const { data: groupeEleve } = await admin
        .from("groupe_eleve")
        .select("groupe_id, groupe:groupe_id(nom)")
        .eq("eleve_id", eleveForNiveau.id)
        .limit(10);

      for (const ge of groupeEleve ?? []) {
        const groupeNom = (ge as any).groupe?.nom ?? "";
        const match = groupeNom.match(/CM[12]/i);
        if (match) { niveau = match[0].toUpperCase(); break; }
      }

      // Fallback : nom de classe
      if (niveau === "CM1" && eleveForNiveau.classe_id) {
        const { data: classe } = await admin
          .from("classe")
          .select("nom")
          .eq("id", eleveForNiveau.classe_id)
          .single();
        const match = classe?.nom?.match(/CM[12]/i);
        if (match) niveau = match[0].toUpperCase();
      }
    }

    const { data: dailyProblem } = await admin
      .from("daily_problems")
      .select("problem_id")
      .eq("date", today)
      .eq("niveau", niveau)
      .single();

    if (!dailyProblem) {
      return NextResponse.json({ error: "Aucun problème du jour trouvé" }, { status: 404 });
    }

    // Créer une nouvelle tentative
    await admin.from("problem_attempts").insert({
      student_id: student_auth_id,
      problem_id: dailyProblem.problem_id,
      date: today,
      attempts: 1,
      solved,
      hints_used: 0,
    });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { problem_id, student_answer, attempts } = await req.json();
  if (!problem_id || student_answer === undefined) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: problem } = await admin
    .from("math_problems")
    .select("reponse")
    .eq("id", problem_id)
    .single();

  if (!problem || problem.reponse === null) {
    return NextResponse.json({ error: "Problème non trouvé" }, { status: 404 });
  }

  const cleaned = String(student_answer).trim().replace(",", ".");
  const studentNum = parseFloat(cleaned);

  if (isNaN(studentNum)) {
    if ((attempts ?? 0) >= 3) return NextResponse.json({ correct: false, correctAnswer: problem.reponse });
    return NextResponse.json({ correct: false });
  }

  const correct = problem.reponse;
  const isCorrect =
    (correct !== 0 && Math.abs(studentNum - correct) / Math.abs(correct) <= 0.005) ||
    (correct === 0 && Math.abs(studentNum) <= 0.005) ||
    Math.round(studentNum * 10) === Math.round(correct * 10);

  if (isCorrect) return NextResponse.json({ correct: true });
  if ((attempts ?? 0) >= 3) return NextResponse.json({ correct: false, correctAnswer: correct });
  return NextResponse.json({ correct: false });
}

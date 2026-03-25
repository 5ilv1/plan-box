import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { problem_id, solved, hints_used, attempts, student_answer } = await req.json();
  if (!problem_id) return NextResponse.json({ error: "problem_id requis" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];
  const admin = createAdminClient();

  await admin.from("problem_attempts").upsert(
    {
      student_id: user.id,
      problem_id,
      date: today,
      solved: solved ?? false,
      hints_used: hints_used ?? 0,
      attempts: attempts ?? 0,
      student_answer: student_answer ?? null,
    },
    { onConflict: "student_id,problem_id,date" }
  );

  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

/**
 * POST /api/insert-plan-travail-batch
 * Insère des lignes plan_travail pré-construites via le client admin (bypass RLS).
 */
export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { lignes } = await req.json();

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return NextResponse.json({ error: "Aucune ligne à insérer" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Insérer par lots de 200
  let totalInserted = 0;
  for (let i = 0; i < lignes.length; i += 200) {
    const batch = lignes.slice(i, i + 200);
    const { error } = await admin.from("plan_travail").insert(batch);
    if (error) {
      return NextResponse.json({ error: error.message, inserted: totalInserted }, { status: 500 });
    }
    totalInserted += batch.length;
  }

  return NextResponse.json({ ok: true, nb: totalInserted });
}

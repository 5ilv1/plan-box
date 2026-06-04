import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/bibliotheque/lus?eleve_id=UUID ou ?rb_id=NUMBER
 * Retourne les livres terminés par l'élève (éval finale réussie), enrichis
 * avec la couverture, l'auteur, la date de validation et le score.
 */
export async function GET(req: NextRequest) {
  const eleveId = req.nextUrl.searchParams.get("eleve_id");
  const rbId = req.nextUrl.searchParams.get("rb_id");

  if (!eleveId && !rbId) {
    return NextResponse.json({ error: "eleve_id ou rb_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  let evalQuery = admin
    .from("evaluation_resultat")
    .select("chapitre_id, reussi, score, total, created_at")
    .eq("reussi", true)
    .order("created_at", { ascending: false });
  if (eleveId) evalQuery = evalQuery.eq("eleve_id", eleveId);
  else evalQuery = evalQuery.eq("rb_eleve_id", parseInt(rbId!, 10));

  const { data: evals } = await evalQuery;
  if (!evals?.length) {
    return NextResponse.json({ livres: [] });
  }

  const chapIds = [...new Set(evals.map((e) => e.chapitre_id))];
  const { data: chapitres } = await admin
    .from("chapitres")
    .select("id, titre, auteur, couverture_url")
    .in("id", chapIds)
    .eq("disponible_bibliotheque", true);

  const chapMap = new Map((chapitres ?? []).map((c) => [c.id, c]));

  const livres = evals.map((e) => {
    const ch = chapMap.get(e.chapitre_id);
    return {
      chapitre_id: e.chapitre_id,
      titre: ch?.titre ?? "Livre supprimé",
      auteur: (ch as { auteur?: string } | undefined)?.auteur ?? null,
      couverture_url: (ch as { couverture_url?: string } | undefined)?.couverture_url ?? null,
      termine_le: e.created_at,
      score: e.score ?? null,
      total: e.total ?? null,
    };
  });

  return NextResponse.json({ livres });
}

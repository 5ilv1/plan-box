import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * GET /api/enseignant/ecriture/analyses?blocId=…
 *
 * Les passages de la correction automatique sur un texte d'élève : le premier
 * (son premier jet, et les fautes qu'on lui a signalées) et le dernier. Le
 * retour enseignant compare le premier jet au texte rendu
 * (`lib/ecriture-bilan.ts`).
 *
 * Les fautes portent le mot attendu, que l'élève ne voit jamais : réservé à
 * l'enseignant.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const blocId = req.nextUrl.searchParams.get("blocId");
  if (!blocId) return NextResponse.json({ erreur: "blocId requis" }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("ecriture_analyse")
    .select("cree_le, texte, erreurs")
    .eq("bloc_id", blocId)
    .order("cree_le", { ascending: true });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  const lignes = data ?? [];
  return NextResponse.json({
    nb: lignes.length,
    premiere: lignes[0] ?? null,
    derniere: lignes[lignes.length - 1] ?? null,
  });
}

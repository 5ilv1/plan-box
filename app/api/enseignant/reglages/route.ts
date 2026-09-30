import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

// Réglages de classe (table `reglage`, une ligne par clé). Liste fermée :
// une clé inconnue est refusée, pour qu'une faute de frappe ne crée pas un
// réglage que personne ne lit.
const CLES = { deblocage_progressif: "boolean" } as const;
type Cle = keyof typeof CLES;

// GET /api/enseignant/reglages → { deblocage_progressif: boolean }
export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;
  const { data, error } = await createAdminClient().from("reglage").select("cle, valeur");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  const reglages: Record<string, unknown> = { deblocage_progressif: false };
  for (const r of data ?? []) if (r.cle in CLES) reglages[r.cle] = r.valeur;
  return NextResponse.json(reglages);
}

// PUT /api/enseignant/reglages  { cle, valeur }
export async function PUT(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const cle = body?.cle as Cle | undefined;
  if (!cle || !(cle in CLES)) return NextResponse.json({ erreur: "Réglage inconnu" }, { status: 400 });
  if (typeof body.valeur !== CLES[cle]) return NextResponse.json({ erreur: "Valeur invalide" }, { status: 400 });
  const { error } = await createAdminClient()
    .from("reglage")
    .upsert({ cle, valeur: body.valeur, maj_le: new Date().toISOString() }, { onConflict: "cle" });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, [cle]: body.valeur });
}

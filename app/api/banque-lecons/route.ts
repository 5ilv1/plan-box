import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/banque-lecons
export async function GET() {
  const admin = createAdminClient();

  const [{ data: lecons, error }, { data: blocsAffectes }] = await Promise.all([
    admin
      .from("banque_lecons")
      .select("*")
      .order("matiere", { ascending: true })
      .order("titre", { ascending: true }),
    admin
      .from("plan_travail")
      .select("contenu, date_assignation")
      .eq("type", "lecon_copier"),
  ]);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Map url → date_assignation (la plus récente si plusieurs)
  const affectationsParUrl: Record<string, string> = {};
  for (const b of blocsAffectes ?? []) {
    const url = (b.contenu as Record<string, string>)?.url;
    const date = b.date_assignation as string | null;
    if (url && date) {
      if (!affectationsParUrl[url] || date > affectationsParUrl[url]) {
        affectationsParUrl[url] = date;
      }
    }
  }

  return NextResponse.json({ lecons: lecons ?? [], affectationsParUrl });
}

// POST /api/banque-lecons
// Body : { titre, matiere, url }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { titre, matiere, url, annee } = body as { titre: string; matiere: string; url: string; annee?: 1 | 2 | null };
  if (!titre?.trim()) return NextResponse.json({ erreur: "titre requis" }, { status: 400 });
  if (!matiere?.trim()) return NextResponse.json({ erreur: "matiere requise" }, { status: 400 });
  if (!url?.trim()) return NextResponse.json({ erreur: "url requise" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("banque_lecons")
    .insert({ titre: titre.trim(), matiere: matiere.trim(), url: url.trim(), annee: annee ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ lecon: data });
}

// PATCH /api/banque-lecons
// Body : { id, titre?, matiere?, url? }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erreur: "Corps JSON manquant" }, { status: 400 });

  const { id, titre, matiere, url, annee } = body as { id: string; titre?: string; matiere?: string; url?: string; annee?: 1 | 2 | null };
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const updates: Record<string, string | number | null> = {};
  if (titre?.trim()) updates.titre = titre.trim();
  if (matiere?.trim()) updates.matiere = matiere.trim();
  if (url?.trim()) updates.url = url.trim();
  if ("annee" in body) updates.annee = annee ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ erreur: "Aucune valeur à modifier" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("banque_lecons")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ lecon: data });
}

// DELETE /api/banque-lecons
// Body : { id }
// Supprime aussi les entrées plan_travail liées à cette leçon
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  // Récupérer l'URL avant suppression pour nettoyer plan_travail
  const { data: lecon } = await admin
    .from("banque_lecons")
    .select("url")
    .eq("id", body.id)
    .single();

  // Supprimer les blocs plan_travail associés (désaffectation côté élèves)
  if (lecon?.url) {
    await admin
      .from("plan_travail")
      .delete()
      .eq("type", "lecon_copier")
      .filter("contenu->>url", "eq", lecon.url);
  }

  const { error } = await admin.from("banque_lecons").delete().eq("id", body.id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

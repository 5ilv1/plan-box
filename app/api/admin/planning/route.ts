import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// Calcule le lundi de la semaine contenant une date
function getLundi(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00Z");
  const jour = d.getUTCDay(); // 0=dim, 1=lun, ...
  const diff = jour === 0 ? -6 : 1 - jour;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// GET /api/admin/planning?lundi=2026-03-11
// GET /api/admin/planning?debut=YYYY-MM-DD&fin=YYYY-MM-DD  (vue mois)
// Retourne tous les blocs de la période avec info élève
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;

  let lundiStr: string;
  let vendrediStr: string;

  // Mode plage libre (vue mois)
  if (params.has("debut") && params.has("fin")) {
    lundiStr = params.get("debut")!;
    vendrediStr = params.get("fin")!;
  } else {
    const lundiParam = params.get("lundi") ?? formatDate(new Date());
    const lundi = getLundi(lundiParam);
    const vendredi = new Date(lundi);
    vendredi.setUTCDate(lundi.getUTCDate() + 4);
    lundiStr = formatDate(lundi);
    vendrediStr = formatDate(vendredi);
  }

  const admin = createAdminClient();

  const { data: blocs, error } = await admin
    .from("plan_travail")
    .select("*, chapitres(titre, matiere), eleves(prenom, nom, niveaux(nom))")
    .gte("date_assignation", lundiStr)
    .lte("date_assignation", vendrediStr)
    .order("date_assignation")
    .order("created_at");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Récupérer les noms des élèves Repetibox séparément
  const rbIds = [...new Set(
    (blocs ?? [])
      .filter((b: any) => b.repetibox_eleve_id)
      .map((b: any) => b.repetibox_eleve_id)
  )];

  let rbMap = new Map<number, { prenom: string; nom: string }>();
  if (rbIds.length > 0) {
    const { data: rbEleves } = await admin
      .from("eleve")
      .select("id, prenom, nom")
      .in("id", rbIds);
    rbMap = new Map((rbEleves ?? []).map((e: any) => [e.id, e]));
  }

  // Enrichir chaque bloc avec l'info élève normalisée
  const blocsEnrichis = (blocs ?? []).map((b: any) => {
    let eleveInfo: { prenom: string; nom: string; source: string; niveau?: string } | null = null;

    if (b.eleve_id && b.eleves) {
      eleveInfo = {
        prenom: b.eleves.prenom,
        nom: b.eleves.nom,
        source: "planbox",
        niveau: b.eleves.niveaux?.nom,
      };
    } else if (b.repetibox_eleve_id) {
      const rb = rbMap.get(b.repetibox_eleve_id);
      if (rb) {
        eleveInfo = { prenom: rb.prenom, nom: rb.nom, source: "repetibox" };
      }
    }

    return { ...b, eleve_info: eleveInfo };
  });

  return NextResponse.json({
    blocs: blocsEnrichis,
    lundi: lundiStr,
    vendredi: vendrediStr,
  });
}

// PATCH /api/admin/planning
// Mode 1 : { blocId, date_assignation } → déplace le bloc (drag & drop)
// Mode 2 : { blocId, titre, contenu }  → modifie le contenu d'un bloc
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { blocId, date_assignation, titre, contenu } = body ?? {};

  if (!blocId) {
    return NextResponse.json({ erreur: "blocId requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Mode modification de contenu
  if (titre !== undefined || contenu !== undefined) {
    const champs: Record<string, unknown> = {};
    if (titre !== undefined) champs.titre = titre;
    if (contenu !== undefined) champs.contenu = contenu;

    const { error } = await admin.from("plan_travail").update(champs).eq("id", blocId);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Mode déplacement (drag & drop)
  if (!date_assignation) {
    return NextResponse.json({ erreur: "date_assignation ou titre/contenu requis" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_assignation)) {
    return NextResponse.json({ erreur: "Format date invalide (YYYY-MM-DD)" }, { status: 400 });
  }

  const { error } = await admin
    .from("plan_travail")
    .update({ date_assignation })
    .eq("id", blocId);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/planning?id=<uuid>
// Supprime un bloc du plan de travail
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");

  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  const { error } = await admin.from("plan_travail").delete().eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

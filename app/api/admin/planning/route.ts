import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

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
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

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

  // Chapitres & règles assignés (actifs) — filtrés par semaine affichée
  const { data: assignations } = await admin
    .from("chapitre_assignation")
    .select("chapitre_id, groupe_id, chapitres(titre, matiere, sous_matiere, date_debut), groupes(nom)")
    .eq("actif", true);

  const chapitresMap = new Map<string, { titre: string; matiere: string; isRegle: boolean; groupes: string[] }>();
  for (const a of (assignations ?? []) as any[]) {
    if (!a.chapitres?.titre) continue;

    const isRegle = a.chapitres.sous_matiere === "rituel-orthographe";
    const dateDebut = a.chapitres.date_debut as string | null;

    // Pour les règles : n'afficher que si date_debut tombe dans la semaine affichée
    if (isRegle && dateDebut) {
      if (dateDebut < lundiStr || dateDebut > vendrediStr) continue;
    }

    const id = a.chapitre_id;
    if (!chapitresMap.has(id)) {
      chapitresMap.set(id, {
        titre: a.chapitres.titre,
        matiere: a.chapitres.matiere ?? "",
        isRegle,
        groupes: [],
      });
    }
    if (a.groupes?.nom) {
      const entry = chapitresMap.get(id)!;
      if (!entry.groupes.includes(a.groupes.nom)) entry.groupes.push(a.groupes.nom);
    }
  }

  const chapitresActifs = Array.from(chapitresMap.values()).sort((a, b) => {
    if (a.isRegle !== b.isRegle) return a.isRegle ? 1 : -1;
    return a.titre.localeCompare(b.titre);
  });

  return NextResponse.json({
    blocs: blocsEnrichis,
    lundi: lundiStr,
    vendredi: vendrediStr,
    chapitresActifs,
  });
}

// PATCH /api/admin/planning
// Mode 1 : { blocId, date_assignation }              → déplace le bloc (drag & drop)
// Mode 2 : { blocId, titre, contenu }                → modifie le contenu d'un bloc
// Mode 3 : { blocId, date_assignation, groupe_label } → modifie date + groupe depuis le modal
export async function PATCH(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const { blocId, date_assignation, groupe_label, titre, contenu } = body ?? {};

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

  // Mode déplacement / réaffectation
  if (!date_assignation) {
    return NextResponse.json({ erreur: "date_assignation ou titre/contenu requis" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_assignation)) {
    return NextResponse.json({ erreur: "Format date invalide (YYYY-MM-DD)" }, { status: 400 });
  }

  const champs: Record<string, unknown> = { date_assignation };
  if (groupe_label !== undefined) champs.groupe_label = groupe_label;

  const { error } = await admin
    .from("plan_travail")
    .update(champs)
    .eq("id", blocId);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/planning?id=<uuid>
// Supprime un bloc du plan de travail
export async function DELETE(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const id = new URL(req.url).searchParams.get("id");

  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  const { error } = await admin.from("plan_travail").delete().eq("id", id);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

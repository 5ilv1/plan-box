import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/enseignant/diffuser-correction-dictee?jours=7
 * Liste les dictées assignées récemment groupées par (dictee_parent_id, date_assignation),
 * avec le statut de diffusion de la correction et le nombre d'élèves concernés.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const joursRaw = parseInt(url.searchParams.get("jours") ?? "7", 10);
  const jours = Math.min(Math.max(isNaN(joursRaw) ? 7 : joursRaw, 1), 90);

  const depuis = new Date();
  depuis.setDate(depuis.getDate() - jours);
  const depuisIso = depuis.toISOString().split("T")[0];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plan_travail")
    .select("id, titre, date_assignation, statut, correction_diffusee_le, contenu, eleve_id, repetibox_eleve_id")
    .eq("type", "dictee")
    .gte("date_assignation", depuisIso)
    .order("date_assignation", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[dictees-diffusion][GET]", error);
    return NextResponse.json({ erreur: "Erreur base de données" }, { status: 500 });
  }

  type Row = {
    id: string;
    titre: string;
    date_assignation: string;
    statut: string;
    correction_diffusee_le: string | null;
    contenu: { dictee_parent_id?: string; niveau_etoiles?: number; titre?: string } | null;
    eleve_id: string | null;
    repetibox_eleve_id: number | null;
  };

  // Regrouper par (dictee_parent_id, date_assignation) : 1 ligne = 1 dictée du jour
  const groupes = new Map<string, {
    dictee_parent_id: string;
    date_assignation: string;
    titre: string;
    niveau_etoiles: number | null;
    nb_eleves: number;
    nb_faits: number;
    correction_diffusee_le: string | null;
    blocs_ids: string[];
  }>();

  for (const r of (data ?? []) as Row[]) {
    const pid = r.contenu?.dictee_parent_id;
    if (!pid) continue;
    const key = `${pid}|${r.date_assignation}`;
    const g = groupes.get(key);
    if (!g) {
      groupes.set(key, {
        dictee_parent_id: pid,
        date_assignation: r.date_assignation,
        titre: r.contenu?.titre ?? r.titre,
        niveau_etoiles: r.contenu?.niveau_etoiles ?? null,
        nb_eleves: 1,
        nb_faits: r.statut === "fait" ? 1 : 0,
        correction_diffusee_le: r.correction_diffusee_le,
        blocs_ids: [r.id],
      });
    } else {
      g.nb_eleves++;
      if (r.statut === "fait") g.nb_faits++;
      // On considère diffusé dès qu'un bloc l'est (cohérence attendue)
      if (r.correction_diffusee_le && !g.correction_diffusee_le) {
        g.correction_diffusee_le = r.correction_diffusee_le;
      }
      g.blocs_ids.push(r.id);
    }
  }

  const liste = [...groupes.values()].sort((a, b) =>
    b.date_assignation.localeCompare(a.date_assignation),
  );

  return NextResponse.json({ dictees: liste });
}

/**
 * POST /api/enseignant/diffuser-correction-dictee
 * Body: { dictee_parent_id: string, date_assignation: string, diffuser?: boolean }
 *
 * Met à jour tous les blocs plan_travail de type "dictee" correspondants :
 *  - diffuser=true (défaut) → correction_diffusee_le = now()
 *  - diffuser=false        → correction_diffusee_le = null (annulation)
 *
 * Les élèves voient alors (ou cachent) le panneau "Correction de la dictée"
 * qui affiche le texte attendu + les consignes de relecture.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  let body: {
    dictee_parent_id?: string;
    date_assignation?: string;
    bloc_id?: string;
    diffuser?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreur: "Body JSON invalide" }, { status: 400 });
  }

  const diffuser = body.diffuser !== false; // défaut true
  const nouvelleValeur = diffuser ? new Date().toISOString() : null;

  const admin = createAdminClient();

  // Cible : soit un bloc précis, soit tous les blocs d'une dictée pour une date
  let query = admin
    .from("plan_travail")
    .update({ correction_diffusee_le: nouvelleValeur })
    .eq("type", "dictee");

  if (body.bloc_id) {
    query = query.eq("id", body.bloc_id);
  } else if (body.dictee_parent_id && body.date_assignation) {
    query = query
      .eq("contenu->>dictee_parent_id", body.dictee_parent_id)
      .eq("date_assignation", body.date_assignation);
  } else {
    return NextResponse.json(
      { erreur: "bloc_id OU (dictee_parent_id + date_assignation) requis" },
      { status: 400 },
    );
  }

  const { error, data } = await query.select("id");

  if (error) {
    console.error("[diffuser-correction-dictee]", error);
    return NextResponse.json({ erreur: "Erreur mise à jour" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    blocs_mis_a_jour: data?.length ?? 0,
    diffuse: diffuser,
  });
}

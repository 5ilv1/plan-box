import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";
import { lireEleve, type EleveRef } from "@/lib/ceintures-serveur";
import { REPRISE_PERIMEE_JOURS } from "@/lib/reprise";

/**
 * L'exercice en cours d'un élève, pour qu'il puisse le reprendre.
 *
 *   GET    /api/reprise?cle=…&rb_eleve_id=26  → { etat } ou { etat: null }
 *   POST   /api/reprise?cle=…&rb_eleve_id=26  ← { etat }
 *   DELETE /api/reprise?cle=…&rb_eleve_id=26  — l'exercice est fini
 *
 * Un élève ne voit et n'écrit que ses propres reprises : la même garde que
 * partout ailleurs (`requireProprietaireOuEnseignant`).
 *
 * Pas d'`upsert` : les index d'unicité sont partiels (`eleve_id` d'un côté,
 * `rb_eleve_id` de l'autre), `onConflict` ne sait pas les viser. On lit, puis
 * on met à jour ou on insère — comme `motus_partie` et `ceinture_variante`.
 */

function colonneEleve(e: EleveRef): [string, string | number] {
  return e.eleveId ? ["eleve_id", e.eleveId] : ["rb_eleve_id", e.rbEleveId as number];
}

/** Identité de l'élève et clé demandée, ou la réponse d'erreur qui convient. */
async function contexte(req: NextRequest) {
  const cle = req.nextUrl.searchParams.get("cle")?.trim();
  if (!cle || cle.length > 200) {
    return { erreur: NextResponse.json({ erreur: "cle requise" }, { status: 400 }) };
  }

  const eleve = lireEleve(req.nextUrl.searchParams);
  if (!eleve.eleveId && !eleve.rbEleveId) {
    return { erreur: NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 }) };
  }

  const auth = await requireProprietaireOuEnseignant(eleve.eleveId, eleve.rbEleveId);
  if (!auth.ok) return { erreur: auth.error };

  return { cle, eleve };
}

export async function GET(req: NextRequest) {
  const ctx = await contexte(req);
  if (ctx.erreur) return ctx.erreur;
  const { cle, eleve } = ctx;

  try {
    const admin = createAdminClient();
    const [col, val] = colonneEleve(eleve);

    // Une reprise oubliée depuis un mois ne vaut plus rien : l'élève est passé
    // à autre chose, et le contenu a pu changer entre-temps.
    const limite = new Date(Date.now() - REPRISE_PERIMEE_JOURS * 86_400_000).toISOString();

    const { data, error } = await admin
      .from("exercice_reprise")
      .select("etat, updated_at")
      .eq(col, val)
      .eq("cle", cle)
      .gte("updated_at", limite)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ etat: data?.etat ?? null, updated_at: data?.updated_at ?? null });
  } catch (e) {
    // Une reprise illisible ne doit jamais empêcher de faire l'exercice :
    // l'élève recommence du début, ce qui est le comportement d'avant.
    console.error("[reprise:GET]", e);
    return NextResponse.json({ etat: null });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await contexte(req);
  if (ctx.erreur) return ctx.erreur;
  const { cle, eleve } = ctx;

  let etat: unknown;
  try {
    ({ etat } = await req.json());
  } catch {
    return NextResponse.json({ erreur: "corps illisible" }, { status: 400 });
  }

  if (!etat || typeof etat !== "object") {
    return NextResponse.json({ erreur: "etat requis" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const [col, val] = colonneEleve(eleve);

    const { data: existante } = await admin
      .from("exercice_reprise")
      .select("id")
      .eq(col, val)
      .eq("cle", cle)
      .maybeSingle();

    if (existante) {
      const { error } = await admin
        .from("exercice_reprise")
        .update({ etat, updated_at: new Date().toISOString() })
        .eq("id", existante.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("exercice_reprise")
        .insert({ [col]: val, cle, etat });
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Une sauvegarde ratée ne doit pas interrompre l'élève en plein exercice :
    // il continue, il perd seulement la reprise. On le dit sans faire d'erreur.
    console.error("[reprise:POST]", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await contexte(req);
  if (ctx.erreur) return ctx.erreur;
  const { cle, eleve } = ctx;

  try {
    const admin = createAdminClient();
    const [col, val] = colonneEleve(eleve);
    await admin.from("exercice_reprise").delete().eq(col, val).eq("cle", cle);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reprise:DELETE]", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

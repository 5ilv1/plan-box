import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import {
  CONFIRMATION_ATTENDUE,
  OPTIONS_CONTENUS,
  SOUS_MATIERE_RITUEL,
  TABLES_TRAVAIL_ELEVE,
  type CleOptionContenu,
} from "@/lib/nouvelle-annee";

type Admin = ReturnType<typeof createAdminClient>;

/** Compte toutes les lignes d'une table sans les rapatrier. */
async function compter(admin: Admin, table: string): Promise<number> {
  const { count } = await (admin as any)
    .from(table)
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

/** Vide entièrement une table (Supabase exige un filtre pour un DELETE). */
async function viderTable(admin: Admin, table: string): Promise<number> {
  const avant = await compter(admin, table);
  if (avant === 0) return 0;
  const { error } = await (admin as any).from(table).delete().not("id", "is", null);
  if (error) throw new Error(`${table} : ${error.message}`);
  return avant;
}

/** Ids des chapitres du rituel Ma P'tite Règle. */
async function chapitresRituel(admin: Admin): Promise<string[]> {
  const { data } = await admin
    .from("chapitres")
    .select("id")
    .eq("sous_matiere", SOUS_MATIERE_RITUEL);
  return (data ?? []).map((c) => c.id as string);
}

// GET /api/admin/nouvelle-annee — aperçu de ce qui sera supprimé
export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  try {
    const admin = createAdminClient();

    const travail = await Promise.all(
      TABLES_TRAVAIL_ELEVE.map(async ({ table, label }) => ({
        table,
        label,
        nb: await compter(admin, table),
      })),
    );

    const idsRituel = await chapitresRituel(admin);
    const contenus: Record<CleOptionContenu, number> = {
      dictees: await compter(admin, "dictees"),
      ma_ptite_regle: idsRituel.length,
      themes_ecriture: await compter(admin, "themes_ecriture"),
    };

    return NextResponse.json({
      travail,
      total: travail.reduce((s, t) => s + t.nb, 0),
      contenus,
      options: OPTIONS_CONTENUS,
    });
  } catch (err) {
    console.error("[nouvelle-annee] aperçu", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/nouvelle-annee
// Body : { confirmation: "NOUVELLE ANNEE", contenus?: CleOptionContenu[] }
export async function POST(req: Request) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (body?.confirmation !== CONFIRMATION_ATTENDUE) {
    return NextResponse.json(
      { erreur: `Confirmation invalide : saisissez « ${CONFIRMATION_ATTENDUE} »` },
      { status: 400 },
    );
  }

  const clesValides = OPTIONS_CONTENUS.map((o) => o.cle) as readonly string[];
  const contenus: CleOptionContenu[] = Array.isArray(body?.contenus)
    ? body.contenus.filter((c: unknown): c is CleOptionContenu =>
        typeof c === "string" && clesValides.includes(c))
    : [];

  try {
    const admin = createAdminClient();
    const supprime: Record<string, number> = {};

    // ── 1. Travail élève : ordre imposé par les clés étrangères ──────────
    for (const { table } of TABLES_TRAVAIL_ELEVE) {
      supprime[table] = await viderTable(admin, table);
    }

    // ── 2. Contenus explicitement abandonnés cette année ─────────────────
    if (contenus.includes("dictees")) {
      supprime.dictees = await viderTable(admin, "dictees");
    }

    if (contenus.includes("themes_ecriture")) {
      supprime.themes_ecriture = await viderTable(admin, "themes_ecriture");
    }

    if (contenus.includes("ma_ptite_regle")) {
      const ids = await chapitresRituel(admin);
      if (ids.length > 0) {
        // Les tables filles (exercice_resultat, plan_travail, pb_progression,
        // chapitre_assignation…) sont déjà vidées à l'étape 1.
        for (const table of ["exercice", "banque_exercices"]) {
          const { error } = await (admin as any).from(table).delete().in("chapitre_id", ids);
          if (error) throw new Error(`${table} : ${error.message}`);
        }
        const { error } = await admin.from("chapitres").delete().in("id", ids);
        if (error) throw new Error(`chapitres : ${error.message}`);
      }
      supprime.ma_ptite_regle = ids.length;
    }

    return NextResponse.json({ ok: true, supprime });
  } catch (err) {
    console.error("[nouvelle-annee] exécution", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

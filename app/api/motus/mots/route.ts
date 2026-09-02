import { NextRequest, NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { LONGUEUR_MAX, LONGUEUR_MIN, motValide, normaliserMot } from "@/lib/motus";

/** GET → toute la liste de mots, la plus récente d'abord. */
export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const [{ data: mots, error }, { data: journal }] = await Promise.all([
    admin
      .from("motus_mot")
      .select("id, mot, mot_normalise, actif, cree_le")
      .order("mot_normalise"),
    admin.from("motus_jour").select("mot_id, date"),
  ]);

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Dernière fois que chaque mot est sorti : l'enseignant voit d'un coup d'œil
  // ce qui n'a jamais servi.
  const dernier = new Map<string, string>();
  for (const j of journal ?? []) {
    const id = j.mot_id as string | null;
    if (!id) continue;
    const d = j.date as string;
    if (!dernier.has(id) || d > (dernier.get(id) as string)) dernier.set(id, d);
  }

  return NextResponse.json({
    mots: (mots ?? []).map((m) => ({
      ...m,
      derniere_sortie: dernier.get(m.id as string) ?? null,
    })),
  });
}

/**
 * POST { mots: "requin, montagne\njardin" } → ajoute des mots en lot.
 *
 * Sépare sur les virgules, points-virgules, espaces et retours à la ligne :
 * l'enseignant peut coller une liste sans se soucier du format.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const brut = String(body?.mots ?? "");
  const morceaux = brut.split(/[\s,;]+/).filter(Boolean);

  const ajoutes: { mot: string; mot_normalise: string }[] = [];
  const refuses: { mot: string; raison: string }[] = [];
  const vus = new Set<string>();

  for (const m of morceaux) {
    const norm = normaliserMot(m);
    if (!norm) {
      refuses.push({ mot: m, raison: "lettres uniquement (pas de chiffre ni de tiret)" });
      continue;
    }
    if (!motValide(norm)) {
      refuses.push({ mot: m, raison: `entre ${LONGUEUR_MIN} et ${LONGUEUR_MAX} lettres` });
      continue;
    }
    if (vus.has(norm)) continue;
    vus.add(norm);
    ajoutes.push({ mot: m.trim(), mot_normalise: norm });
  }

  if (ajoutes.length === 0) {
    return NextResponse.json({ ajoutes: 0, refuses });
  }

  const admin = createAdminClient();
  // mot_normalise est unique : un mot déjà présent est simplement ignoré.
  const { data, error } = await admin
    .from("motus_mot")
    .upsert(ajoutes, { onConflict: "mot_normalise", ignoreDuplicates: true })
    .select("id");

  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({
    ajoutes: data?.length ?? 0,
    doublons: ajoutes.length - (data?.length ?? 0),
    refuses,
  });
}

/** PATCH { id, actif?, mot? } → active/désactive ou corrige un mot. */
export async function PATCH(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body?.actif === "boolean") patch.actif = body.actif;

  if (typeof body?.mot === "string") {
    const norm = normaliserMot(body.mot);
    if (!norm || !motValide(norm)) {
      return NextResponse.json(
        { erreur: `Mot invalide : lettres uniquement, ${LONGUEUR_MIN} à ${LONGUEUR_MAX} lettres.` },
        { status: 400 },
      );
    }
    patch.mot = body.mot.trim();
    patch.mot_normalise = norm;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erreur: "rien à modifier" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("motus_mot").update(patch).eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE { id } → retire le mot de la liste.
 *
 * Les journées déjà jouées gardent leur mot : motus_jour en conserve une copie
 * (mot_id passe simplement à NULL).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("motus_mot").delete().eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

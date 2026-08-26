import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { domaineParCode } from "@/lib/ceintures-competences";

/**
 * POST /api/ceintures/reinitialiser
 * Body : { domaine, idx?, eleve_id? | rb_eleve_id?, effacer_resultats? }
 *
 * Réservé à l'enseignant : le diagnostic n'est pas repassable à l'initiative
 * de l'élève. Sans `idx`, c'est tout le domaine qui est réinitialisé.
 *
 * `effacer_resultats` retire aussi les validations issues du diagnostic —
 * les lignes `exercice_resultat` à score plein, dont l'élève n'a laissé aucune
 * trace de passage. Les résultats d'exercices réellement faits sont conservés.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const domaineCode = String(body.domaine ?? "").toUpperCase();
  const eleveId: string | null = body.eleve_id ?? null;
  const rbEleveId: number | null = body.rb_eleve_id != null ? Number(body.rb_eleve_id) : null;
  const idx = body.idx != null ? Number(body.idx) : null;
  const effacerResultats = body.effacer_resultats === true;

  if (!eleveId && !rbEleveId) {
    return NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }
  if (!domaineParCode(domaineCode)) {
    return NextResponse.json({ erreur: "domaine invalide" }, { status: 400 });
  }
  if (idx != null && (!Number.isInteger(idx) || idx < 0 || idx > 8)) {
    return NextResponse.json({ erreur: "idx invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Les diagnostics visés.
  let qDiag = admin
    .from("ceinture_diagnostic")
    .select("id, ceinture_idx, items_acquis")
    .eq("domaine_code", domaineCode);
  qDiag = eleveId ? qDiag.eq("eleve_id", eleveId) : qDiag.eq("rb_eleve_id", rbEleveId);
  if (idx != null) qDiag = qDiag.eq("ceinture_idx", idx);

  const { data: diagnostics } = await qDiag;
  if (!diagnostics?.length) {
    return NextResponse.json({ ok: true, nb_diagnostics: 0, nb_resultats: 0 });
  }

  let nbResultats = 0;

  if (effacerResultats) {
    const idxVises = diagnostics.map((d) => d.ceinture_idx as number);
    const codesAcquis = diagnostics.flatMap((d) => (d.items_acquis as string[]) ?? []);

    if (codesAcquis.length) {
      const { data: liens } = await admin
        .from("ceinture_chapitre")
        .select("chapitre_id")
        .eq("domaine_code", domaineCode)
        .in("ceinture_idx", idxVises);

      const { data: exercices } = await admin
        .from("exercice")
        .select("id, contenu")
        .in("chapitre_id", (liens ?? []).map((l) => l.chapitre_id));

      const exoIds = (exercices ?? [])
        .filter((e) => codesAcquis.includes((e.contenu as Record<string, unknown>)?.item_code as string))
        .map((e) => e.id);

      if (exoIds.length) {
        // Le diagnostic écrit un score plein sur chaque item acquis : on ne
        // retire que ces lignes-là, pas les exercices réellement travaillés.
        let qRes = admin
          .from("exercice_resultat")
          .delete()
          .in("exercice_id", exoIds)
          .eq("valide", true);
        qRes = eleveId ? qRes.eq("eleve_id", eleveId) : qRes.eq("rb_eleve_id", rbEleveId);

        const { data: supprimes, error } = await qRes.select("id");
        if (error) {
          console.error("[ceintures/reinitialiser] exercice_resultat:", error.message);
        } else {
          nbResultats = supprimes?.length ?? 0;
        }
      }
    }
  }

  const { error: errDel } = await admin
    .from("ceinture_diagnostic")
    .delete()
    .in("id", diagnostics.map((d) => d.id));

  if (errDel) {
    console.error("[ceintures/reinitialiser]", errDel);
    return NextResponse.json({ erreur: "Réinitialisation impossible" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    nb_diagnostics: diagnostics.length,
    nb_resultats: nbResultats,
  });
}

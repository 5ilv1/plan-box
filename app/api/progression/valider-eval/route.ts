import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/progression/valider-eval
// Body: { eleveId, chapitreId, scoreEleve?, scoreTotal?, planTravailId? }
// Met à jour pb_progression après une éval — Plan Box uniquement.
// Si scoreEleve/scoreTotal fournis : détermine pass/fail.
// Si absents : assume réussite (rétro-compat).
export async function POST(req: NextRequest) {
  const { eleveId, chapitreId, scoreEleve, scoreTotal, planTravailId, questionsRatees } =
    await req.json().catch(() => ({}));

  if (!eleveId || !chapitreId) {
    return NextResponse.json({ erreur: "eleveId et chapitreId requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Récupère le chapitre (seuil, titre, matière, niveau, ordre)
  const { data: chapitre } = await admin
    .from("chapitres")
    .select("id, titre, seuil_reussite, matiere, sous_matiere, niveau_id, ordre")
    .eq("id", chapitreId)
    .single();

  const seuilReussite = chapitre?.seuil_reussite ?? 90;
  const chapitreTitre = chapitre?.titre ?? "Chapitre";

  // Détermine si l'éval est réussie
  const aScore =
    typeof scoreEleve === "number" &&
    typeof scoreTotal === "number" &&
    scoreTotal > 0;
  const scorePercent = aScore ? Math.round((scoreEleve / scoreTotal) * 100) : 100;
  const estValide = !aScore || scorePercent >= seuilReussite;

  // 1a — Calcul du pourcentage exercices (hors eval)
  const { data: tousBlocs } = await admin
    .from("plan_travail")
    .select("statut")
    .eq("chapitre_id", chapitreId)
    .eq("eleve_id", eleveId)
    .neq("type", "eval");

  const totalBlocs = tousBlocs?.length ?? 0;
  const faitsBlocs = tousBlocs?.filter((b) => b.statut === "fait").length ?? 0;
  const pourcentageExos = totalBlocs > 0 ? Math.round((faitsBlocs / totalBlocs) * 100) : 0;

  const today = new Date().toISOString().split("T")[0];
  const demain = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];

  // ── CAS : RÉUSSITE ────────────────────────────────────────────────────────
  if (estValide) {
    const { error: errProg } = await admin.from("pb_progression").upsert(
      {
        eleve_id: eleveId,
        chapitre_id: chapitreId,
        statut: "valide",
        pourcentage: 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "eleve_id,chapitre_id" }
    );

    if (errProg) {
      console.error("[valider-eval] Erreur pb_progression (valide):", errProg.message);
      return NextResponse.json({ erreur: errProg.message }, { status: 500 });
    }

    console.log(`[valider-eval] Validé — élève: ${eleveId}, chapitre: ${chapitreId}, score: ${scorePercent}%`);

    // 1c — Déverrouiller le chapitre suivant
    if (chapitre) {
      let suivantQ = admin
        .from("chapitres")
        .select("id, titre")
        .eq("matiere", chapitre.matiere)
        .eq("niveau_id", chapitre.niveau_id)
        .eq("ordre", (chapitre.ordre ?? 0) + 1);

      // Filtre sous_matiere : IS NULL ou = valeur
      if (chapitre.sous_matiere) {
        suivantQ = suivantQ.eq("sous_matiere", chapitre.sous_matiere);
      } else {
        suivantQ = suivantQ.is("sous_matiere", null);
      }

      const { data: chapSuivant } = await suivantQ.maybeSingle();

      if (chapSuivant) {
        // Charge les exercices du chapitre suivant depuis la banque
        const { data: exercices } = await admin
          .from("banque_exercices")
          .select("type, titre, contenu")
          .eq("chapitre_id", chapSuivant.id)
          .order("ordre", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });

        if (exercices && exercices.length > 0) {
          await admin.from("plan_travail").insert(
            exercices.map((ex) => ({
              type: ex.type,
              titre: ex.titre,
              contenu: ex.contenu,
              chapitre_id: chapSuivant.id,
              eleve_id: eleveId,
              date_assignation: demain,
              statut: "a_faire",
              periodicite: "jour",
            }))
          );
        }

        await admin.from("notifications").insert({
          type: "chapitre_valide",
          eleve_id: eleveId,
          chapitre_id: chapSuivant.id,
          message: `🎉 Tu as validé "${chapitreTitre}" ! "${chapSuivant.titre}" commence demain.`,
          lu: false,
        });
      } else {
        // Dernier chapitre — parcours terminé
        await admin.from("notifications").insert({
          type: "chapitre_valide",
          eleve_id: eleveId,
          chapitre_id: chapitreId,
          message: `🏆 Parcours terminé ! Tu as validé "${chapitreTitre}". Félicitations ! 🎉`,
          lu: false,
        });
      }
    }

    return NextResponse.json({ ok: true, statut: "valide", scorePercent });
  }

  // ── CAS : ÉCHEC ──────────────────────────────────────────────────────────
  const { error: errRem } = await admin.from("pb_progression").upsert(
    {
      eleve_id: eleveId,
      chapitre_id: chapitreId,
      statut: "remediation",
      pourcentage: pourcentageExos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "eleve_id,chapitre_id" }
  );

  if (errRem) {
    console.error("[valider-eval] Erreur pb_progression (remediation):", errRem.message);
    return NextResponse.json({ erreur: errRem.message }, { status: 500 });
  }

  // Déclenche la logique de remédiation (non bloquant)
  if (planTravailId) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    fetch(`${baseUrl}/api/progression/remediation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eleveId, chapitreId, planTravailId, questionsRatees }),
    }).catch((e) => console.warn("[valider-eval] Appel remédiation échoué:", e));
  }

  // Notification immédiate
  await admin.from("notifications").insert({
    type: "eval_echec",
    eleve_id: eleveId,
    chapitre_id: chapitreId,
    message: `📚 Révise "${chapitreTitre}" sur Repetibox. Une nouvelle éval t'attend demain !`,
    lu: false,
  });

  console.log(`[valider-eval] Remédiation — élève: ${eleveId}, chapitre: ${chapitreId}, score: ${scorePercent}%`);
  return NextResponse.json({ ok: true, statut: "remediation", scorePercent });
}

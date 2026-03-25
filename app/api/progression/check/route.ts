import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

const SEUIL_DEFAUT = 90;
const NB_QUESTIONS_EVAL = 10; // questions piochées dans les exercices faits

function calculerPct(contenu: Record<string, unknown>): number | null {
  const total = Number(contenu.score_total);
  const eleve = Number(contenu.score_eleve);
  if (!contenu.score_total || isNaN(eleve) || isNaN(total) || total === 0) return null;
  return Math.round((eleve / total) * 100);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function construireEvalDepuisExercices(
  blocs: Array<{ contenu: unknown }>,
  titre: string,
  nbQuestions: number
): { titre: string; consigne: string; questions: unknown[] } {
  // Collecte toutes les questions des exercices faits
  const toutesQuestions: Array<{ enonce: string; reponse_attendue: string; indice?: string }> = [];
  for (const bloc of blocs) {
    const questions = (bloc.contenu as Record<string, unknown>)?.questions as
      | Array<{ enonce?: string; reponse_attendue?: string; indice?: string }>
      | undefined;
    if (Array.isArray(questions)) {
      for (const q of questions) {
        if (q.enonce && q.reponse_attendue) {
          toutesQuestions.push({ enonce: q.enonce, reponse_attendue: q.reponse_attendue, indice: q.indice });
        }
      }
    }
  }

  // Mélange et sélectionne N questions
  const selection = shuffle(toutesQuestions).slice(0, nbQuestions);
  return {
    titre: `Évaluation — ${titre}`,
    consigne: "Réponds aux questions pour valider tes révisions.",
    questions: selection.map((q, i) => ({ id: i + 1, ...q })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { eleveId, chapitreId, source, eleveRbId } = await req.json();

    if (!chapitreId) {
      return NextResponse.json({ erreur: "chapitreId requis" }, { status: 400 });
    }
    if (!eleveId && !eleveRbId) {
      return NextResponse.json({ erreur: "eleveId ou eleveRbId requis" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupère le chapitre (titre, seuil)
    const { data: chapitre } = await admin
      .from("chapitres")
      .select("id, titre, seuil_reussite, niveaux(nom)")
      .eq("id", chapitreId)
      .single();

    const seuilReussite = chapitre?.seuil_reussite ?? SEUIL_DEFAUT;
    const chapitreTitre = chapitre?.titre ?? "Chapitre";

    // Récupère les blocs exercice/calcul_mental pour cet élève + chapitre
    let query = admin
      .from("plan_travail")
      .select("id, statut, contenu, type")
      .eq("chapitre_id", chapitreId)
      .in("type", ["exercice", "calcul_mental"]);

    if (source === "repetibox" && eleveRbId) {
      query = query.eq("repetibox_eleve_id", eleveRbId);
    } else {
      query = query.eq("eleve_id", eleveId);
    }

    const { data: blocs, error: blocsError } = await query;

    if (blocsError) {
      return NextResponse.json({ erreur: blocsError.message }, { status: 500 });
    }

    if (!blocs || blocs.length === 0) {
      return NextResponse.json({
        evalDeclenche: false,
        manquants: blocs?.length ?? 0,
        message: "Aucun exercice trouvé pour ce chapitre.",
      });
    }

    // Vérifie que TOUS les exercices sont faits avec score ≥ seuil
    const nonValides = blocs.filter((b) => {
      if (b.statut !== "fait") return true;
      const pct = calculerPct(b.contenu as Record<string, unknown>);
      return pct !== null && pct < seuilReussite;
    });

    if (nonValides.length > 0) {
      return NextResponse.json({
        evalDeclenche: false,
        manquants: nonValides.length,
        message: `${nonValides.length} exercice(s) non encore validé(s) à ${seuilReussite}%.`,
      });
    }

    const exercicesValides = blocs.filter((b) => b.statut === "fait");

    // Vérifie qu'aucun bloc eval non-fait n'existe déjà
    let evalQuery = admin
      .from("plan_travail")
      .select("id")
      .eq("chapitre_id", chapitreId)
      .eq("type", "eval")
      .neq("statut", "fait");

    if (source === "repetibox" && eleveRbId) {
      evalQuery = evalQuery.eq("repetibox_eleve_id", eleveRbId);
    } else {
      evalQuery = evalQuery.eq("eleve_id", eleveId);
    }

    const { data: evalExistant } = await evalQuery.maybeSingle();

    if (evalExistant) {
      return NextResponse.json({
        evalDeclenche: false,
        manquants: 0,
        message: "Évaluation déjà disponible.",
      });
    }

    // Construit l'évaluation depuis les questions des exercices validés
    const contenuEval = construireEvalDepuisExercices(exercicesValides, chapitreTitre, NB_QUESTIONS_EVAL);

    if (contenuEval.questions.length === 0) {
      return NextResponse.json({
        evalDeclenche: false,
        manquants: 0,
        message: "Impossible de construire l'évaluation (aucune question trouvée dans les exercices).",
      });
    }

    // Insère le bloc eval dans plan_travail
    const today = new Date().toISOString().split("T")[0];
    const insertData: Record<string, unknown> = {
      type: "eval",
      titre: contenuEval.titre,
      contenu: contenuEval,
      chapitre_id: chapitreId,
      date_assignation: today,
      statut: "a_faire",
    };

    if (source === "repetibox" && eleveRbId) {
      insertData.repetibox_eleve_id = eleveRbId;
    } else {
      insertData.eleve_id = eleveId;
    }

    const { error: insertError } = await admin.from("plan_travail").insert(insertData);

    if (insertError) {
      console.error("[progression/check] INSERT eval erreur:", insertError.message);
      return NextResponse.json({ erreur: insertError.message }, { status: 500 });
    }

    console.log(`[progression/check] Éval déclenchée — chapitre: ${chapitreId}, élève: ${eleveId ?? eleveRbId}, ${contenuEval.questions.length} questions`);

    // Mise à jour pourcentage de progression (Plan Box uniquement)
    if (source === "planbox" && eleveId) {
      const { data: tousBlocs } = await admin
        .from("plan_travail")
        .select("statut")
        .eq("chapitre_id", chapitreId)
        .eq("eleve_id", eleveId)
        .neq("type", "eval");
      const totalBlocs = tousBlocs?.length ?? 0;
      const faitsBlocs = tousBlocs?.filter((b) => b.statut === "fait").length ?? 0;
      const pourcentage = totalBlocs > 0 ? Math.round((faitsBlocs / totalBlocs) * 100) : 0;
      await admin
        .from("pb_progression")
        .upsert(
          { eleve_id: eleveId, chapitre_id: chapitreId, pourcentage, statut: "en_cours", updated_at: new Date().toISOString() },
          { onConflict: "eleve_id,chapitre_id" }
        )
        .then(({ error: e }) => { if (e) console.warn("[progression/check] upsert pb_progression:", e.message); });
    }

    // Notification enseignant (PB uniquement)
    if (source === "planbox" && eleveId) {
      const { data: eleveData } = await admin
        .from("eleves")
        .select("prenom")
        .eq("id", eleveId)
        .single();
      const prenom = eleveData?.prenom ?? "Un élève";
      await admin
        .from("notifications")
        .insert({
          type: "eval_prete",
          eleve_id: eleveId,
          chapitre_id: chapitreId,
          message: `🎯 ${prenom} est prêt(e) pour l'évaluation : ${chapitreTitre}`,
          lu: false,
        })
        .then(({ error }) => {
          if (error) console.warn("[progression/check] notification erreur:", error.message);
        });
    }

    return NextResponse.json({
      evalDeclenche: true,
      manquants: 0,
      message: `🎯 Bravo ! Tu as validé tous les exercices. Une évaluation a été ajoutée à ton plan de travail !`,
    });
  } catch (err) {
    console.error("[progression/check] Erreur:", err);
    return NextResponse.json({ erreur: "Erreur interne." }, { status: 500 });
  }
}

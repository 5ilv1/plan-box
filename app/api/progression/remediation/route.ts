import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/progression/remediation
// Body: { eleveId, chapitreId, planTravailId }
// Appelé depuis valider-eval quand score < seuil.
// Crée un chapitre Repetibox "Remédiation" et programme une nouvelle éval demain.
export async function POST(req: NextRequest) {
  const { eleveId, chapitreId, planTravailId, questionsRatees } = await req.json().catch(() => ({}));

  if (!eleveId || !chapitreId) {
    return NextResponse.json({ erreur: "eleveId et chapitreId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const demain = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];

  // ── 1. Récupère le titre du chapitre ────────────────────────────────────
  const { data: chapitre } = await admin
    .from("chapitres")
    .select("id, titre")
    .eq("id", chapitreId)
    .single();

  const chapitreTitre = chapitre?.titre ?? "Chapitre";
  const nomChapRem = `Remédiation — ${chapitreTitre}`;

  // ── 2. Cartes à créer : questions ratées à l'éval (transmises par le client) ─
  //    Fallback : toutes les questions des exercices faits du chapitre
  let cartes: { recto: string; verso: string }[] = [];

  if (Array.isArray(questionsRatees) && questionsRatees.length > 0) {
    cartes = (questionsRatees as Array<{ recto?: string; verso?: string }>)
      .filter((c) => c.recto && c.verso)
      .map((c) => ({ recto: c.recto!, verso: c.verso! }));
  } else {
    const { data: exercicesFaits } = await admin
      .from("plan_travail")
      .select("contenu")
      .eq("chapitre_id", chapitreId)
      .eq("eleve_id", eleveId)
      .eq("statut", "fait")
      .neq("type", "eval");

    for (const bloc of (exercicesFaits ?? [])) {
      const questions = (bloc.contenu as Record<string, unknown>)?.questions as
        | Array<{ enonce?: string; reponse_attendue?: string }>
        | undefined;
      if (Array.isArray(questions)) {
        for (const q of questions) {
          if (q.enonce && q.reponse_attendue) {
            cartes.push({ recto: q.enonce, verso: q.reponse_attendue });
          }
        }
      }
    }
  }

  // ── 3. Crée / récupère le chapitre Repetibox de remédiation ─────────────
  if (cartes.length > 0) {
    try {
      let chapRemId: number | null = null;

      const { data: chapExistant } = await admin
        .from("chapitre")   // table Repetibox
        .select("id")
        .eq("nom", nomChapRem)
        .maybeSingle();

      if (chapExistant) {
        chapRemId = chapExistant.id as number;
      } else {
        const { data: chapCree } = await admin
          .from("chapitre")
          .insert({ nom: nomChapRem })
          .select("id")
          .single();
        chapRemId = chapCree?.id ?? null;
      }

      if (chapRemId) {
        await admin.from("carte").insert(
          cartes.map((c) => ({
            recto: c.recto,
            verso: c.verso,
            chapitre_id: chapRemId,
            type: "normal",
          }))
        );
        console.log(`[remediation] ${cartes.length} cartes créées dans chapitre Repetibox #${chapRemId}`);
      }
    } catch (e) {
      // La création dans Repetibox est non-bloquante
      console.warn("[remediation] Erreur création chapitre Repetibox:", e);
    }
  }

  // ── 4. Programme une nouvelle éval demain ────────────────────────────────
  // Copie le dernier bloc eval de ce chapitre pour cet élève
  const { data: derniereEval } = await admin
    .from("plan_travail")
    .select("titre, contenu, type")
    .eq("chapitre_id", chapitreId)
    .eq("eleve_id", eleveId)
    .eq("type", "eval")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Vérifie qu'il n'y a pas déjà une éval "a_faire" pour demain
  const { data: evalDejaPlanifiee } = await admin
    .from("plan_travail")
    .select("id")
    .eq("chapitre_id", chapitreId)
    .eq("eleve_id", eleveId)
    .eq("type", "eval")
    .eq("statut", "a_faire")
    .eq("date_assignation", demain)
    .maybeSingle();

  if (derniereEval && !evalDejaPlanifiee) {
    await admin.from("plan_travail").insert({
      type: "eval",
      titre: derniereEval.titre,
      contenu: derniereEval.contenu,
      chapitre_id: chapitreId,
      eleve_id: eleveId,
      date_assignation: demain,
      statut: "a_faire",
      periodicite: "jour",
    });
    console.log(`[remediation] Nouvelle éval planifiée pour ${demain}`);
  }

  return NextResponse.json({ ok: true });
}

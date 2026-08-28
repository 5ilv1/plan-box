import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { TYPES_JOUR, TYPES_SEMAINE, buildSystemPrompt } from "@/lib/ecriture-types";
import { requireEnseignant } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// POST /api/reinitialiser-theme-ecriture
// Body optionnel : { mode: "jour" | "semaine" }
// 1. Supprime les plan_travail du jour de type "ecriture"
// 2. Supprime le themes_ecriture du jour
// 3. Génère un nouveau thème via Claude (adapté au mode)
// 4. Affecte automatiquement à tous les élèves
export async function POST(req: Request) {
  // Réservé à l'enseignant : cette route consomme une clé API facturée.
  const { error: refus } = await requireEnseignant();
  if (refus) return refus;

  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    // Lire le mode demandé (sinon reprendre le dernier mode utilisé)
    const body = await req.json().catch(() => ({}));
    let mode: "jour" | "semaine" = body?.mode ?? "jour";

    // Si pas de mode explicite, reprendre le dernier mode du thème existant
    if (!body?.mode) {
      const { data: dernierTheme } = await supabase
        .from("themes_ecriture")
        .select("mode")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dernierTheme?.mode) mode = dernierTheme.mode;
    }

    // ── 1. Supprimer les blocs plan_travail de la semaine ────────────────
    // En mode semaine, supprimer tous les blocs de la semaine ; en mode jour, seulement ceux du jour
    if (mode === "semaine") {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      await supabase
        .from("plan_travail")
        .delete()
        .eq("type", "ecriture")
        .gte("date_assignation", monday.toISOString().split("T")[0])
        .lte("date_assignation", sunday.toISOString().split("T")[0]);
    } else {
      await supabase
        .from("plan_travail")
        .delete()
        .eq("type", "ecriture")
        .eq("date_assignation", today);
    }

    // ── 2. Supprimer le thème du jour ────────────────────────────────────
    await supabase
      .from("themes_ecriture")
      .delete()
      .eq("date", today);

    // ── 3. Compter le total + récupérer les 50 derniers ─────────────────
    const typesListe = mode === "semaine" ? TYPES_SEMAINE : TYPES_JOUR;

    const [{ count }, { data: derniers }] = await Promise.all([
      supabase.from("themes_ecriture").select("*", { count: "exact", head: true }),
      supabase
        .from("themes_ecriture")
        .select("sujet, type_ecriture")
        .order("date", { ascending: false })
        .limit(50),
    ]);

    const total = count ?? 0;
    const typeImpose = typesListe[total % typesListe.length];

    const derniersTypes = (derniers ?? [])
      .slice(0, 6)
      .map((t: { type_ecriture: string | null }) => t.type_ecriture)
      .filter(Boolean)
      .join(", ");

    const listeSujets = (derniers ?? [])
      .map((t: { sujet: string }) => `- ${t.sujet}`)
      .join("\n");

    // ── 4. Générer un nouveau thème ──────────────────────────────────────
    const systemPrompt = buildSystemPrompt(mode, typeImpose, derniersTypes, listeSujets);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: "Génère un nouveau sujet d'écriture." }],
    });

    const texte = message.content[0].type === "text" ? message.content[0].text : "";
    const texteNettoye = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(texteNettoye) as { sujet: string; contrainte: string };

    const { data: theme, error: errInsert } = await supabase
      .from("themes_ecriture")
      .insert({
        date: today,
        sujet: parsed.sujet,
        contrainte: parsed.contrainte,
        type_ecriture: typeImpose,
        afficher_contrainte: true,
        affecte: false,
        mode,
      })
      .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
      .single();

    if (errInsert || !theme) {
      return NextResponse.json({ erreur: errInsert?.message ?? "Insertion échouée" }, { status: 500 });
    }

    // ── 5. Récupérer tous les élèves via eleve_groupe ────────────────────
    const { data: liaisons } = await supabase
      .from("eleve_groupe")
      .select("planbox_eleve_id, repetibox_eleve_id, groupe_id");

    if (!liaisons || liaisons.length === 0) {
      return NextResponse.json({ ok: true, theme, nb_eleves: 0 });
    }

    const groupeIds = [...new Set(liaisons.map((l: any) => l.groupe_id))];
    const { data: groupes } = await supabase
      .from("groupes")
      .select("id, nom")
      .in("id", groupeIds);

    const nomGroupe = new Map<string, string>(
      (groupes ?? []).map((g: { id: string; nom: string }) => [g.id, g.nom])
    );

    // ── 6. Construire et insérer les blocs plan_travail ──────────────────
    const vusRB = new Set<number>();
    const vusPB = new Set<string>();
    const blocs = [];
    const titreBloc = mode === "semaine"
      ? "Atelier écriture — Thème de la semaine"
      : "Atelier écriture — Thème du jour";

    for (const liaison of liaisons as { planbox_eleve_id: string | null; repetibox_eleve_id: number | null; groupe_id: string }[]) {
      const niveauNom = nomGroupe.get(liaison.groupe_id) ?? "";
      let contrainte = theme.contrainte;
      if (niveauNom === "CE2") contrainte += " · Au moins 3 lignes";
      else if (niveauNom === "CM1" || niveauNom === "CM2") contrainte += " · Au moins 5 lignes";

      const contenu: Record<string, unknown> = {
        sujet: theme.sujet,
        contrainte,
        instructions: mode === "semaine"
          ? "Écris ton texte, reviens le retravailler chaque jour, et envoie-le le vendredi."
          : "Écris ton texte sur ton cahier d'écrivain.",
        afficher_contrainte: true,
        mode,
      };
      if (mode === "semaine") {
        contenu.texte_courant = "";
        contenu.historique = [];
        contenu.annotations = [];
        contenu.texte_final = "";
        contenu.date_envoi = null;
      }

      const blocBase = {
        type: "ecriture",
        titre: titreBloc,
        contenu,
        date_assignation: today,
        statut: "a_faire" as const,
        chapitre_id: null,
        periodicite: mode === "semaine" ? "semaine" : "jour",
      };

      if (liaison.repetibox_eleve_id && !vusRB.has(liaison.repetibox_eleve_id)) {
        vusRB.add(liaison.repetibox_eleve_id);
        blocs.push({ ...blocBase, eleve_id: null, repetibox_eleve_id: liaison.repetibox_eleve_id });
      } else if (liaison.planbox_eleve_id && !vusPB.has(liaison.planbox_eleve_id)) {
        vusPB.add(liaison.planbox_eleve_id);
        blocs.push({ ...blocBase, eleve_id: liaison.planbox_eleve_id, repetibox_eleve_id: null });
      }
    }

    const { error: errBlocs } = await supabase.from("plan_travail").insert(blocs);
    if (errBlocs) return NextResponse.json({ erreur: errBlocs.message }, { status: 500 });

    // ── 7. Marquer affecté + archiver dans banque_ressources ─────────────
    await supabase.from("themes_ecriture").update({ affecte: true }).eq("id", theme.id);
    await supabase.from("banque_ressources").insert({
      titre: theme.sujet, sous_type: "ecriture",
      contenu: { sujet: theme.sujet, contrainte: theme.contrainte, date: today, mode },
    });

    return NextResponse.json({ ok: true, theme: { ...theme, affecte: true }, nb_eleves: blocs.length });

  } catch (err) {
    console.error("[reinitialiser-theme-ecriture]", err);
    return NextResponse.json({ erreur: String(err) }, { status: 500 });
  }
}

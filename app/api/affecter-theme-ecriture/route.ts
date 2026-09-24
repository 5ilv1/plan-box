import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignantOrCron } from "@/lib/server-auth";
import { affecterTheme, ErreurTheme } from "@/lib/theme-ecriture";
import { CONSIGNES_ECRITURE } from "@/lib/ecriture-types";

export async function POST(req: Request) {
  const auth = await requireEnseignantOrCron(req);
  if (auth.error) return auth.error;
  try {
    const { theme_id } = await req.json();
    if (!theme_id) {
      return NextResponse.json({ erreur: "theme_id requis" }, { status: 400 });
    }
    return NextResponse.json(await affecterTheme(createAdminClient(), theme_id));
  } catch (err) {
    if (err instanceof ErreurTheme) {
      return NextResponse.json({ erreur: err.message }, { status: err.status });
    }
    console.error("[affecter-theme-ecriture POST]", err);
    return NextResponse.json({ erreur: (err as Error).message ?? "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireEnseignantOrCron(req);
  if (auth.error) return auth.error;
  try {
    const { theme_id, sujet, contrainte, afficher_contrainte, mode } = await req.json();
    if (!theme_id) {
      return NextResponse.json({ erreur: "theme_id requis" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    // Mettre à jour le thème
    const updates: Record<string, string | boolean> = {};
    if (sujet !== undefined) updates.sujet = sujet;
    if (contrainte !== undefined) updates.contrainte = contrainte;
    if (afficher_contrainte !== undefined) updates.afficher_contrainte = afficher_contrainte;
    if (mode !== undefined) updates.mode = mode;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("themes_ecriture")
        .update(updates)
        .eq("id", theme_id);
    }

    // Si changement de mode → supprimer les blocs écriture de la semaine en cours
    if (mode !== undefined) {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const mondayStr = monday.toISOString().split("T")[0];
      const sundayStr = sunday.toISOString().split("T")[0];

      // Supprimer tous les blocs écriture de la semaine
      await supabase
        .from("plan_travail")
        .delete()
        .eq("type", "ecriture")
        .gte("date_assignation", mondayStr)
        .lte("date_assignation", sundayStr);

      // Réaffecter avec le nouveau mode si le thème est déjà affecté
      const { data: theme } = await supabase
        .from("themes_ecriture")
        .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
        .eq("id", theme_id)
        .single();

      if (theme?.affecte) {
        // Marquer comme non affecté pour permettre la réaffectation
        await supabase.from("themes_ecriture").update({ affecte: false }).eq("id", theme_id);

        // Réaffecter via la logique POST (appel interne)
        const postBody = JSON.stringify({ theme_id });
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? "" : "";
        // On réutilise la logique directement ici plutôt qu'un appel HTTP
        const { data: liaisons } = await supabase
          .from("eleve_groupe")
          .select("planbox_eleve_id, repetibox_eleve_id, groupe_id");

        if (liaisons && liaisons.length > 0) {
          const groupeIds = [...new Set(liaisons.map((l: any) => l.groupe_id))];
          const { data: groupes } = await supabase.from("groupes").select("id, nom").in("id", groupeIds);
          const nomGroupe = new Map<string, string>((groupes ?? []).map((g: any) => [g.id, g.nom]));

          const vusRB = new Set<number>();
          const vusPB = new Set<string>();
          const blocsAPlanTravail: any[] = [];
          const titreBloc = theme.mode === "semaine"
            ? "Atelier écriture — Thème de la semaine"
            : "Atelier écriture — Thème du jour";

          for (const liaison of liaisons as any[]) {
            const niveauNom = nomGroupe.get(liaison.groupe_id) ?? "";
            let contraintefinale = theme.contrainte;
            if (niveauNom === "CE2") contraintefinale += " · Au moins 3 lignes";
            else if (niveauNom === "CM1" || niveauNom === "CM2") contraintefinale += " · Au moins 5 lignes";

            const contenu: Record<string, unknown> = {
              sujet: theme.sujet,
              contrainte: contraintefinale,
              instructions: CONSIGNES_ECRITURE[theme.mode === "semaine" ? "semaine" : "jour"],
              afficher_contrainte: theme.afficher_contrainte ?? true,
              mode: theme.mode,
            };
            if (theme.mode === "semaine") {
              contenu.texte_courant = "";
              contenu.historique = [];
              contenu.annotations = [];
              contenu.texte_final = "";
              contenu.date_envoi = null;
            }

            const blocBase = {
              type: "ecriture", titre: titreBloc, contenu,
              date_assignation: today, statut: "a_faire",
              chapitre_id: null, periodicite: theme.mode === "semaine" ? "semaine" : "jour",
            };

            if (liaison.repetibox_eleve_id && !vusRB.has(liaison.repetibox_eleve_id)) {
              vusRB.add(liaison.repetibox_eleve_id);
              blocsAPlanTravail.push({ ...blocBase, eleve_id: null, repetibox_eleve_id: liaison.repetibox_eleve_id });
            } else if (liaison.planbox_eleve_id && !vusPB.has(liaison.planbox_eleve_id)) {
              vusPB.add(liaison.planbox_eleve_id);
              blocsAPlanTravail.push({ ...blocBase, eleve_id: liaison.planbox_eleve_id, repetibox_eleve_id: null });
            }
          }

          if (blocsAPlanTravail.length > 0) {
            await supabase.from("plan_travail").insert(blocsAPlanTravail);
          }
        }

        await supabase.from("themes_ecriture").update({ affecte: true }).eq("id", theme_id);
      }

      return NextResponse.json({ ok: true, mode_changed: true });
    }

    // Mettre à jour les blocs écriture de la période concernée
    // Mode semaine → chercher sur toute la semaine ; mode jour → uniquement aujourd'hui
    const { data: themeData } = await supabase
      .from("themes_ecriture")
      .select("mode")
      .eq("id", theme_id)
      .single();
    const themeModePatch = (themeData?.mode as string) ?? "jour";

    let blocsQuery = supabase
      .from("plan_travail")
      .select("id, contenu, eleve_id, repetibox_eleve_id")
      .eq("type", "ecriture");

    if (themeModePatch === "semaine") {
      const now = new Date();
      const dayPatch = now.getDay();
      const diffMon = dayPatch === 0 ? -6 : 1 - dayPatch;
      const monPatch = new Date(now);
      monPatch.setDate(now.getDate() + diffMon);
      const sunPatch = new Date(monPatch);
      sunPatch.setDate(monPatch.getDate() + 6);
      blocsQuery = blocsQuery
        .gte("date_assignation", monPatch.toISOString().split("T")[0])
        .lte("date_assignation", sunPatch.toISOString().split("T")[0]);
    } else {
      blocsQuery = blocsQuery.eq("date_assignation", today);
    }

    const { data: blocs } = await blocsQuery
      .returns<{ id: string; contenu: Record<string, unknown>; eleve_id: string | null; repetibox_eleve_id: number | null }[]>();

    if (blocs && blocs.length > 0) {
      if (sujet !== undefined || contrainte !== undefined) {
        // Récupérer les niveaux via eleve_groupe → groupes (couvre PB et RB)
        const pbIds = [...new Set(blocs.map((b) => b.eleve_id).filter(Boolean))] as string[];
        const rbIds = [...new Set(blocs.map((b) => b.repetibox_eleve_id).filter((id): id is number => id != null))];

        const { data: liaisons } = await supabase
          .from("eleve_groupe")
          .select("planbox_eleve_id, repetibox_eleve_id, groupe_id");

        const groupeIds = [...new Set((liaisons ?? []).map((l: any) => l.groupe_id))];
        const { data: groupes } = await supabase
          .from("groupes")
          .select("id, nom")
          .in("id", groupeIds);
        const nomGroupe = new Map<string, string>(
          (groupes ?? []).map((g: { id: string; nom: string }) => [g.id, g.nom])
        );

        // Map PB id → niveau, RB id → niveau
        const niveauParPB = new Map<string, string>();
        const niveauParRB = new Map<number, string>();
        for (const l of (liaisons ?? []) as { planbox_eleve_id: string | null; repetibox_eleve_id: number | null; groupe_id: string }[]) {
          const nom = nomGroupe.get(l.groupe_id) ?? "";
          if (l.planbox_eleve_id) niveauParPB.set(l.planbox_eleve_id, nom);
          if (l.repetibox_eleve_id) niveauParRB.set(l.repetibox_eleve_id, nom);
        }

        for (const bloc of blocs) {
          const niveauNom = bloc.eleve_id
            ? (niveauParPB.get(bloc.eleve_id) ?? "")
            : (bloc.repetibox_eleve_id ? (niveauParRB.get(bloc.repetibox_eleve_id) ?? "") : "");
          let contraintefinale = contrainte ?? (bloc.contenu?.contrainte as string) ?? "";
          contraintefinale = contraintefinale.replace(/ · Au moins \d+ lignes$/, "").trim();
          if (niveauNom === "CE2") contraintefinale += " · Au moins 3 lignes";
          else if (niveauNom === "CM1" || niveauNom === "CM2") contraintefinale += " · Au moins 5 lignes";

          const nouveauSujet = sujet ?? (bloc.contenu?.sujet as string) ?? "";
          const modeBloc = (bloc.contenu?.mode as string) ?? "jour";
          const titreBloc = modeBloc === "semaine"
            ? "Atelier écriture — Thème de la semaine"
            : "Atelier écriture — Thème du jour";

          await supabase
            .from("plan_travail")
            .update({
              titre: titreBloc,
              contenu: {
                ...bloc.contenu,
                sujet: nouveauSujet,
                contrainte: contraintefinale,
                ...(afficher_contrainte !== undefined ? { afficher_contrainte } : {}),
              },
            })
            .eq("id", bloc.id);
        }
      } else if (afficher_contrainte !== undefined) {
        // Uniquement le toggle contrainte — mise à jour rapide de tous les blocs
        for (const bloc of blocs) {
          await supabase
            .from("plan_travail")
            .update({ contenu: { ...bloc.contenu, afficher_contrainte } })
            .eq("id", bloc.id);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[affecter-theme-ecriture PATCH]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

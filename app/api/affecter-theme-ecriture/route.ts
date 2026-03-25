import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const { theme_id } = await req.json();
    if (!theme_id) {
      return NextResponse.json({ erreur: "theme_id requis" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    // 1. Récupérer le thème
    const { data: theme, error: errTheme } = await supabase
      .from("themes_ecriture")
      .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
      .eq("id", theme_id)
      .single();

    if (errTheme || !theme) {
      return NextResponse.json({ erreur: "Thème introuvable" }, { status: 404 });
    }

    // 2. Vérifier s'il n'est pas déjà affecté
    if (theme.affecte) {
      return NextResponse.json({ ok: true, nb_eleves: 0, deja_affecte: true });
    }

    // 3a. Tous les membres de tous les groupes
    const { data: liaisons, error: errLiaisons } = await supabase
      .from("eleve_groupe")
      .select("planbox_eleve_id, repetibox_eleve_id, groupe_id");

    if (errLiaisons) {
      return NextResponse.json({ erreur: errLiaisons.message }, { status: 500 });
    }
    if (!liaisons || liaisons.length === 0) {
      return NextResponse.json({ ok: true, nb_eleves: 0 });
    }

    // 3b. Noms des groupes pour adapter la contrainte (CE2/CM1/CM2)
    const groupeIds = [...new Set(liaisons.map((l: any) => l.groupe_id))];
    const { data: groupes } = await supabase
      .from("groupes")
      .select("id, nom")
      .in("id", groupeIds);
    const nomGroupe = new Map<string, string>(
      (groupes ?? []).map((g: { id: string; nom: string }) => [g.id, g.nom])
    );

    // 4. Construire les blocs — dédoublonner par élève
    const vusRB = new Set<number>();
    const vusPB = new Set<string>();
    const blocsAPlanTravail = [];
    const titreBloc = (theme as any).mode === "semaine"
      ? `Atelier d'écriture — ${theme.sujet}`.substring(0, 60)
      : "Thème du jour";

    for (const liaison of liaisons as { planbox_eleve_id: string | null; repetibox_eleve_id: number | null; groupe_id: string }[]) {
      const niveauNom = nomGroupe.get(liaison.groupe_id) ?? "";
      let contraintefinale = theme.contrainte;
      if (niveauNom === "CE2") {
        contraintefinale = theme.contrainte + " · Au moins 3 lignes";
      } else if (niveauNom === "CM1" || niveauNom === "CM2") {
        contraintefinale = theme.contrainte + " · Au moins 5 lignes";
      }
      const themeMode = (theme as any).mode ?? "jour";
      const contenu: Record<string, unknown> = {
        sujet: theme.sujet,
        contrainte: contraintefinale,
        instructions: themeMode === "semaine"
          ? "Atelier d'écriture sur 4 jours : J1 Premier jet · J2 Correction · J3 Correction · J4 Finalisation"
          : "Écris ton texte sur ton cahier d'écrivain.",
        afficher_contrainte: theme.afficher_contrainte ?? true,
        mode: themeMode,
      };
      if (themeMode === "semaine") {
        contenu.texte_jour1 = "";
        contenu.texte_jour2 = "";
        contenu.texte_jour3 = "";
        contenu.texte_final = "";
        contenu.erreurs_jour2 = [];
        contenu.erreurs_jour3 = [];
        contenu.erreurs_jour4 = [];
      }

      const blocBase = {
        type: "ecriture",
        titre: titreBloc,
        contenu,
        date_assignation: today,
        statut: "a_faire" as const,
        chapitre_id: null,
        periodicite: themeMode === "semaine" ? "semaine" : "jour",
      };

      if (liaison.repetibox_eleve_id && !vusRB.has(liaison.repetibox_eleve_id)) {
        vusRB.add(liaison.repetibox_eleve_id);
        blocsAPlanTravail.push({ ...blocBase, eleve_id: null, repetibox_eleve_id: liaison.repetibox_eleve_id });
      } else if (liaison.planbox_eleve_id && !vusPB.has(liaison.planbox_eleve_id)) {
        vusPB.add(liaison.planbox_eleve_id);
        blocsAPlanTravail.push({ ...blocBase, eleve_id: liaison.planbox_eleve_id, repetibox_eleve_id: null });
      }
    }

    // 5. Insérer dans plan_travail
    const { error: errInsert } = await supabase
      .from("plan_travail")
      .insert(blocsAPlanTravail);

    if (errInsert) {
      return NextResponse.json({ erreur: errInsert.message }, { status: 500 });
    }

    // 6. Insérer dans banque_ressources
    await supabase.from("banque_ressources").insert({
      titre: theme.sujet,
      sous_type: "ecriture",
      contenu: {
        sujet: theme.sujet,
        contrainte: theme.contrainte,
        date: today,
      },
    });

    // 7. Marquer le thème comme affecté
    await supabase
      .from("themes_ecriture")
      .update({ affecte: true })
      .eq("id", theme_id);

    return NextResponse.json({ ok: true, nb_eleves: blocsAPlanTravail.length });
  } catch (err) {
    console.error("[affecter-theme-ecriture POST]", err);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
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
          const titreBloc = (theme as any).mode === "semaine"
      ? `Atelier d'écriture — ${theme.sujet}`.substring(0, 60)
      : "Thème du jour";

          for (const liaison of liaisons as any[]) {
            const niveauNom = nomGroupe.get(liaison.groupe_id) ?? "";
            let contraintefinale = theme.contrainte;
            if (niveauNom === "CE2") contraintefinale += " · Au moins 3 lignes";
            else if (niveauNom === "CM1" || niveauNom === "CM2") contraintefinale += " · Au moins 5 lignes";

            const contenu: Record<string, unknown> = {
              sujet: theme.sujet,
              contrainte: contraintefinale,
              instructions: theme.mode === "semaine"
                ? "Atelier d'écriture sur 4 jours : J1 Premier jet · J2 Correction · J3 Correction · J4 Finalisation"
                : "Écris ton texte sur ton cahier d'écrivain.",
              afficher_contrainte: theme.afficher_contrainte ?? true,
              mode: theme.mode,
            };
            if (theme.mode === "semaine") {
              contenu.texte_jour1 = "";
              contenu.texte_jour2 = "";
              contenu.texte_jour3 = "";
              contenu.texte_final = "";
              contenu.erreurs_jour2 = [];
              contenu.erreurs_jour3 = [];
              contenu.erreurs_jour4 = [];
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

    // Mettre à jour les plan_travail du jour pour type=ecriture
    const { data: blocs } = await supabase
      .from("plan_travail")
      .select("id, contenu, eleve_id")
      .eq("type", "ecriture")
      .eq("date_assignation", today)
      .returns<{ id: string; contenu: Record<string, unknown>; eleve_id: string }[]>();

    if (blocs && blocs.length > 0) {
      if (sujet !== undefined || contrainte !== undefined) {
        // Récupérer les niveaux des élèves pour adapter la contrainte
        const eleveIds = blocs.map((b) => b.eleve_id);
        const { data: eleves } = await supabase
          .from("eleves")
          .select("id, niveaux(nom)")
          .in("id", eleveIds)
          .returns<{ id: string; niveaux: { nom: string } | null }[]>();

        const niveauParEleve = new Map(
          (eleves ?? []).map((e) => [e.id, e.niveaux?.nom ?? ""])
        );

        for (const bloc of blocs) {
          const niveauNom = niveauParEleve.get(bloc.eleve_id) ?? "";
          let contraintefinale = contrainte ?? (bloc.contenu?.contrainte as string) ?? "";
          contraintefinale = contraintefinale.replace(/ · Au moins \d+ lignes$/, "").trim();
          if (niveauNom === "CE2") contraintefinale += " · Au moins 3 lignes";
          else if (niveauNom === "CM1" || niveauNom === "CM2") contraintefinale += " · Au moins 5 lignes";

          const nouveauSujet = sujet ?? (bloc.contenu?.sujet as string) ?? "";
          const titreBloc = `Écriture — ${nouveauSujet}`.substring(0, 50);

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

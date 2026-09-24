// ── Le thème d'écriture du jour : générer, affecter ─────────────────────────
//
// Sorti des routes pour être appelé DIRECTEMENT par le cron. Il passait par
// HTTP — `${NEXT_PUBLIC_APP_URL}/api/…` — et chaque appel réseau ajoutait ses
// causes de panne (URL configurée, middleware, protection des déploiements,
// démarrage à froid), sans que le cron vérifie la réponse : il répondait « ok »
// quoi qu'il arrive. Les routes appellent ces mêmes fonctions : le comportement
// de la carte du tableau de bord ne change pas.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TYPES_JOUR, TYPES_SEMAINE, buildSystemPrompt, CONSIGNES_ECRITURE } from "./ecriture-types";

export interface ThemeEcriture {
  id: string | null;
  sujet: string;
  contrainte: string;
  affecte: boolean;
  afficher_contrainte?: boolean;
  mode?: "jour" | "semaine";
  planifie?: boolean;
}

export interface Affectation {
  ok: true;
  nb_eleves: number;
  deja_affecte?: boolean;
  deja_planifie?: boolean;
}

/** Une erreur qui porte son statut HTTP, pour les routes. */
export class ErreurTheme extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function genererOuRecupererTheme(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  force: boolean,
  modeForce?: "jour" | "semaine",
): Promise<ThemeEcriture> {
  const today = new Date().toISOString().split("T")[0];

  // Si pas de force : vérifier d'abord si un thème "semaine" est actif cette semaine
  if (!force) {
    // Chercher un thème mode "semaine" de la semaine courante (lundi → dimanche)
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const mondayStr = monday.toISOString().split("T")[0];
    const sundayDate = new Date(monday);
    sundayDate.setDate(monday.getDate() + 6);
    const sundayStr = sundayDate.toISOString().split("T")[0];

    const { data: themeSemaine } = await supabase
      .from("themes_ecriture")
      .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
      .eq("mode", "semaine")
      .gte("date", mondayStr)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (themeSemaine) {
      return themeSemaine as ThemeEcriture;
    }

    // Sinon chercher un thème du jour
    const { data: existant } = await supabase
      .from("themes_ecriture")
      .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
      .eq("date", today)
      .maybeSingle();

    if (existant) {
      return existant as ThemeEcriture;
    }

    // Fallback : des blocs écriture posés d'avance (via Nouvelle semaine) qui
    // valent pour AUJOURD'HUI — un bloc daté d'aujourd'hui, ou un atelier de la
    // semaine.
    //
    // ⚠️ Cette requête prenait N'IMPORTE QUEL bloc d'écriture de la semaine. Le
    // jeudi, elle trouvait le thème du mardi, déjà fait, et le renvoyait comme
    // « planifié » : la carte affichait un vieux thème, masquait l'interrupteur
    // jour/semaine et le bouton « Affecter », et ne générait pas le thème du
    // jour. Le filet de l'enseignant sautait précisément les jours où le cron
    // avait échoué.
    const { data: blocPlanifie } = await supabase
      .from("plan_travail")
      .select("id, contenu, periodicite")
      .eq("type", "ecriture")
      .gte("date_assignation", mondayStr)
      .lte("date_assignation", sundayStr)
      .or(`date_assignation.eq.${today},periodicite.eq.semaine,contenu->>mode.eq.semaine`)
      .limit(1)
      .maybeSingle();

    if (blocPlanifie && blocPlanifie.contenu) {
      const c = blocPlanifie.contenu as Record<string, unknown>;
      const modePlanifie = (c.mode as string) ?? (blocPlanifie.periodicite === "semaine" ? "semaine" : "jour");
      return {
        id: null,
        sujet: c.sujet ?? "",
        contrainte: (c.contrainte as string ?? "").replace(/ · Au moins \d+ lignes$/, "").trim(),
        affecte: true,
        afficher_contrainte: c.afficher_contrainte ?? true,
        mode: modePlanifie,
        planifie: true,
      } as ThemeEcriture;
    }
  } else {
    // force: true → supprimer l'existant pour pouvoir réinsérer
    await supabase.from("themes_ecriture").delete().eq("date", today);
  }

  // Déterminer le mode à utiliser
  const mode = modeForce ?? "jour";
  const typesListe = mode === "semaine" ? TYPES_SEMAINE : TYPES_JOUR;

  // Compter le total + récupérer les 50 derniers (sujet + type)
  const [{ count }, { data: derniers }] = await Promise.all([
    supabase.from("themes_ecriture").select("*", { count: "exact", head: true }),
    supabase
      .from("themes_ecriture")
      .select("sujet, type_ecriture")
      .order("date", { ascending: false })
      .limit(50),
  ]);

  // Type imposé par rotation déterministe sur la liste du mode
  const total = count ?? 0;
  const typeImpose = typesListe[total % typesListe.length];

  // Types utilisés récemment (pour contexte)
  const derniersTypes = (derniers ?? [])
    .slice(0, 6)
    .map((t: { type_ecriture: string | null }) => t.type_ecriture)
    .filter(Boolean)
    .join(", ");

  const listeSujets = (derniers ?? [])
    .map((t: { sujet: string }) => `- ${t.sujet}`)
    .join("\n");

  const systemPrompt = buildSystemPrompt(mode, typeImpose, derniersTypes, listeSujets);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [{ role: "user", content: "Génère un nouveau sujet d'écriture." }],
    system: systemPrompt,
  });

  const texte = message.content[0].type === "text" ? message.content[0].text : "";
  const texteNettoye = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(texteNettoye) as { sujet: string; contrainte: string };

  const { data: inserted, error } = await supabase
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

  if (error) {
    throw new Error(`themes_ecriture : ${error.message}`);
  }

  return inserted as ThemeEcriture;
}

/** Affecte le thème à tous les élèves des groupes : un bloc chacun, pour aujourd'hui. */
export async function affecterTheme(supabase: SupabaseClient, theme_id: string): Promise<Affectation> {
  const today = new Date().toISOString().split("T")[0];

  // 1. Récupérer le thème
  const { data: theme, error: errTheme } = await supabase
    .from("themes_ecriture")
    .select("id, sujet, contrainte, affecte, afficher_contrainte, mode")
    .eq("id", theme_id)
    .single();

  if (errTheme || !theme) {
    throw new ErreurTheme("Thème introuvable", 404);
  }

  // 2. Vérifier s'il n'est pas déjà affecté
  if (theme.affecte) {
    return { ok: true, nb_eleves: 0, deja_affecte: true };
  }

  // 2b. Vérifier s'il existe déjà des blocs écriture (planifiés à l'avance)
  const modeCheck = (theme as any).mode ?? "jour";
  if (modeCheck === "semaine") {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const { count } = await supabase
      .from("plan_travail")
      .select("id", { count: "exact", head: true })
      .eq("type", "ecriture")
      .gte("date_assignation", monday.toISOString().split("T")[0])
      .lte("date_assignation", sunday.toISOString().split("T")[0]);
    if ((count ?? 0) > 0) {
      return { ok: true, nb_eleves: 0, deja_planifie: true };
    }
  } else {
    const { count } = await supabase
      .from("plan_travail")
      .select("id", { count: "exact", head: true })
      .eq("type", "ecriture")
      .eq("date_assignation", today);
    if ((count ?? 0) > 0) {
      return { ok: true, nb_eleves: 0, deja_planifie: true };
    }
  }

  // 3a. Tous les membres de tous les groupes
  const { data: liaisons, error: errLiaisons } = await supabase
    .from("eleve_groupe")
    .select("planbox_eleve_id, repetibox_eleve_id, groupe_id");

  if (errLiaisons) {
    throw new Error(`eleve_groupe : ${errLiaisons.message}`);
  }
  if (!liaisons || liaisons.length === 0) {
    return { ok: true, nb_eleves: 0 };
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
  const themeMode = (theme as any).mode ?? "jour";
  const titreBloc = themeMode === "semaine"
    ? "Atelier écriture — Thème de la semaine"
    : "Atelier écriture — Thème du jour";

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
      instructions: CONSIGNES_ECRITURE[themeMode === "semaine" ? "semaine" : "jour"],
      afficher_contrainte: theme.afficher_contrainte ?? true,
      mode: themeMode,
    };
    if (themeMode === "semaine") {
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
    throw new Error(`plan_travail : ${errInsert.message}`);
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

  return { ok: true, nb_eleves: blocsAPlanTravail.length };
}

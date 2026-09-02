import { NextRequest, NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  ESSAIS_MAX,
  assurerMotDuJour,
  assurerThemeSemaine,
  dateDuJour,
  lundiDe,
} from "@/lib/motus";
import { THEMES, libelleTheme, themeExiste, themeSaisonnier } from "@/lib/motus-themes";

/**
 * GET /api/motus/teacher → le mot du jour, où en est chaque élève, et les
 * derniers jours joués.
 */
export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const date = dateDuJour();
  const lundi = lundiDe(date);
  const themeSemaine = await assurerThemeSemaine(admin, lundi);
  const motDuJour = await assurerMotDuJour(admin, date);

  const { data: parties } = await admin
    .from("motus_partie")
    .select("eleve_id, rb_eleve_id, essais, trouve, termine")
    .eq("date", date);

  // Noms des élèves des deux sources (PlanBox et Repetibox).
  const idsPB = (parties ?? []).map((p) => p.eleve_id).filter(Boolean) as string[];
  const idsRB = (parties ?? []).map((p) => p.rb_eleve_id).filter(Boolean) as number[];

  const [{ data: elevesPB }, { data: elevesRB }] = await Promise.all([
    idsPB.length
      ? admin.from("eleves").select("id, prenom, nom").in("id", idsPB)
      : Promise.resolve({ data: [] as { id: string; prenom: string; nom: string }[] }),
    idsRB.length
      ? admin.from("eleve").select("id, prenom, nom").in("id", idsRB)
      : Promise.resolve({ data: [] as { id: number; prenom: string; nom: string }[] }),
  ]);

  const nomPB = new Map((elevesPB ?? []).map((e) => [e.id, `${e.prenom} ${e.nom ?? ""}`.trim()]));
  const nomRB = new Map((elevesRB ?? []).map((e) => [Number(e.id), `${e.prenom} ${e.nom ?? ""}`.trim()]));

  const resultats = (parties ?? []).map((p) => {
    const essais = Array.isArray(p.essais) ? (p.essais as string[]) : [];
    return {
      uid: p.eleve_id ? `pb_${p.eleve_id}` : `rb_${p.rb_eleve_id}`,
      nom: p.eleve_id
        ? nomPB.get(p.eleve_id as string) ?? "Élève"
        : nomRB.get(Number(p.rb_eleve_id)) ?? "Élève",
      source: p.eleve_id ? "planbox" : "repetibox",
      nb_essais: essais.length,
      trouve: p.trouve as boolean,
      termine: p.termine as boolean,
    };
  });
  resultats.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  // Les 14 derniers jours, avec le taux de réussite de chacun.
  const debut = new Date(`${date}T12:00:00Z`);
  debut.setUTCDate(debut.getUTCDate() - 13);
  const depuis = debut.toISOString().split("T")[0];

  const [{ data: jours }, { data: partiesRecentes }] = await Promise.all([
    admin.from("motus_jour").select("date, mot").gte("date", depuis).lte("date", date).order("date", { ascending: false }),
    admin.from("motus_partie").select("date, trouve").gte("date", depuis).lte("date", date),
  ]);

  const parJour = new Map<string, { total: number; trouves: number }>();
  for (const p of partiesRecentes ?? []) {
    const d = p.date as string;
    const agg = parJour.get(d) ?? { total: 0, trouves: 0 };
    agg.total++;
    if (p.trouve) agg.trouves++;
    parJour.set(d, agg);
  }

  // Combien de mots actifs par thème : un thème vide ne pourrait pas tenir sa
  // semaine, l'enseignant doit le voir avant que la semaine n'arrive.
  // Compté par une vue : lire les lignes puis les compter ici serait faux,
  // PostgREST s'arrêtant à 1000 lignes.
  const { data: comptes } = await admin.from("motus_theme_compte").select("theme, nb");
  const parTheme = new Map<string, number>();
  for (const c of comptes ?? []) {
    parTheme.set((c.theme as string) ?? "", Number(c.nb));
  }

  return NextResponse.json({
    date,
    lundi,
    theme: themeSemaine,
    theme_libelle: libelleTheme(themeSemaine),
    theme_saisonnier: themeSaisonnier(lundi),
    themes: THEMES.map((t) => ({
      ...t,
      nb_mots: parTheme.get(t.code) ?? 0,
    })),
    essais_max: ESSAIS_MAX,
    mot: motDuJour?.mot ?? null,
    mot_id: motDuJour?.motId ?? null,
    aucun_mot: motDuJour === null,
    resultats,
    historique: (jours ?? []).map((j) => ({
      date: j.date as string,
      mot: j.mot as string,
      ...(parJour.get(j.date as string) ?? { total: 0, trouves: 0 }),
    })),
  });
}

/**
 * POST { mot_id? } → change le mot du jour.
 * POST { theme } → change le thème de la semaine, et retire le mot du jour
 *                  pour qu'il soit retiré dans le nouveau thème.
 *
 * Sans rien, un autre mot est tiré au sort parmi les mots actifs du thème les
 * moins récemment sortis. Dans tous les cas les parties du jour sont effacées :
 * garder les essais d'un mot qui n'est plus le bon afficherait des couleurs
 * fausses.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const motIdDemande = body?.mot_id ? String(body.mot_id) : null;
  const themeDemande = body?.theme ? String(body.theme) : null;

  const admin = createAdminClient();
  const date = dateDuJour();

  // Changement de thème : la semaine est marquée « imposée » pour que la
  // rotation ne la reprenne pas, et le mot du jour est retiré dans le thème.
  if (themeDemande) {
    if (!themeExiste(themeDemande)) {
      return NextResponse.json({ erreur: "Thème inconnu" }, { status: 400 });
    }
    const lundi = lundiDe(date);
    const { error: errTheme } = await admin
      .from("motus_semaine")
      .upsert({ lundi, theme: themeDemande, impose: true }, { onConflict: "lundi" });
    if (errTheme) {
      return NextResponse.json({ erreur: errTheme.message }, { status: 500 });
    }
    await admin.from("motus_partie").delete().eq("date", date);
    await admin.from("motus_jour").delete().eq("date", date);
    const nouveau = await assurerMotDuJour(admin, date);
    return NextResponse.json({
      ok: true,
      date,
      theme: themeDemande,
      theme_libelle: libelleTheme(themeDemande),
      mot: nouveau?.mot ?? null,
      mot_id: nouveau?.motId ?? null,
    });
  }

  let choisi: { id: string; mot_normalise: string } | null = null;

  if (motIdDemande) {
    const { data } = await admin
      .from("motus_mot")
      .select("id, mot_normalise")
      .eq("id", motIdDemande)
      .maybeSingle();
    if (!data) return NextResponse.json({ erreur: "Mot introuvable" }, { status: 404 });
    choisi = { id: data.id as string, mot_normalise: data.mot_normalise as string };
  } else {
    const { data: actuel } = await admin
      .from("motus_jour")
      .select("mot_id")
      .eq("date", date)
      .maybeSingle();

    // Rester dans le thème : l'indice affiché aux élèves doit rester vrai.
    // Le filtre est dans la requête (limite de 1000 lignes de PostgREST).
    const themeSemaine = await assurerThemeSemaine(admin, lundiDe(date));
    const { data: mots } = await admin
      .from("motus_mot")
      .select("id, mot_normalise, theme")
      .eq("actif", true)
      .eq("theme", themeSemaine);

    const candidats = (mots ?? []).filter((m) => m.id !== actuel?.mot_id);
    if (candidats.length === 0) {
      return NextResponse.json({ erreur: "Aucun autre mot actif dans la liste" }, { status: 400 });
    }
    const tire = candidats[Math.floor(Math.random() * candidats.length)];
    choisi = { id: tire.id as string, mot_normalise: tire.mot_normalise as string };
  }

  // `date` est la clé primaire de motus_jour : ici l'upsert est sûr.
  const { data: motChoisi } = await admin
    .from("motus_mot")
    .select("theme")
    .eq("id", choisi.id)
    .maybeSingle();

  const { error } = await admin
    .from("motus_jour")
    .upsert(
      { date, mot_id: choisi.id, mot: choisi.mot_normalise, theme: (motChoisi?.theme as string) ?? null },
      { onConflict: "date" },
    );
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  await admin.from("motus_partie").delete().eq("date", date);

  return NextResponse.json({ ok: true, date, mot: choisi.mot_normalise, mot_id: choisi.id });
}

import { NextRequest, NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { ESSAIS_MAX, assurerMotDuJour, dateDuJour } from "@/lib/motus";

/**
 * GET /api/motus/teacher → le mot du jour, où en est chaque élève, et les
 * derniers jours joués.
 */
export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const date = dateDuJour();
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

  return NextResponse.json({
    date,
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
 *
 * Sans `mot_id`, un autre mot est tiré au sort parmi les mots actifs les moins
 * récemment sortis. Les parties du jour sont effacées : garder les essais
 * d'un mot qui n'est plus le bon afficherait des couleurs fausses.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const motIdDemande = body?.mot_id ? String(body.mot_id) : null;

  const admin = createAdminClient();
  const date = dateDuJour();

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

    const { data: mots } = await admin
      .from("motus_mot")
      .select("id, mot_normalise")
      .eq("actif", true);

    const candidats = (mots ?? []).filter((m) => m.id !== actuel?.mot_id);
    if (candidats.length === 0) {
      return NextResponse.json({ erreur: "Aucun autre mot actif dans la liste" }, { status: 400 });
    }
    const tire = candidats[Math.floor(Math.random() * candidats.length)];
    choisi = { id: tire.id as string, mot_normalise: tire.mot_normalise as string };
  }

  // `date` est la clé primaire de motus_jour : ici l'upsert est sûr.
  const { error } = await admin
    .from("motus_jour")
    .upsert({ date, mot_id: choisi.id, mot: choisi.mot_normalise }, { onConflict: "date" });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  await admin.from("motus_partie").delete().eq("date", date);

  return NextResponse.json({ ok: true, date, mot: choisi.mot_normalise, mot_id: choisi.id });
}

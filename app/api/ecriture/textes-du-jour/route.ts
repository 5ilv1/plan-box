import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { normaliserContenuEcriture } from "@/lib/ecriture-normaliser";
import { lundiDeSemaine, semaineISO } from "@/lib/semaine-iso";

/**
 * GET /api/ecriture/textes-du-jour?semaine=YYYY-MM-DD (lundi)
 *
 * Les textes d'écriture **du jour** d'une semaine, jour par jour et élève par
 * élève.
 *
 * La page « Atelier écriture » ne montrait que l'atelier de la semaine
 * (`textes-finaux`, mode `semaine`). Les textes du jour — le mode par défaut —
 * n'étaient lisibles qu'un par un, depuis la matrice du jour du suivi, en
 * changeant la date à chaque fois.
 *
 * Réservé à l'enseignant : chaque texte part avec le nom de son auteur.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const param = req.nextUrl.searchParams.get("semaine");
  const lundi = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : lundiDeSemaine(semaineISO());
  const vendredi = decaler(lundi, 4);

  const admin = createAdminClient();
  const { data: blocs, error } = await admin
    .from("plan_travail")
    .select("id, titre, contenu, statut, date_assignation, repetibox_eleve_id, eleve_id")
    .eq("type", "ecriture")
    .gte("date_assignation", lundi)
    .lte("date_assignation", vendredi);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // L'atelier de la semaine a sa propre liste, au-dessus : on n'en garde rien ici.
  const duJour = (blocs ?? []).filter(
    (b) => (b.contenu as Record<string, unknown> | null)?.mode !== "semaine"
  );

  // Les noms, dans les deux sources d'élèves.
  const rbIds = [...new Set(duJour.map((b) => b.repetibox_eleve_id).filter((x): x is number => x != null))];
  const pbIds = [...new Set(duJour.map((b) => b.eleve_id).filter((x): x is string => !!x))];
  const noms = new Map<string, { prenom: string; nom: string }>();
  if (rbIds.length) {
    const { data } = await admin.from("eleve").select("id, prenom, nom").in("id", rbIds);
    for (const e of data ?? []) noms.set(`rb_${e.id}`, { prenom: e.prenom, nom: e.nom ?? "" });
  }
  if (pbIds.length) {
    const { data } = await admin.from("eleves").select("id, prenom, nom").in("id", pbIds);
    for (const e of data ?? []) noms.set(`pb_${e.id}`, { prenom: e.prenom, nom: e.nom ?? "" });
  }

  // Combien de fois l'élève a demandé « Corriger mon texte ».
  const nbCorrections = new Map<string, number>();
  if (duJour.length) {
    const { data } = await admin
      .from("ecriture_analyse")
      .select("bloc_id")
      .in("bloc_id", duJour.map((b) => b.id));
    for (const a of data ?? []) nbCorrections.set(a.bloc_id, (nbCorrections.get(a.bloc_id) ?? 0) + 1);
  }

  interface TexteDuJour {
    id: string; prenom: string; nom: string; statut: string;
    texte: string; nbCorrections: number; nbAnnotations: number;
  }
  const jours = new Map<string, { date: string; sujet: string; textes: TexteDuJour[] }>();
  for (const b of duJour) {
    const c = normaliserContenuEcriture((b.contenu ?? {}) as Record<string, unknown>);
    const qui = b.repetibox_eleve_id != null ? `rb_${b.repetibox_eleve_id}` : `pb_${b.eleve_id}`;
    const eleve = noms.get(qui) ?? { prenom: "—", nom: "" };
    const texte = (c.texte_final || c.texte_courant || "").trim();

    const jour = jours.get(b.date_assignation) ?? { date: b.date_assignation, sujet: c.sujet ?? "", textes: [] as TexteDuJour[] };
    if (!jour.sujet && c.sujet) jour.sujet = c.sujet;
    jour.textes.push({
      id: b.id,
      prenom: eleve.prenom,
      nom: eleve.nom,
      statut: b.statut,
      texte,
      nbCorrections: nbCorrections.get(b.id) ?? 0,
      nbAnnotations: c.annotations.length,
    });
    jours.set(b.date_assignation, jour);
  }

  const liste = [...jours.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((j) => ({
      ...j,
      textes: j.textes.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr")),
    }));

  return NextResponse.json({ lundi, jours: liste });
}

function decaler(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

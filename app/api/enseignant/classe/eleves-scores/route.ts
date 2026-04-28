import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import {
  calculerDomainesParEleve,
  scoreMatiereDepuis,
  SOUS_DOMAINES_FR,
  SOUS_DOMAINES_MATHS,
} from "@/lib/suivi-domaines";

/**
 * GET /api/enseignant/classe/eleves-scores?niveau=tous|CE2|CM1|CM2&periode=...
 *
 * Liste des élèves de la cohorte avec leur % global Français / Maths.
 * Cliquable côté UI vers la fiche individuelle.
 */
function getDateDebut(periode: string): string | null {
  const d = new Date();
  if (periode === "jour")      { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  if (periode === "semaine")   { d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (periode === "mois")      { d.setMonth(d.getMonth() - 1); return d.toISOString(); }
  if (periode === "trimestre") { d.setMonth(d.getMonth() - 3); return d.toISOString(); }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const niveau = req.nextUrl.searchParams.get("niveau") ?? "tous";
  const periode = req.nextUrl.searchParams.get("periode") ?? "all";
  const dateDebut = getDateDebut(periode);
  const admin = createAdminClient();

  type EleveRow = { uid: string; prenom: string; nom: string; niveau: string | null; source: "planbox" | "repetibox" };
  const eleves: EleveRow[] = [];

  // ── PlanBox via eleves.niveau_id → niveaux.nom ─────────────────────────
  const { data: pbList } = await admin.from("eleves").select("id, prenom, nom, niveaux(nom)");
  for (const e of pbList ?? []) {
    const niv = ((e as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? null;
    if (niveau !== "tous" && niv !== niveau) continue;
    eleves.push({
      uid: `pb_${e.id as string}`,
      prenom: (e.prenom as string) ?? "",
      nom: ((e as unknown as { nom?: string }).nom) ?? "",
      niveau: niv,
      source: "planbox",
    });
  }

  // ── Repetibox via eleve_groupe → groupes.nom ───────────────────────────
  // (groupes.id est un UUID, eleve_groupe.repetibox_eleve_id un integer)
  const niveauParRb = new Map<number, string>();
  const { data: groupesNiveaux } = await admin
    .from("groupes")
    .select("id, nom")
    .in("nom", ["CE2", "CM1", "CM2"]);
  const groupeIdToNiv = new Map<string, string>(
    (groupesNiveaux ?? []).map((g) => [g.id as string, g.nom as string])
  );
  if (groupeIdToNiv.size > 0) {
    const { data: liens } = await admin
      .from("eleve_groupe")
      .select("repetibox_eleve_id, groupe_id")
      .in("groupe_id", [...groupeIdToNiv.keys()]);
    for (const l of liens ?? []) {
      const rb = (l as { repetibox_eleve_id?: number }).repetibox_eleve_id;
      const gid = (l as { groupe_id?: string }).groupe_id;
      if (typeof rb === "number" && typeof gid === "string") {
        const niv = groupeIdToNiv.get(gid);
        if (niv) niveauParRb.set(rb, niv);
      }
    }
  }

  const { data: rbList } = await admin.from("eleve").select("id, prenom, nom");
  for (const e of rbList ?? []) {
    const rb = e.id as number;
    const niv = niveauParRb.get(rb) ?? null;
    if (niveau !== "tous" && niv !== niveau) continue;
    eleves.push({
      uid: `rb_${rb}`,
      prenom: (e.prenom as string) ?? "",
      nom: ((e as unknown as { nom?: string }).nom) ?? "",
      niveau: niv,
      source: "repetibox",
    });
  }

  // ── Calcul batch en 4 requêtes pour tous les élèves d'un coup ──────────
  type Resultat = EleveRow & { francais_pct: number | null; maths_pct: number | null; nb_essais: number };
  const cible = {
    pb_ids: eleves.filter((e) => e.source === "planbox").map((e) => e.uid.slice(3)),
    rb_ids: eleves.filter((e) => e.source === "repetibox").map((e) => parseInt(e.uid.slice(3), 10)),
  };
  const cartes = await calculerDomainesParEleve(admin, cible, dateDebut);

  const resultats: Resultat[] = eleves.map((e) => {
    const c = cartes.get(e.uid) ?? {};
    const fr = scoreMatiereDepuis(c, SOUS_DOMAINES_FR);
    const ma = scoreMatiereDepuis(c, SOUS_DOMAINES_MATHS);
    return {
      ...e,
      francais_pct: fr.score,
      maths_pct: ma.score,
      nb_essais: fr.nb_essais + ma.nb_essais,
    };
  });
  resultats.sort((a, b) => a.prenom.localeCompare(b.prenom));

  return NextResponse.json({ eleves: resultats });
}

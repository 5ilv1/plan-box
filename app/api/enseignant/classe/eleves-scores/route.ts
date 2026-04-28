import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import {
  calculerDomaines,
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
  // Mapping rb_id → niveau (CE2/CM1/CM2)
  const niveauParRb = new Map<number, string>();
  const { data: groupesNiveaux } = await admin
    .from("groupes")
    .select("id, nom")
    .in("nom", ["CE2", "CM1", "CM2"]);
  const groupeIdToNiv = new Map<number, string>(
    (groupesNiveaux ?? []).map((g) => [g.id as number, g.nom as string])
  );
  if (groupeIdToNiv.size > 0) {
    const { data: liens } = await admin
      .from("eleve_groupe")
      .select("repetibox_eleve_id, groupe_id")
      .in("groupe_id", [...groupeIdToNiv.keys()]);
    for (const l of liens ?? []) {
      const rb = (l as { repetibox_eleve_id?: number }).repetibox_eleve_id;
      const gid = (l as { groupe_id?: number }).groupe_id;
      if (typeof rb === "number" && typeof gid === "number") {
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

  // ── Pour chaque élève : domaines + scores matière ──────────────────────
  // Parallélisation par lots de 8 pour ne pas saturer
  type Resultat = EleveRow & { francais_pct: number | null; maths_pct: number | null; nb_essais: number };
  const resultats: Resultat[] = [];
  const taille = 8;
  for (let i = 0; i < eleves.length; i += taille) {
    const lot = eleves.slice(i, i + taille);
    const sortie = await Promise.all(lot.map(async (e) => {
      const cible = e.source === "planbox"
        ? { pb_ids: [e.uid.slice(3)], rb_ids: [] as number[] }
        : { pb_ids: [] as string[], rb_ids: [parseInt(e.uid.slice(3), 10)] };
      const carte = await calculerDomaines(admin, cible, dateDebut);
      const fr = scoreMatiereDepuis(carte, SOUS_DOMAINES_FR);
      const ma = scoreMatiereDepuis(carte, SOUS_DOMAINES_MATHS);
      return {
        ...e,
        francais_pct: fr.score,
        maths_pct: ma.score,
        nb_essais: fr.nb_essais + ma.nb_essais,
      };
    }));
    resultats.push(...sortie);
  }

  resultats.sort((a, b) => a.prenom.localeCompare(b.prenom));

  return NextResponse.json({ eleves: resultats });
}

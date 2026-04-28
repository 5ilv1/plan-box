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

const ETOILES_TO_NIVEAU: Record<number, string> = { 1: "CE2", 2: "CM1", 3: "CM2", 4: "CM2" };

export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const niveau = req.nextUrl.searchParams.get("niveau") ?? "tous";
  const periode = req.nextUrl.searchParams.get("periode") ?? "all";
  const dateDebut = getDateDebut(periode);
  const admin = createAdminClient();

  // ── Construire la liste des élèves de la cohorte ───────────────────────
  type EleveRow = { uid: string; prenom: string; nom: string; niveau: string | null; source: "planbox" | "repetibox" };
  const eleves: EleveRow[] = [];

  // PB
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

  // RB
  const etoilesCibles = niveau === "tous" ? [1, 2, 3, 4]
    : niveau === "CE2" ? [1] : niveau === "CM1" ? [2] : niveau === "CM2" ? [3, 4] : [];
  if (etoilesCibles.length > 0) {
    const { data: rbList } = await admin.from("eleve").select("id, prenom, nom, niveau_etoiles").in("niveau_etoiles", etoilesCibles);
    for (const e of rbList ?? []) {
      eleves.push({
        uid: `rb_${e.id as number}`,
        prenom: (e.prenom as string) ?? "",
        nom: ((e as unknown as { nom?: string }).nom) ?? "",
        niveau: ETOILES_TO_NIVEAU[(e.niveau_etoiles as number) ?? 0] ?? null,
        source: "repetibox",
      });
    }
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

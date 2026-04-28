import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { CEINTURES } from "@/lib/ceintures";
import {
  calculerDomaines,
  scoreMatiereDepuis,
  SOUS_DOMAINES_FR,
  SOUS_DOMAINES_MATHS,
  type CarteDomaines,
  type CibleEleves,
} from "@/lib/suivi-domaines";

/**
 * GET /api/enseignant/suivi?cible=eleve&id=pb_xxx ou rb_N
 * GET /api/enseignant/suivi?cible=classe&niveau=tous|CE2|CM1|CM2
 *   &periode=jour|semaine|mois|trimestre|all
 *
 * Renvoie une page-portrait : Français/Maths agrégés avec les sous-domaines,
 * + ceinture (élève seul), + lecture, + forces/faiblesses IA.
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

async function recupererCible(
  admin: ReturnType<typeof createAdminClient>,
  searchParams: URLSearchParams
): Promise<{
  cible: CibleEleves;
  titre: string;
  sousTitre: string | null;
  niveauUnique: string | null;
  inclureCeinture: boolean;
  inclureLecture: boolean;
  cibleId: string | null; // pour ceinture / lecture (1 seul élève)
}> {
  const type = searchParams.get("cible") ?? "eleve";

  if (type === "eleve") {
    const id = searchParams.get("id") ?? "";
    const cible: CibleEleves = { pb_ids: [], rb_ids: [] };
    let titre = "Élève";
    let sousTitre: string | null = null;
    let niveau: string | null = null;
    if (id.startsWith("rb_")) {
      const rb = parseInt(id.slice(3), 10);
      cible.rb_ids = [rb];
      const { data } = await admin.from("eleve").select("prenom, nom, niveau_etoiles").eq("id", rb).maybeSingle();
      if (data) {
        titre = `${data.prenom ?? ""} ${data.nom ?? ""}`.trim();
        niveau = ETOILES_TO_NIVEAU[(data.niveau_etoiles as number) ?? 0] ?? null;
        sousTitre = niveau;
      }
    } else {
      const pb = id.startsWith("pb_") ? id.slice(3) : id;
      cible.pb_ids = [pb];
      const { data } = await admin.from("eleves").select("prenom, nom, niveaux(nom)").eq("id", pb).maybeSingle();
      if (data) {
        titre = `${data.prenom ?? ""} ${(data as unknown as { nom?: string }).nom ?? ""}`.trim();
        niveau = ((data as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? null;
        sousTitre = niveau;
      }
    }
    return { cible, titre, sousTitre, niveauUnique: niveau, inclureCeinture: true, inclureLecture: true, cibleId: id };
  }

  // type === "classe"
  const niveauFiltre = searchParams.get("niveau") ?? "tous";
  const cible: CibleEleves = { pb_ids: [], rb_ids: [] };

  // PlanBox
  let qPB = admin.from("eleves").select("id, niveaux(nom)");
  const { data: pbList } = await qPB;
  for (const e of pbList ?? []) {
    const niv = ((e as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? null;
    if (niveauFiltre === "tous" || niv === niveauFiltre) cible.pb_ids.push(e.id as string);
  }

  // Repetibox
  const etoilesCibles = niveauFiltre === "tous"
    ? [1, 2, 3, 4]
    : niveauFiltre === "CE2" ? [1] : niveauFiltre === "CM1" ? [2] : niveauFiltre === "CM2" ? [3, 4] : [];
  if (etoilesCibles.length > 0) {
    const { data: rbList } = await admin.from("eleve").select("id").in("niveau_etoiles", etoilesCibles);
    for (const e of rbList ?? []) cible.rb_ids.push(e.id as number);
  }

  return {
    cible,
    titre: niveauFiltre === "tous" ? "Toute la classe" : niveauFiltre,
    sousTitre: niveauFiltre === "tous" ? `${cible.pb_ids.length + cible.rb_ids.length} élèves` : `Niveau ${niveauFiltre}`,
    niveauUnique: niveauFiltre === "tous" ? null : niveauFiltre,
    inclureCeinture: false,
    inclureLecture: true,
    cibleId: null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const periode = req.nextUrl.searchParams.get("periode") ?? "all";
  const dateDebut = getDateDebut(periode);
  const admin = createAdminClient();

  const { cible, titre, sousTitre, niveauUnique, inclureCeinture, inclureLecture, cibleId } =
    await recupererCible(admin, req.nextUrl.searchParams);

  // Carte des sous-domaines
  const carte: CarteDomaines = await calculerDomaines(admin, cible, dateDebut);

  const fr = scoreMatiereDepuis(carte, SOUS_DOMAINES_FR);
  const maths = scoreMatiereDepuis(carte, SOUS_DOMAINES_MATHS);

  // Ceinture (1 seul élève)
  let ceinture: { index: number; nom: string; couleur: string } | null = null;
  if (inclureCeinture && cibleId) {
    const filtre = cible.rb_ids.length > 0
      ? { col: "rb_eleve_id", val: cible.rb_ids[0] as number | string }
      : { col: "eleve_id", val: cible.pb_ids[0] };
    const { data: c } = await admin
      .from("ceinture_resultat")
      .select("ceinture_index")
      .eq(filtre.col, filtre.val)
      .eq("reussi", true)
      .order("ceinture_index", { ascending: false })
      .limit(1);
    const idx = c?.[0]?.ceinture_index ?? -1;
    if (idx >= 0) {
      const def = CEINTURES[idx] ?? CEINTURES[0];
      ceinture = { index: def.index, nom: def.nom, couleur: def.couleur };
    } else {
      ceinture = { index: -1, nom: "Aucune encore", couleur: "#9CA3AF" };
    }
  }

  // Lecture : nb blocs lecture faits sur la cible
  let nbLectures = 0;
  if (inclureLecture) {
    let qL = admin
      .from("plan_travail")
      .select("id", { count: "exact", head: true })
      .eq("type", "lecture")
      .eq("statut", "fait");
    if (cible.pb_ids.length > 0 && cible.rb_ids.length > 0) {
      qL = qL.or(`eleve_id.in.(${cible.pb_ids.join(",")}),repetibox_eleve_id.in.(${cible.rb_ids.join(",")})`);
    } else if (cible.pb_ids.length > 0) {
      qL = qL.in("eleve_id", cible.pb_ids);
    } else if (cible.rb_ids.length > 0) {
      qL = qL.in("repetibox_eleve_id", cible.rb_ids);
    }
    if (dateDebut) qL = qL.gte("date_assignation", dateDebut.split("T")[0]);
    const { count } = await qL;
    nbLectures = count ?? 0;
  }

  // Forces / faiblesses IA
  let forces: string[] = [];
  let faiblesses: string[] = [];
  try {
    const filtres = [...SOUS_DOMAINES_FR, ...SOUS_DOMAINES_MATHS]
      .map((lib) => ({ libelle: lib, pourcentage: carte[lib]?.score ?? null }))
      .filter((d) => d.pourcentage !== null);
    if (filtres.length >= 3) {
      const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
      const cibleStr = niveauUnique ? `de ${niveauUnique}` : "(niveaux mélangés)";
      const acteur = inclureCeinture ? "un élève" : "la classe";
      const rep = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `Tu analyses les résultats de ${acteur} ${cibleStr}. Voici les pourcentages de réussite par sous-domaine :
${filtres.map((d) => `- ${d.libelle} : ${d.pourcentage}%`).join("\n")}

Donne 3 FORCES et 3 FAIBLESSES, formulées comme des phrases courtes destinées au maître pour piloter sa pédagogie. Reste factuel.

Retourne UNIQUEMENT un JSON :
{
  "forces": ["...", "...", "..."],
  "faiblesses": ["...", "...", "..."]
}`,
          },
        ],
      });
      const raw = (rep.content[0] as { type: string; text: string }).text;
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as { forces?: string[]; faiblesses?: string[] };
        forces = (parsed.forces ?? []).slice(0, 3);
        faiblesses = (parsed.faiblesses ?? []).slice(0, 3);
      }
    }
  } catch (err) {
    console.error("[suivi/ia]", err);
  }

  return NextResponse.json({
    titre,
    sousTitre,
    nbEleves: cible.pb_ids.length + cible.rb_ids.length,
    domaines: carte,
    matieres: {
      francais: { score: fr.score, nb_essais: fr.nb_essais },
      maths: { score: maths.score, nb_essais: maths.nb_essais },
    },
    ceinture,
    lecture: { nb_blocs_faits: nbLectures },
    forces,
    faiblesses,
    niveau: niveauUnique,
  });
}

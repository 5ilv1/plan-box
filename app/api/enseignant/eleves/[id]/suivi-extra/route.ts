import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { CEINTURES } from "@/lib/ceintures";

/**
 * GET /api/enseignant/eleves/[id]/suivi-extra?periode=jour|semaine|mois|trimestre|all
 *
 * Données complémentaires pour la page de suivi élève (page-portrait) :
 *   - niveau (CE2/CM1/CM2)
 *   - ceinture multiplication actuelle
 *   - lecture (nb blocs faits)
 *   - forces / faiblesses (IA, 3 + 3) à partir des % par sous-domaine
 *
 * Body POST attendu : { domaines: [{ libelle, pourcentage|null }] }
 *   pour générer les forces/faiblesses sans recalculer les % côté serveur.
 */

interface DomaineIn {
  libelle: string;
  pourcentage: number | null;
}

function getDateDebut(periode: string): string | null {
  const d = new Date();
  if (periode === "jour")      { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  if (periode === "semaine")   { d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (periode === "mois")      { d.setMonth(d.getMonth() - 1); return d.toISOString(); }
  if (periode === "trimestre") { d.setMonth(d.getMonth() - 3); return d.toISOString(); }
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const periode = req.nextUrl.searchParams.get("periode") ?? "all";
  const body = (await req.json()) as { domaines?: DomaineIn[] };
  const domaines = body.domaines ?? [];

  const admin = createAdminClient();
  const dateDebut = getDateDebut(periode);

  // ── Identifier l'élève (PB ou RB) ──────────────────────────────────────
  let eleveUid: string | null = null;
  let prenom = "";
  let niveauNom: string | null = null;
  let rbId: number | null = null;
  let pbId: string | null = null;

  if (id.startsWith("rb_")) {
    rbId = parseInt(id.slice(3), 10);
    const { data } = await admin.from("eleve").select("id, prenom, niveau_etoiles").eq("id", rbId).maybeSingle();
    if (data) {
      eleveUid = id;
      prenom = (data.prenom as string) ?? "";
      const etoiles = data.niveau_etoiles as number | null;
      niveauNom = etoiles === 1 ? "CE2" : etoiles === 2 ? "CM1" : etoiles === 3 ? "CM2" : etoiles === 4 ? "CM2+" : null;
    }
  } else {
    pbId = id.startsWith("pb_") ? id.slice(3) : id;
    const { data } = await admin
      .from("eleves")
      .select("id, prenom, niveaux(nom)")
      .eq("id", pbId)
      .maybeSingle();
    if (data) {
      eleveUid = `pb_${pbId}`;
      prenom = (data.prenom as string) ?? "";
      niveauNom = ((data as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? null;
    }
  }

  if (!eleveUid) {
    return NextResponse.json({ erreur: "Élève introuvable" }, { status: 404 });
  }

  // ── Ceinture multiplication ────────────────────────────────────────────
  let filtreEleve = rbId !== null
    ? { col: "rb_eleve_id", val: rbId as number | string }
    : { col: "eleve_id", val: pbId as string };
  const { data: ceintures } = await admin
    .from("ceinture_resultat")
    .select("ceinture_index")
    .eq(filtreEleve.col, filtreEleve.val)
    .eq("reussi", true)
    .order("ceinture_index", { ascending: false })
    .limit(1);
  const idxCeinture = ceintures?.[0]?.ceinture_index ?? -1;
  const ceintureCouranteIdx = Math.max(0, idxCeinture); // -1 → blanche en cours
  const ceintureDef = CEINTURES[ceintureCouranteIdx] ?? CEINTURES[0];
  const ceinture = idxCeinture < 0
    ? { index: -1, nom: "Aucune encore", couleur: "#9CA3AF" }
    : { index: ceintureDef.index, nom: ceintureDef.nom, couleur: ceintureDef.couleur };

  // ── Lecture (nb blocs lecture faits sur la période) ────────────────────
  let qLecture = admin
    .from("plan_travail")
    .select("id", { count: "exact", head: true })
    .eq("type", "lecture")
    .eq("statut", "fait");
  if (rbId !== null) qLecture = qLecture.eq("repetibox_eleve_id", rbId);
  else qLecture = qLecture.eq("eleve_id", pbId);
  if (dateDebut) qLecture = qLecture.gte("date_assignation", dateDebut.split("T")[0]);
  const { count: nbLectures } = await qLecture;

  // ── Forces / faiblesses via IA ─────────────────────────────────────────
  let forces: string[] = [];
  let faiblesses: string[] = [];
  try {
    const filtres = domaines.filter((d) => d.pourcentage !== null);
    if (filtres.length >= 3) {
      const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
      const rep = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `Tu analyses les résultats d'un élève de ${niveauNom ?? "primaire"}. Voici ses pourcentages par sous-domaine :
${filtres.map((d) => `- ${d.libelle} : ${d.pourcentage}%`).join("\n")}

Donne 3 FORCES et 3 FAIBLESSES, formulées comme des phrases courtes destinées au maître pour piloter sa pédagogie (pas pour l'élève). Reste factuel, pas de blabla.

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
    console.error("[suivi-extra/ia]", err);
  }

  return NextResponse.json({
    prenom,
    niveau: niveauNom,
    ceinture,
    lecture: { nb_blocs_faits: nbLectures ?? 0 },
    forces,
    faiblesses,
  });
}

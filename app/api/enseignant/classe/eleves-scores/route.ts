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
  type Resultat = EleveRow & {
    francais_pct: number | null;
    maths_pct: number | null;
    nb_essais: number;
    nb_blocs_faits: number;
    nb_blocs_totaux: number;
    avancement_pct: number | null;
    nb_mots_ecriture: number;
    pct_mots_justes: number | null;
  };
  const cible = {
    pb_ids: eleves.filter((e) => e.source === "planbox").map((e) => e.uid.slice(3)),
    rb_ids: eleves.filter((e) => e.source === "repetibox").map((e) => parseInt(e.uid.slice(3), 10)),
  };
  const cartes = await calculerDomainesParEleve(admin, cible, dateDebut);

  // ── Avancement : blocs DU JOUR faits / proposés ──────────────────────
  // Indépendant du filtre période (qui ne s'applique qu'aux % matière).
  // On veut un indicateur "pulse" pour la journée en cours.
  const aujourdhui = new Date().toISOString().split("T")[0];
  const TYPES_EXCLUS = new Set(["ressource", "lecon_copier", "ceinture_multiplication"]);
  const blocsParUid = new Map<string, { total: number; faits: number }>();
  const incr = (uid: string, statut: string, type: string) => {
    if (TYPES_EXCLUS.has(type)) return;
    let s = blocsParUid.get(uid);
    if (!s) { s = { total: 0, faits: 0 }; blocsParUid.set(uid, s); }
    s.total++;
    if (statut === "fait") s.faits++;
  };
  if (cible.pb_ids.length > 0) {
    const { data } = await admin
      .from("plan_travail")
      .select("eleve_id, statut, type")
      .in("eleve_id", cible.pb_ids)
      .eq("date_assignation", aujourdhui);
    for (const r of (data ?? []) as Array<{ eleve_id: string; statut: string; type: string }>) {
      incr(`pb_${r.eleve_id}`, r.statut, r.type);
    }
  }
  if (cible.rb_ids.length > 0) {
    const { data } = await admin
      .from("plan_travail")
      .select("repetibox_eleve_id, statut, type")
      .in("repetibox_eleve_id", cible.rb_ids)
      .eq("date_assignation", aujourdhui);
    for (const r of (data ?? []) as Array<{ repetibox_eleve_id: number; statut: string; type: string }>) {
      incr(`rb_${r.repetibox_eleve_id}`, r.statut, r.type);
    }
  }

  // ── Atelier d'écriture : nb mots et % justes par élève ───────────────
  const compterMots = (s: string) => {
    const t = s?.trim() ?? "";
    return t ? t.split(/\s+/).length : 0;
  };
  type EcritureStat = { mots: number; corriges: number };
  const ecritureParUid = new Map<string, EcritureStat>();
  const ajouterEcriture = (uid: string, contenu: Record<string, unknown>) => {
    if (contenu.mode !== "semaine") return;
    const texte = (contenu.texte_final as string)?.trim() || (contenu.texte_courant as string) || "";
    const mots = compterMots(texte);
    if (mots === 0) return;
    let s = ecritureParUid.get(uid);
    if (!s) { s = { mots: 0, corriges: 0 }; ecritureParUid.set(uid, s); }
    s.mots += mots;
    const annotations = Array.isArray(contenu.annotations)
      ? (contenu.annotations as Array<{ extrait?: string; statut?: string }>)
      : [];
    for (const a of annotations) {
      if (a.statut === "ignoree") continue;
      s.corriges += compterMots(a.extrait ?? "");
    }
  };
  if (cible.pb_ids.length > 0) {
    let q = admin.from("plan_travail").select("eleve_id, contenu").eq("type", "ecriture").eq("statut", "fait").in("eleve_id", cible.pb_ids);
    if (dateJour) q = q.gte("date_assignation", dateJour);
    const { data } = await q;
    for (const r of (data ?? []) as Array<{ eleve_id: string; contenu: Record<string, unknown> }>) {
      ajouterEcriture(`pb_${r.eleve_id}`, r.contenu ?? {});
    }
  }
  if (cible.rb_ids.length > 0) {
    let q = admin.from("plan_travail").select("repetibox_eleve_id, contenu").eq("type", "ecriture").eq("statut", "fait").in("repetibox_eleve_id", cible.rb_ids);
    if (dateJour) q = q.gte("date_assignation", dateJour);
    const { data } = await q;
    for (const r of (data ?? []) as Array<{ repetibox_eleve_id: number; contenu: Record<string, unknown> }>) {
      ajouterEcriture(`rb_${r.repetibox_eleve_id}`, r.contenu ?? {});
    }
  }

  const resultats: Resultat[] = eleves.map((e) => {
    const c = cartes.get(e.uid) ?? {};
    const blocs = blocsParUid.get(e.uid) ?? { total: 0, faits: 0 };
    const ec = ecritureParUid.get(e.uid) ?? { mots: 0, corriges: 0 };
    const pctJustes = ec.mots > 0
      ? Math.max(0, Math.round((1 - ec.corriges / ec.mots) * 100))
      : null;
    // Injecte l'écriture dans la carte de l'élève pour qu'elle pèse dans
    // le score Français global (pondération par nb de mots).
    if (pctJustes !== null) {
      c["Écriture"] = { score: pctJustes, nb_essais: ec.mots };
    }
    const fr = scoreMatiereDepuis(c, SOUS_DOMAINES_FR);
    const ma = scoreMatiereDepuis(c, SOUS_DOMAINES_MATHS);
    return {
      ...e,
      francais_pct: fr.score,
      maths_pct: ma.score,
      nb_essais: fr.nb_essais + ma.nb_essais,
      nb_blocs_faits: blocs.faits,
      nb_blocs_totaux: blocs.total,
      avancement_pct: blocs.total > 0 ? Math.round((blocs.faits / blocs.total) * 100) : null,
      nb_mots_ecriture: ec.mots,
      pct_mots_justes: pctJustes,
    };
  });
  resultats.sort((a, b) => a.prenom.localeCompare(b.prenom));

  return NextResponse.json({ eleves: resultats });
}

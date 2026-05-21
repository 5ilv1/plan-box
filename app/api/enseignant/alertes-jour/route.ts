import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * GET /api/enseignant/alertes-jour
 *
 * Récapitulatif des blocs ponctuels du jour pour le hero du dashboard :
 *   - Pour chaque type de bloc ponctuel programmé aujourd'hui :
 *       liste des élèves qui ont fait + liste de ceux qui n'ont pas fait
 *   - Liste des élèves "en retard" (heure ≥ midi et progression < 50%)
 *
 * Types inclus :
 *   dictee, correction_dictee, qcm, daily-problem, calcul_jour,
 *   lecon_copier, mots, exercice
 *
 * Types EXCLUS : ressource, fichier_maths, lecture, ceinture_multiplication,
 * ecriture (semaine), eval (exos d'éval automatique).
 */

const TYPES_PONCTUELS = new Set([
  "dictee",
  "correction_dictee",
  "qcm",
  "calcul_mental",
  "probleme_maths",
  "lecon_copier",
  "mots",
  "exercice",
  "texte_a_trous",
  "analyse_phrase",
  "classement",
]);

const SEUIL_RETARD_HEURE = 12; // midi
const SEUIL_RETARD_PCT = 50;

interface Eleve {
  uid: string;
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
}

export async function GET(_req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // ── Élèves ─────────────────────────────────────────────────────────────
  const elevesMap = new Map<string, Eleve>();
  const { data: pb } = await admin.from("eleves").select("id, prenom, nom");
  for (const e of pb ?? []) {
    const id = e.id as string;
    elevesMap.set(`pb_${id}`, {
      uid: `pb_${id}`,
      prenom: (e.prenom as string) ?? "",
      nom: ((e as unknown as { nom?: string }).nom) ?? "",
      source: "planbox",
    });
  }
  const { data: rb } = await admin.from("eleve").select("id, prenom, nom");
  for (const e of rb ?? []) {
    const id = e.id as number;
    elevesMap.set(`rb_${id}`, {
      uid: `rb_${id}`,
      prenom: (e.prenom as string) ?? "",
      nom: ((e as unknown as { nom?: string }).nom) ?? "",
      source: "repetibox",
    });
  }

  // ── Blocs ponctuels du jour ────────────────────────────────────────────
  const { data: blocs } = await admin
    .from("plan_travail")
    .select("id, type, titre, statut, eleve_id, repetibox_eleve_id")
    .eq("date_assignation", today);

  // Groupement par (type, titre) — un groupe = même tâche pour tous les élèves
  type Groupe = {
    type: string;
    titre: string;
    icone: string;
    label: string;
    faits: Eleve[];
    nonFaits: Eleve[];
  };
  const ICONE_TYPE: Record<string, { icone: string; label: string }> = {
    dictee: { icone: "spellcheck", label: "Dictée" },
    correction_dictee: { icone: "rule", label: "Correction dictée" },
    qcm: { icone: "quiz", label: "QCM" },
    calcul_mental: { icone: "function", label: "Calcul mental" },
    probleme_maths: { icone: "calculate", label: "Problème" },
    lecon_copier: { icone: "edit_note", label: "Leçon à copier" },
    mots: { icone: "spellcheck", label: "Mots de la dictée" },
    exercice: { icone: "school", label: "Exercice" },
    texte_a_trous: { icone: "text_fields", label: "Texte à trous" },
    analyse_phrase: { icone: "schema", label: "Analyse de phrase" },
    classement: { icone: "category", label: "Classement" },
  };
  const groupes = new Map<string, Groupe>();
  // Compteurs par élève pour le calcul "en retard"
  const compteursEleve = new Map<string, { total: number; faits: number }>();

  for (const b of (blocs ?? []) as Array<{
    id: string;
    type: string;
    titre: string | null;
    statut: string;
    eleve_id: string | null;
    repetibox_eleve_id: number | null;
  }>) {
    if (!TYPES_PONCTUELS.has(b.type)) continue;
    const uid = b.eleve_id ? `pb_${b.eleve_id}` : b.repetibox_eleve_id !== null ? `rb_${b.repetibox_eleve_id}` : null;
    if (!uid) continue;
    const e = elevesMap.get(uid);
    if (!e) continue;

    // Compteur par élève (pour "en retard")
    let c = compteursEleve.get(uid);
    if (!c) { c = { total: 0, faits: 0 }; compteursEleve.set(uid, c); }
    c.total++;
    if (b.statut === "fait") c.faits++;

    // Groupe par (type, titre)
    const titre = b.titre ?? "Sans titre";
    const key = `${b.type}|${titre}`;
    let g = groupes.get(key);
    if (!g) {
      const meta = ICONE_TYPE[b.type] ?? { icone: "task_alt", label: b.type };
      g = {
        type: b.type,
        titre,
        icone: meta.icone,
        label: meta.label,
        faits: [],
        nonFaits: [],
      };
      groupes.set(key, g);
    }
    (b.statut === "fait" ? g.faits : g.nonFaits).push(e);
  }

  // ── Calcul du jour : pas dans plan_travail, mais dans calcul_jour_resultat
  const { data: configsCalcul } = await admin
    .from("calcul_jour")
    .select("id, niveau_id")
    .eq("date", today);
  const calculIds = (configsCalcul ?? []).map((c) => c.id as string);
  if (calculIds.length > 0) {
    // qui a réussi correctement aujourd'hui (au moins une fois)
    const { data: resCalc } = await admin
      .from("calcul_jour_resultat")
      .select("eleve_id, rb_eleve_id, correct, calcul_id")
      .in("calcul_id", calculIds);
    const aReussi = new Set<string>();
    const aTente = new Set<string>();
    for (const r of (resCalc ?? []) as Array<{ eleve_id: string | null; rb_eleve_id: number | null; correct: boolean }>) {
      const uid = r.eleve_id ? `pb_${r.eleve_id}` : r.rb_eleve_id !== null ? `rb_${r.rb_eleve_id}` : null;
      if (!uid) continue;
      aTente.add(uid);
      if (r.correct) aReussi.add(uid);
    }
    // Détermine qui est éligible au calcul du jour (élèves du bon niveau)
    // Simple : on inclut tous les élèves dont l'uid apparaît dans aTente OU
    // tous les autres élèves (assume calcul du jour ouvert à tous).
    // Pour éviter d'afficher des élèves non concernés (CE2 vs CM2), on prend
    // ceux qui ont au moins tenté. On ajoute le manquant si l'élève a au moins
    // un autre bloc aujourd'hui (sinon il est probablement absent).
    const groupeCalcul: Groupe = {
      type: "calcul_jour",
      titre: "Calcul du jour",
      icone: "function",
      label: "Calcul du jour",
      faits: [],
      nonFaits: [],
    };
    for (const e of elevesMap.values()) {
      const apparaitAujourdhui = compteursEleve.has(e.uid);
      if (!apparaitAujourdhui && !aTente.has(e.uid)) continue;
      if (aReussi.has(e.uid)) groupeCalcul.faits.push(e);
      else groupeCalcul.nonFaits.push(e);
      // intégrer dans compteurs "en retard"
      let c = compteursEleve.get(e.uid);
      if (!c) { c = { total: 0, faits: 0 }; compteursEleve.set(e.uid, c); }
      c.total++;
      if (aReussi.has(e.uid)) c.faits++;
    }
    if (groupeCalcul.faits.length + groupeCalcul.nonFaits.length > 0) {
      groupes.set("calcul_jour|Calcul du jour", groupeCalcul);
    }
  }

  // ── Problème du jour : table problem_attempts (clé student_id = auth uuid)
  // On regarde les daily_problems d'aujourd'hui.
  const { data: dailyProblems } = await admin
    .from("daily_problems")
    .select("problem_id, niveau, date")
    .eq("date", today);
  if (dailyProblems && dailyProblems.length > 0) {
    const probIds = dailyProblems.map((p) => p.problem_id as string);
    // Récupérer les tentatives sur ces problèmes aujourd'hui
    const { data: tents } = await admin
      .from("problem_attempts")
      .select("student_id, solved, problem_id, date")
      .in("problem_id", probIds)
      .eq("date", today);
    // student_id = auth uuid. Mapping vers uid : PB eleves.id == auth_id ; RB eleve.auth_id == auth_id
    const authToUid = new Map<string, string>();
    for (const e of pb ?? []) authToUid.set(e.id as string, `pb_${e.id as string}`);
    const { data: authsRB } = await admin.from("eleve").select("id, auth_id");
    for (const e of authsRB ?? []) {
      const a = (e as { auth_id?: string }).auth_id;
      if (a) authToUid.set(a, `rb_${e.id as number}`);
    }
    const aReussi = new Set<string>();
    for (const r of (tents ?? []) as Array<{ student_id: string; solved: boolean }>) {
      const uid = authToUid.get(r.student_id);
      if (uid && r.solved) aReussi.add(uid);
    }
    const groupePb: Groupe = {
      type: "daily_problem",
      titre: "Problème du jour",
      icone: "extension",
      label: "Problème du jour",
      faits: [],
      nonFaits: [],
    };
    for (const e of elevesMap.values()) {
      // On affiche pour tous les élèves qui ont au moins un bloc aujourd'hui
      const apparaitAujourdhui = compteursEleve.has(e.uid);
      if (!apparaitAujourdhui) continue;
      if (aReussi.has(e.uid)) groupePb.faits.push(e);
      else groupePb.nonFaits.push(e);
      let c = compteursEleve.get(e.uid);
      if (!c) { c = { total: 0, faits: 0 }; compteursEleve.set(e.uid, c); }
      c.total++;
      if (aReussi.has(e.uid)) c.faits++;
    }
    if (groupePb.faits.length + groupePb.nonFaits.length > 0) {
      groupes.set("daily_problem|Problème du jour", groupePb);
    }
  }

  // Tri prénoms à l'intérieur des groupes
  for (const g of groupes.values()) {
    g.faits.sort((a, b) => a.prenom.localeCompare(b.prenom));
    g.nonFaits.sort((a, b) => a.prenom.localeCompare(b.prenom));
  }

  // ── Alerte "en retard" — seuil simple : heure ≥ midi ET % < 50 ─────────
  const maintenant = new Date();
  const heureActuelle = maintenant.getHours() + maintenant.getMinutes() / 60;
  const enRetardActif = heureActuelle >= SEUIL_RETARD_HEURE;
  const enRetard: Array<{ uid: string; prenom: string; nom: string; pct: number; faits: number; total: number }> = [];
  if (enRetardActif) {
    for (const [uid, c] of compteursEleve) {
      const e = elevesMap.get(uid);
      if (!e || c.total === 0) continue;
      const pct = Math.round((c.faits / c.total) * 100);
      if (pct < SEUIL_RETARD_PCT) {
        enRetard.push({ uid, prenom: e.prenom, nom: e.nom, pct, faits: c.faits, total: c.total });
      }
    }
    enRetard.sort((a, b) => a.pct - b.pct || a.prenom.localeCompare(b.prenom));
  }

  return NextResponse.json({
    blocs: [...groupes.values()].sort((a, b) => a.label.localeCompare(b.label)),
    enRetard,
    enRetardActif,
    seuilHeure: SEUIL_RETARD_HEURE,
    seuilPct: SEUIL_RETARD_PCT,
  });
}

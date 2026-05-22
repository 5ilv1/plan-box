import { NextRequest, NextResponse } from "next/server";
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

const LABEL_TYPE: Record<string, { label: string; icone: string }> = {
  dictee: { label: "Dictée", icone: "spellcheck" },
  correction_dictee: { label: "Correction dictée", icone: "rule" },
  qcm: { label: "QCM", icone: "quiz" },
  calcul_mental: { label: "Calcul mental", icone: "function" },
  probleme_maths: { label: "Problème", icone: "calculate" },
  lecon_copier: { label: "Leçon à copier", icone: "edit_note" },
  mots: { label: "Mots", icone: "spellcheck" },
  exercice: { label: "Exercice", icone: "school" },
  texte_a_trous: { label: "Texte à trous", icone: "text_fields" },
  analyse_phrase: { label: "Analyse phrase", icone: "schema" },
  classement: { label: "Classement", icone: "category" },
  lecture: { label: "Lecture", icone: "auto_stories" },
  ecriture: { label: "Écriture", icone: "edit_note" },
  fichier_maths: { label: "Fichier maths", icone: "menu_book" },
  ressource: { label: "Podcast", icone: "podcasts" },
};

interface BlocJour {
  id: string;
  type: string;
  titre: string;
  statut: string;
  label: string;
  icone: string;
  score_eleve: number | null;
  score_total: number | null;
  pourcentage: number | null;
  /** Détail spécifique au type (QCM : score x/total, problème : réponses, calcul : opération+résultat) */
  details: null | {
    type: "qcm";
    score: number;
    total: number;
  } | {
    type: "probleme";
    reponses: Array<{ enonce: string; reponse_eleve: string | null; attendu: string }>;
  } | {
    type: "calcul";
    enonce: string;
    reponse_eleve: string | null;
    attendu: string;
    correct: boolean;
  };
}

async function blocsDuJourEleve(
  admin: ReturnType<typeof createAdminClient>,
  cible: CibleEleves
): Promise<BlocJour[]> {
  const today = new Date().toISOString().split("T")[0];
  let q = admin
    .from("plan_travail")
    .select("id, type, titre, statut, contenu")
    .eq("date_assignation", today);
  if (cible.pb_ids.length > 0) q = q.in("eleve_id", cible.pb_ids);
  else if (cible.rb_ids.length > 0) q = q.in("repetibox_eleve_id", cible.rb_ids);
  const { data } = await q;

  const blocs: BlocJour[] = (data ?? []).map((b) => {
    const meta = LABEL_TYPE[b.type as string] ?? { label: b.type as string, icone: "task_alt" };
    const c = (b.contenu ?? {}) as Record<string, unknown>;
    const se = typeof c.score_eleve === "number" ? c.score_eleve : null;
    const st = typeof c.score_total === "number" && (c.score_total as number) > 0 ? (c.score_total as number) : null;
    let pct = se !== null && st !== null ? Math.round((se / st) * 100) : null;

    let details: BlocJour["details"] = null;
    const type = b.type as string;

    // QCM : compte les bonnes réponses depuis reponses_eleve + questions.reponse_correcte.
    // Si pas de reponses_eleve mais score_eleve est dans contenu, on l'utilise.
    // Sinon on affiche "—/total" (l'élève a probablement marqué fait sans jouer).
    if (type === "qcm") {
      const questions = Array.isArray(c.questions) ? (c.questions as Array<{ reponse_correcte?: number }>) : [];
      const reponses = Array.isArray(c.reponses_eleve) ? (c.reponses_eleve as Array<{ reponse?: number; correcte?: boolean }>) : [];
      if (questions.length > 0) {
        if (reponses.length > 0) {
          let bons = 0;
          for (let i = 0; i < questions.length; i++) {
            const r = reponses[i];
            if (!r) continue;
            if (typeof r.correcte === "boolean") {
              if (r.correcte) bons++;
            } else if (typeof r.reponse === "number" && r.reponse === questions[i]?.reponse_correcte) {
              bons++;
            }
          }
          details = { type: "qcm", score: bons, total: questions.length };
          if (se === null) {
            pct = Math.round((bons / questions.length) * 100);
          }
        } else if (se !== null && st !== null) {
          // Score stocké directement
          details = { type: "qcm", score: se, total: st };
        } else {
          // Pas de réponses enregistrées : afficher juste le total avec score "—"
          details = { type: "qcm", score: -1, total: questions.length };
        }
      }
    }

    // Problème : extraire les réponses
    if (type === "probleme_maths") {
      const problemes = Array.isArray(c.problemes) ? (c.problemes as Array<{ enonce?: string; resultat_attendu?: string }>) : [];
      const reponses = Array.isArray(c.reponses_eleve) ? (c.reponses_eleve as Array<{ reponse?: string }>) : [];
      if (problemes.length > 0) {
        details = {
          type: "probleme",
          reponses: problemes.map((p, i) => ({
            enonce: p.enonce ?? "",
            reponse_eleve: reponses[i]?.reponse ?? null,
            attendu: p.resultat_attendu ?? "",
          })),
        };
      }
    }

    return {
      id: b.id as string,
      type,
      titre: (b.titre as string) ?? meta.label,
      statut: (b.statut as string) ?? "a_faire",
      label: meta.label,
      icone: meta.icone,
      score_eleve: se,
      score_total: st,
      pourcentage: pct,
      details,
    };
  });

  // ── Calcul du jour : carte virtuelle (pas dans plan_travail) ───────────
  // Récupère le calcul du jour du niveau de l'élève + sa tentative.
  const rbId = cible.rb_ids[0];
  const pbId = cible.pb_ids[0];
  if (rbId !== undefined || pbId !== undefined) {
    const { data: calculsJour } = await admin
      .from("calcul_jour")
      .select("id, operation, nombre1, nombre2, reponse")
      .eq("date", today);
    if (calculsJour && calculsJour.length > 0) {
      // On prend le 1er calcul tenté par l'élève (toutes tentatives confondues)
      const calculIds = calculsJour.map((c) => c.id as string);
      let qC = admin.from("calcul_jour_resultat").select("calcul_id, reponse_eleve, correct, tentative").in("calcul_id", calculIds);
      if (rbId !== undefined) qC = qC.eq("rb_eleve_id", rbId);
      else if (pbId !== undefined) qC = qC.eq("eleve_id", pbId);
      const { data: tentatives } = await qC.order("tentative", { ascending: false });
      if (tentatives && tentatives.length > 0) {
        const t = tentatives[0];
        const calcul = calculsJour.find((c) => c.id === t.calcul_id);
        if (calcul) {
          const op = calcul.operation as string;
          const sym = op === "addition" ? "+" : op === "soustraction" ? "−" : op === "multiplication" ? "×" : "÷";
          const enonce = `${calcul.nombre1} ${sym} ${calcul.nombre2}`;
          blocs.push({
            id: `calcul_jour_${t.calcul_id}`,
            type: "calcul_jour",
            titre: "Calcul du jour",
            statut: "fait",
            label: "Calcul du jour",
            icone: "function",
            score_eleve: t.correct ? 1 : 0,
            score_total: 1,
            pourcentage: t.correct ? 100 : 0,
            details: {
              type: "calcul",
              enonce,
              reponse_eleve: t.reponse_eleve !== null ? String(t.reponse_eleve) : null,
              attendu: String(calcul.reponse),
              correct: !!t.correct,
            },
          });
        }
      }
    }
  }

  return blocs;
}

/** Récupère le niveau (CE2/CM1/CM2) d'un élève RB via eleve_groupe → groupes.nom */
async function niveauRb(admin: ReturnType<typeof createAdminClient>, rbId: number): Promise<string | null> {
  const { data } = await admin
    .from("eleve_groupe")
    .select("groupes(nom)")
    .eq("repetibox_eleve_id", rbId);
  for (const r of data ?? []) {
    const nom = ((r as unknown as { groupes?: { nom?: string } }).groupes?.nom) ?? null;
    if (nom === "CE2" || nom === "CM1" || nom === "CM2") return nom;
  }
  return null;
}

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
  cibleId: string | null;
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
      const { data } = await admin.from("eleve").select("prenom, nom").eq("id", rb).maybeSingle();
      if (data) {
        titre = `${data.prenom ?? ""} ${data.nom ?? ""}`.trim();
        niveau = await niveauRb(admin, rb);
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

  // PlanBox via eleves.niveau_id → niveaux.nom
  const { data: pbList } = await admin.from("eleves").select("id, niveaux(nom)");
  for (const e of pbList ?? []) {
    const niv = ((e as unknown as { niveaux?: { nom?: string } }).niveaux?.nom) ?? null;
    if (niveauFiltre === "tous" || niv === niveauFiltre) cible.pb_ids.push(e.id as string);
  }

  // Repetibox via eleve_groupe → groupes.nom
  if (niveauFiltre === "tous") {
    const { data: rbList } = await admin.from("eleve").select("id");
    for (const e of rbList ?? []) cible.rb_ids.push(e.id as number);
  } else {
    // groupes.id est un UUID, donc string
    const { data: groupes } = await admin.from("groupes").select("id").eq("nom", niveauFiltre);
    const groupeIds = (groupes ?? []).map((g) => g.id as string);
    if (groupeIds.length > 0) {
      const { data: liens } = await admin
        .from("eleve_groupe")
        .select("repetibox_eleve_id")
        .in("groupe_id", groupeIds);
      const ids = new Set<number>();
      for (const l of liens ?? []) {
        const id = (l as { repetibox_eleve_id?: number }).repetibox_eleve_id;
        if (typeof id === "number") ids.add(id);
      }
      cible.rb_ids = [...ids];
    }
  }

  return {
    cible,
    titre: niveauFiltre === "tous" ? "Toute la classe" : niveauFiltre,
    sousTitre: niveauFiltre === "tous"
      ? `${cible.pb_ids.length + cible.rb_ids.length} élèves`
      : `Niveau ${niveauFiltre} · ${cible.pb_ids.length + cible.rb_ids.length} élèves`,
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

  // Ceinture (1 seul élève) — la colonne est repetibox_eleve_id, pas rb_eleve_id
  let ceinture: { index: number; nom: string; couleur: string } | null = null;
  if (inclureCeinture && cibleId) {
    const filtre = cible.rb_ids.length > 0
      ? { col: "repetibox_eleve_id", val: cible.rb_ids[0] as number | string }
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

  // Chapitres validés (uniquement pour vue élève) : evaluation_resultat.reussi = true
  let chapitresValides: Array<{ id: string; titre: string; matiere: string; sous_matiere: string | null; pourcentage: number; date: string }> = [];
  if (inclureCeinture) {
    const colEval = cible.rb_ids.length > 0 ? "rb_eleve_id" : "eleve_id";
    const valEval = cible.rb_ids.length > 0 ? cible.rb_ids[0] as number | string : cible.pb_ids[0];
    const { data: evals } = await admin
      .from("evaluation_resultat")
      .select("chapitre_id, pourcentage, created_at, reussi")
      .eq(colEval, valEval)
      .eq("reussi", true)
      .order("created_at", { ascending: false });
    if (evals && evals.length > 0) {
      // Garde le meilleur résultat par chapitre
      const parChap = new Map<string, { pct: number; date: string }>();
      for (const e of evals as Array<{ chapitre_id: string; pourcentage: number; created_at: string }>) {
        const cur = parChap.get(e.chapitre_id);
        if (!cur || e.pourcentage > cur.pct) {
          parChap.set(e.chapitre_id, { pct: e.pourcentage, date: e.created_at });
        }
      }
      const chapIds = [...parChap.keys()];
      const { data: chaps } = await admin
        .from("chapitres")
        .select("id, titre, matiere, sous_matiere")
        .in("id", chapIds);
      chapitresValides = (chaps ?? []).map((c) => {
        const r = parChap.get(c.id as string)!;
        return {
          id: c.id as string,
          titre: c.titre as string,
          matiere: c.matiere as string,
          sous_matiere: (c.sous_matiere as string | null) ?? null,
          pourcentage: r.pct,
          date: r.date,
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
    }
  }

  // ── Atelier d'écriture : nb mots écrits + % mots justes ─────────────
  // Pour chaque bloc ecriture mode semaine : on compte les mots du texte
  // (final si envoyé, sinon courant) et on soustrait les mots couverts
  // par les annotations actives du maître.
  let nbMotsEcrits = 0;
  let nbMotsCorriges = 0;
  let nbBlocsEcriture = 0;
  {
    let qE = admin.from("plan_travail").select("contenu, type").eq("type", "ecriture").eq("statut", "fait");
    if (cible.pb_ids.length > 0 && cible.rb_ids.length > 0) {
      qE = qE.or(`eleve_id.in.(${cible.pb_ids.join(",")}),repetibox_eleve_id.in.(${cible.rb_ids.join(",")})`);
    } else if (cible.pb_ids.length > 0) {
      qE = qE.in("eleve_id", cible.pb_ids);
    } else if (cible.rb_ids.length > 0) {
      qE = qE.in("repetibox_eleve_id", cible.rb_ids);
    }
    if (dateDebut) qE = qE.gte("date_assignation", dateDebut.split("T")[0]);
    const { data: blocsEc } = await qE;
    const compterMots = (s: string) => {
      const t = s?.trim() ?? "";
      return t ? t.split(/\s+/).length : 0;
    };
    for (const b of (blocsEc ?? []) as Array<{ contenu: Record<string, unknown> }>) {
      const c = b.contenu ?? {};
      if (c.mode !== "semaine") continue;
      const texte = (c.texte_final as string)?.trim() || (c.texte_courant as string) || "";
      const nbMotsBloc = compterMots(texte);
      if (nbMotsBloc === 0) continue;
      nbBlocsEcriture++;
      nbMotsEcrits += nbMotsBloc;
      const annotations = Array.isArray(c.annotations) ? (c.annotations as Array<{ extrait?: string; statut?: string }>) : [];
      for (const a of annotations) {
        if (a.statut === "ignoree") continue; // l'élève a choisi de garder
        nbMotsCorriges += compterMots(a.extrait ?? "");
      }
    }
  }
  const pctMotsJustes = nbMotsEcrits > 0
    ? Math.max(0, Math.round((1 - nbMotsCorriges / nbMotsEcrits) * 100))
    : null;

  // Injecte l'écriture dans la carte des domaines pour qu'elle pèse sur le
  // score global Français. Pondération = nb de mots écrits.
  if (pctMotsJustes !== null && nbMotsEcrits > 0) {
    carte["Écriture"] = { score: pctMotsJustes, nb_essais: nbMotsEcrits };
  }

  // Scores matières — calculés APRÈS l'injection écriture pour qu'elle compte
  const fr = scoreMatiereDepuis(carte, SOUS_DOMAINES_FR);
  const maths = scoreMatiereDepuis(carte, SOUS_DOMAINES_MATHS);

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
    blocsDuJour: inclureCeinture ? await blocsDuJourEleve(admin, cible) : [],
    ecriture: {
      nb_blocs: nbBlocsEcriture,
      nb_mots_ecrits: nbMotsEcrits,
      nb_mots_corriges: nbMotsCorriges,
      pct_mots_justes: pctMotsJustes,
      // Pour la vue classe : moyenne par texte (plus parlant que la somme)
      nb_mots_moyen: nbBlocsEcriture > 0 ? Math.round(nbMotsEcrits / nbBlocsEcriture) : 0,
    },
    niveau: niveauUnique,
    cibleType: inclureCeinture ? "eleve" : "classe",
    chapitresValides,
  });
}

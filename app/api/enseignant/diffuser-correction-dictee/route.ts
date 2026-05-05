import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/enseignant/diffuser-correction-dictee?jours=7
 * Liste les dictées assignées récemment groupées par (dictee_parent_id, date_assignation),
 * avec le statut de diffusion de la correction et le nombre d'élèves concernés.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const portee = url.searchParams.get("portee") ?? "semaine"; // 'semaine' | 'jours'
  const joursRaw = parseInt(url.searchParams.get("jours") ?? "7", 10);
  const jours = Math.min(Math.max(isNaN(joursRaw) ? 7 : joursRaw, 1), 90);

  // Calcul de la fenêtre : par défaut "cette semaine" (lundi → dimanche).
  // Alternative "jours" = les N derniers jours jusqu'à aujourd'hui (sans futur).
  const aujourdhui = new Date();
  const toIsoDate = (d: Date) => d.toISOString().split("T")[0];

  let depuisIso: string;
  let jusquIso: string;

  if (portee === "semaine") {
    // Europe : lundi = premier jour. Date#getDay() : dimanche=0, lundi=1…samedi=6
    const jour = aujourdhui.getDay();
    const decalLundi = jour === 0 ? 6 : jour - 1;
    const lundi = new Date(aujourdhui);
    lundi.setDate(aujourdhui.getDate() - decalLundi);
    const dimanche = new Date(lundi);
    dimanche.setDate(lundi.getDate() + 6);
    depuisIso = toIsoDate(lundi);
    jusquIso = toIsoDate(dimanche);
  } else {
    const depuis = new Date(aujourdhui);
    depuis.setDate(aujourdhui.getDate() - jours);
    depuisIso = toIsoDate(depuis);
    jusquIso = toIsoDate(aujourdhui);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plan_travail")
    .select("id, titre, date_assignation, statut, correction_diffusee_le, contenu, eleve_id, repetibox_eleve_id")
    .eq("type", "dictee")
    .gte("date_assignation", depuisIso)
    .lte("date_assignation", jusquIso)
    .order("date_assignation", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[dictees-diffusion][GET]", error);
    return NextResponse.json({ erreur: "Erreur base de données" }, { status: 500 });
  }

  type Row = {
    id: string;
    titre: string;
    date_assignation: string;
    statut: string;
    correction_diffusee_le: string | null;
    contenu: { dictee_parent_id?: string; niveau_etoiles?: number; titre?: string } | null;
    eleve_id: string | null;
    repetibox_eleve_id: number | null;
  };

  // Regrouper par (dictee_parent_id, date_assignation) : 1 ligne = 1 dictée du jour
  const groupes = new Map<string, {
    dictee_parent_id: string;
    date_assignation: string;
    titre: string;
    niveau_etoiles: number | null;
    nb_eleves: number;
    nb_faits: number;
    correction_diffusee_le: string | null;
    blocs_ids: string[];
  }>();

  for (const r of (data ?? []) as Row[]) {
    const pid = r.contenu?.dictee_parent_id;
    if (!pid) continue;
    const key = `${pid}|${r.date_assignation}`;
    const g = groupes.get(key);
    if (!g) {
      groupes.set(key, {
        dictee_parent_id: pid,
        date_assignation: r.date_assignation,
        titre: r.contenu?.titre ?? r.titre,
        niveau_etoiles: r.contenu?.niveau_etoiles ?? null,
        nb_eleves: 1,
        nb_faits: r.statut === "fait" ? 1 : 0,
        correction_diffusee_le: r.correction_diffusee_le,
        blocs_ids: [r.id],
      });
    } else {
      g.nb_eleves++;
      if (r.statut === "fait") g.nb_faits++;
      // On considère diffusé dès qu'un bloc l'est (cohérence attendue)
      if (r.correction_diffusee_le && !g.correction_diffusee_le) {
        g.correction_diffusee_le = r.correction_diffusee_le;
      }
      g.blocs_ids.push(r.id);
    }
  }

  const liste = [...groupes.values()].sort((a, b) =>
    b.date_assignation.localeCompare(a.date_assignation),
  );

  return NextResponse.json({ dictees: liste });
}

/**
 * POST /api/enseignant/diffuser-correction-dictee
 * Body: { dictee_parent_id: string, date_assignation: string, diffuser?: boolean }
 *       ou { bloc_id: string, diffuser?: boolean }
 *
 * Quand diffuser=true :
 *  - Marque correction_diffusee_le = now() sur les blocs dictée ciblés
 *  - Crée un VRAI bloc plan_travail de type "correction_dictee" pour chaque
 *    élève concerné (pas de doublon si déjà existant)
 *  → les élèves voient apparaître "Correction de la dictée" dans leur
 *    section "À faire sur le cahier" du dashboard.
 *
 * Quand diffuser=false :
 *  - Remet correction_diffusee_le = null
 *  - Supprime les blocs correction_dictee associés
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  let body: {
    dictee_parent_id?: string;
    date_assignation?: string;
    bloc_id?: string;
    diffuser?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreur: "Body JSON invalide" }, { status: 400 });
  }

  const diffuser = body.diffuser !== false; // défaut true
  const nouvelleValeur = diffuser ? new Date().toISOString() : null;

  const admin = createAdminClient();

  // ── Étape 1 : récupérer les dictées cibles (pour alimenter la création / suppression des blocs correction) ──
  let selectQuery = admin
    .from("plan_travail")
    .select("id, titre, date_assignation, eleve_id, repetibox_eleve_id, groupe_label, chapitre_id, contenu")
    .eq("type", "dictee");

  if (body.bloc_id) {
    selectQuery = selectQuery.eq("id", body.bloc_id);
  } else if (body.dictee_parent_id && body.date_assignation) {
    selectQuery = selectQuery
      .eq("contenu->>dictee_parent_id", body.dictee_parent_id)
      .eq("date_assignation", body.date_assignation);
  } else {
    return NextResponse.json(
      { erreur: "bloc_id OU (dictee_parent_id + date_assignation) requis" },
      { status: 400 },
    );
  }

  const { data: cibles, error: erreurSelect } = await selectQuery;
  if (erreurSelect) {
    console.error("[diffuser-correction-dictee][select]", erreurSelect);
    return NextResponse.json({ erreur: "Erreur lecture" }, { status: 500 });
  }

  type Cible = {
    id: string;
    titre: string;
    date_assignation: string;
    eleve_id: string | null;
    repetibox_eleve_id: number | null;
    groupe_label: string | null;
    chapitre_id: string | null;
    contenu: {
      dictee_parent_id?: string;
      titre?: string;
      texte?: string;
      phrases?: { id: number; texte: string }[];
      niveau_etoiles?: number;
    } | null;
  };
  const ciblesTyped = (cibles ?? []) as Cible[];

  if (ciblesTyped.length === 0) {
    return NextResponse.json({ ok: true, blocs_mis_a_jour: 0, corrections_creees: 0, diffuse: diffuser });
  }

  // ── Étape 2 : mise à jour du flag correction_diffusee_le ──
  const idsDictee = ciblesTyped.map((c) => c.id);
  const { error: erreurUpd } = await admin
    .from("plan_travail")
    .update({ correction_diffusee_le: nouvelleValeur })
    .in("id", idsDictee);

  if (erreurUpd) {
    console.error("[diffuser-correction-dictee][update]", erreurUpd);
    return NextResponse.json({ erreur: "Erreur mise à jour" }, { status: 500 });
  }

  let correctionsCreees = 0;
  let correctionsSupprimees = 0;

  if (diffuser) {
    // ── Étape 3a : créer les blocs correction_dictee manquants ──
    // Un correction_dictee existe-t-il déjà pour chaque dictée cible ?
    const { data: existants } = await admin
      .from("plan_travail")
      .select("contenu")
      .eq("type", "correction_dictee")
      .in("contenu->>parent_bloc_id", idsDictee);

    const dejaCrees = new Set<string>();
    for (const e of (existants ?? []) as { contenu: { parent_bloc_id?: string } | null }[]) {
      const pid = e.contenu?.parent_bloc_id;
      if (pid) dejaCrees.add(pid);
    }

    // La correction apparaît dans le tableau de bord élève le JOUR DE LA
    // DIFFUSION, pas le jour de la dictée originale. Si le maître diffuse
    // jeudi après-midi, les élèves la voient jeudi. S'il diffuse plus tard
    // ou plus tôt, ça suit la décision du maître.
    const aujourdhuiParis = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

    const aCreer = ciblesTyped
      .filter((c) => !dejaCrees.has(c.id))
      .map((c) => {
        const texteAttendu = c.contenu?.texte
          || c.contenu?.phrases?.map((p) => p.texte).join(" ")
          || "";
        return {
          titre: `Correction — ${c.contenu?.titre ?? c.titre}`,
          type: "correction_dictee" as const,
          eleve_id: c.eleve_id,
          repetibox_eleve_id: c.repetibox_eleve_id,
          date_assignation: aujourdhuiParis,
          statut: "a_faire" as const,
          chapitre_id: c.chapitre_id,
          groupe_label: c.groupe_label,
          contenu: {
            parent_bloc_id: c.id,
            dictee_parent_id: c.contenu?.dictee_parent_id ?? null,
            titre: c.contenu?.titre ?? c.titre,
            texte: texteAttendu,
            niveau_etoiles: c.contenu?.niveau_etoiles ?? null,
            origine_date_assignation: c.date_assignation,
          },
        };
      });

    if (aCreer.length > 0) {
      const { error: erreurIns, data: inseres } = await admin
        .from("plan_travail")
        .insert(aCreer)
        .select("id");
      if (erreurIns) {
        console.error("[diffuser-correction-dictee][insert]", erreurIns);
      } else {
        correctionsCreees = inseres?.length ?? 0;
      }
    }
  } else {
    // ── Étape 3b : supprimer les blocs correction_dictee associés ──
    const { error: erreurDel, data: supprimes } = await admin
      .from("plan_travail")
      .delete()
      .eq("type", "correction_dictee")
      .in("contenu->>parent_bloc_id", idsDictee)
      .select("id");
    if (erreurDel) {
      console.error("[diffuser-correction-dictee][delete]", erreurDel);
    } else {
      correctionsSupprimees = supprimes?.length ?? 0;
    }
  }

  return NextResponse.json({
    ok: true,
    blocs_mis_a_jour: ciblesTyped.length,
    corrections_creees: correctionsCreees,
    corrections_supprimees: correctionsSupprimees,
    diffuse: diffuser,
  });
}
